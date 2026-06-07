import { Router, Request, Response } from "express";
import { runGrantAnalysis } from "../agent";
import { runRedTeamReview, runCompetitiveIntel, runNarrativeRefinement } from "../agents/multiAgent";
import type { RefinementHandoffPayload } from "../agents/multiAgent";
import { withSpan } from "../telemetry";

export const chatRouter = Router();

/**
 * POST /api/chat
 * Streams a full multi-agent grant analysis as Server-Sent Events.
 *
 * Parallel execution strategy:
 *  - Competitive Intel starts immediately (needs only the message text)
 *  - Main analysis runs concurrently with Competitive Intel
 *  - Red Team Review starts as soon as main analysis completes (needs its narrative)
 *  - All three results are streamed as they arrive
 *
 * SSE event order:
 *  status → reasoning_step(×6) → citations → widget → answer
 *   → agent_status(review) → review → agent_status(competitor) → competitor_intel → done
 */
chatRouter.post("/", async (req: Request, res: Response) => {
  const { message, threadId } = req.body as { message: string; threadId?: string };

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const trimmed = message.trim();

  // ─── Grant-text detection ──────────────────────────────────────────────
  // If the user has pasted substantial grant announcement text (recognizable
  // by NOFO keywords and length), prepend an explicit directive so the agent
  // analyzes THIS grant rather than defaulting to its KB.
  const GRANT_KEYWORDS = [
    "funding opportunity number",
    "notice of funding opportunity",
    "nofo",
    "award ceiling",
    "eligible applicants",
    "closing date for applications",
    "cost sharing or matching requirement",
    "category of funding activity",
    "assistance listings",
  ];
  const lowerMsg = trimmed.toLowerCase();
  const keywordHits = GRANT_KEYWORDS.filter((k) => lowerMsg.includes(k)).length;
  const isGrantTextPasted = keywordHits >= 3 && trimmed.length > 600;

  const enrichedMessage = isGrantTextPasted
    ? `IMPORTANT INSTRUCTION: The user has pasted the full text of a specific grant announcement below. You MUST analyze THIS exact grant — do NOT substitute a different grant from your knowledge base. Use the KB only to retrieve Buffalo Grove's city profile, past applications, and CIP data to evaluate BG's fit against this specific grant. If this grant is not applicable to Buffalo Grove (e.g., it's for medical research, foreign entities, or a completely different domain), say so clearly and score the match at 10% or below.\n\n---\nGRANT TEXT PROVIDED BY USER:\n${trimmed}`
    : trimmed;

  try {
    // ── Root OTel span — all 5 agent spans nest under this one trace in App Insights
    await withSpan(
      "civicgrant.orchestration",
      {
        "civicgrant.grant_query": trimmed.slice(0, 120),
        "civicgrant.session_id": threadId ?? "new",
        "civicgrant.nofo_pasted": isGrantTextPasted,
        "civicgrant.agents": "main,competitor,red_team,refinement",
      },
      async (_rootSpan) => {
    send("status", { message: "Connecting to Foundry IQ knowledge base…" });

    // ── Fire Competitive Intel immediately in background (needs only query text)
    send("agent_status", { agent: "competitor", message: "Starting competitive intelligence scan…" });
    const competitorPromise = runCompetitiveIntel(enrichedMessage).catch((err) => {
      console.error("[chat] competitor agent failed:", err);
      return null;
    });

    // Keepalive: send a heartbeat every 20s so the browser SSE connection doesn't time out
    const keepalive = setInterval(() => {
      res.write(": keepalive\n\n");
    }, 20000);

    let result;
    const streamedStepNums = new Set<number>();
    try {
      // ── Main analysis (runs concurrently with competitorPromise above)
      result = await runGrantAnalysis({
        message: enrichedMessage,
        threadId,
        onRetrying: (waitMs) => {
          send("status", { message: `AI model rate limit reached — retrying in ${Math.round(waitMs / 1000)}s…` });
        },
        onChunk: (chunk) => {
          send("answer_chunk", { content: chunk });
        },
        onReasoningStep: (step) => {
          streamedStepNums.add(step.step);
          send("reasoning_step", step);
        },
      });
    } finally {
      clearInterval(keepalive);
    }

    // Fallback: emit any steps not already streamed mid-response
    for (const step of result.reasoningSteps) {
      if (step.completed && !streamedStepNums.has(step.step)) {
        send("reasoning_step", step);
      }
    }

    if (result.citations.length > 0) send("citations", { citations: result.citations });
    if (result.widget) send("widget", result.widget);

    // Strip widget block — widget was already sent separately
    let displayText = result.response.replace(/```widget[\s\S]*?```/g, "").trim();

    // Rebuild from steps if response was entirely inside the widget block
    if (!displayText && result.reasoningSteps.length > 0) {
      displayText = result.reasoningSteps
        .filter(s => s.completed && s.content)
        .map(s => `## Step ${s.step} — ${s.label}\n${s.content}`)
        .join("\n\n");
    }

    // Last resort: send the raw response so the user always sees something
    if (!displayText) {
      displayText = result.response.trim();
    }

    // If still empty after all fallbacks, surface a meaningful message
    if (!displayText) {
      displayText = "The analysis completed but the AI model returned an empty response. Please try again.";
    }

    send("answer", { threadId: result.threadId, runId: result.runId, content: displayText });

    // ── Red Team Review — starts right after main analysis (needs narrative)
    const widgetData = result.widget?.data as {
      grantName?: string;
      matchScore?: number;
      narrativeDraft?: string;
      gaps?: Array<{ title: string; severity: string; suggestion: string }>;
      strengths?: string[];
    } | undefined;

    const grantName = widgetData?.grantName ?? trimmed.slice(0, 80);
    const matchScore = widgetData?.matchScore ?? 65;
    const narrativeDraft = widgetData?.narrativeDraft ?? displayText.slice(0, 2000);

    send("agent_status", { agent: "review", message: "Red Team reviewing draft narrative…" });
    const reviewPromise = runRedTeamReview(grantName, narrativeDraft, matchScore).catch((err) => {
      console.error("[chat] red team agent failed:", err);
      return null;
    });

    // ── Await both secondary agents in parallel
    const [reviewSettled, competitorSettled] = await Promise.allSettled([
      reviewPromise,
      competitorPromise,
    ]);

    if (reviewSettled.status === "fulfilled" && reviewSettled.value) {
      send("review", reviewSettled.value);
    }

    if (competitorSettled.status === "fulfilled" && competitorSettled.value) {
      // Patch grant name if it came back as the raw query
      const comp = competitorSettled.value;
      if (!comp.grantName || comp.grantName.length > 80) comp.grantName = grantName;
      send("competitor_intel", comp);
    }

    // ── Feedback loop: Refinement agent rewrites the narrative using Red Team + Competitor data
    const reviewResult = reviewSettled.status === "fulfilled" ? reviewSettled.value : null;
    const competitorResult = competitorSettled.status === "fulfilled" ? competitorSettled.value : null;

    // Only refine if we have Red Team fixes or competitor differentiators, and there's a narrative
    const hasNarrative = narrativeDraft.length > 100;
    const hasFixes = (reviewResult?.quickFixes?.length ?? 0) > 0;
    const hasDiffs = (competitorResult?.differentiators?.length ?? 0) > 0;

    if (hasNarrative && (hasFixes || hasDiffs)) {
      send("agent_status", { agent: "refinement", message: "Applying Red Team fixes + competitive insights to narrative…" });
      try {
        // Build typed handoff payload — explicit contract between agents
        const handoff: RefinementHandoffPayload = {
          originalNarrative: narrativeDraft,
          grantName,
          originalMatchScore: matchScore,
          gaps: widgetData?.gaps,
          strengths: widgetData?.strengths,
          redTeam: reviewResult
            ? {
                quickFixes: reviewResult.quickFixes,
                topRisks: reviewResult.topRisks,
                overallScore: reviewResult.overallScore,
                reviewerVerdict: reviewResult.reviewerVerdict,
              }
            : undefined,
          competitor: competitorResult
            ? {
                differentiators: competitorResult.differentiators,
                strategyTip: competitorResult.strategyTip,
                competitionLevel: competitorResult.competitionLevel,
                winProbability: competitorResult.winProbability,
              }
            : undefined,
        };
        const refinement = await runNarrativeRefinement(handoff);
        send("refined_narrative", refinement);
      } catch (err) {
        console.error("[chat] refinement agent failed:", err);
      }
    }

    send("done", { threadId: result.threadId });
      } // end withSpan callback
    ); // end withSpan
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    send("error", { message: msg });
  } finally {
    res.end();
  }
});
