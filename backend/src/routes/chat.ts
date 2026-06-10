import { Router, Request, Response } from "express";
import { runGrantAnalysis } from "../agent";
import { runRedTeamReview, runCompetitiveIntel, runNarrativeRefinement } from "../agents/multiAgent";
import type { RefinementHandoffPayload, RedTeamResult } from "../agents/multiAgent";
import { searchLocalKb } from "../localKb";
import { withSpan } from "../telemetry";
import { getCityContext } from "../graphContext";

export const chatRouter = Router();

/**
 * Orchestration decision emitted to the UI when the agent dynamically branches
 * (re-query the KB on low grounding, conditionally spawn the Red Team, etc.).
 */
interface OrchestrationDecision {
  id?: string;
  kind: "route" | "requery";
  label: string;
  detail: string;
  signal: { matchScore: number; grounding: number; threshold: number };
  branch?: string;
}

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

  // ─── Follow-up detection ───────────────────────────────────────────────
  // A message is a follow-up when there is an existing Assistants API thread
  // AND the question is about a prior analysis rather than requesting a new one.
  // Follow-ups skip the expensive multi-agent fan-out (Competitor Intel + Red Team)
  // since those already ran for the initial analysis.
  const FOLLOWUP_SIGNALS = [
    "how do", "how can", "how would", "what should", "what department",
    "give me", "can you", "explain", "expand on", "more detail", "more about",
    "close the", "close this", "address the", "fix the",
    "which department", "who owns", "who is responsible",
    "timeline for", "next steps", "what's next", "what is next",
    "step ", "the gap", "this gap", "that gap", "the score",
    "the narrative", "the analysis", "that grant", "this program",
    "action items", "priority", "first step", "second step",
    "what does", "what is the", "why did", "why is",
    // Competitive / comparison follow-ups
    "who else", "which cities", "which municipalities", "which illinois",
    "compet", "compare", "how does buffalo", "past winning", "other applicants",
    "boost", "raise our", "improve our", "increase our score",
    "what are the", "what were the", "tell me more",
  ];
  const isFollowUp =
    !!threadId?.startsWith("thread_") &&
    !isGrantTextPasted &&
    trimmed.length < 400 &&
    FOLLOWUP_SIGNALS.some((sig) => lowerMsg.includes(sig));

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
        "civicgrant.is_followup": isFollowUp,
        "civicgrant.agents": isFollowUp ? "main" : "main,competitor,red_team,refinement",
      },
      async (_rootSpan) => {
    // Tell the UI up front whether this is a follow-up reply or a full analysis,
    // so it can render the answer as a plain reply (follow-up) vs. a report (analysis).
    send("meta", { isFollowUp });
    send("status", { message: isFollowUp ? "Looking up context from your session…" : "Connecting to Microsoft 365 Work IQ context…" });
    const cityContext = await getCityContext(false);
    send("work_iq_context", cityContext);
    send("status", { message: cityContext.source === "sharepoint" ? "SharePoint city context loaded from Microsoft Graph." : "Using local Work IQ context fallback." });

    // ── For follow-ups: skip Competitor Intel — that already ran for the initial query
    const competitorPromise = isFollowUp
      ? Promise.resolve(null)
      : (() => {
          send("agent_status", { agent: "competitor", message: "Starting competitive intelligence scan…" });
          return runCompetitiveIntel(enrichedMessage).catch((err) => {
            console.error("[chat] competitor agent failed:", err);
            return null;
          });
        })();

    // Keepalive: send a heartbeat every 20s so the browser SSE connection doesn't time out
    const keepalive = setInterval(() => {
      res.write(": keepalive\n\n");
    }, 20000);

    // Progressive status messages — fires every ~10s while the AI is reasoning
    // so the UI shows meaningful activity instead of silence during the first response.
    // Messages are truthful: the agent IS doing these things in sequence.
    // Cleared automatically when the first reasoning step arrives.
    const PROGRESS_STATUSES = isFollowUp ? [] : [
      "Searching Buffalo Grove municipal documents\u2026",
      "Cross-referencing Capital Improvement Plan\u2026",
      "Evaluating federal eligibility requirements\u2026",
      "Scoring grant match and gap severity\u2026",
      "Drafting project narrative\u2026",
    ];
    let progressIdx = 0;
    let firstStepReceived = false;
    const progressInterval = setInterval(() => {
      if (!firstStepReceived && progressIdx < PROGRESS_STATUSES.length) {
        send("status", { message: PROGRESS_STATUSES[progressIdx++] });
      }
    }, 10000);

    let result;
    const streamedStepNums = new Set<number>();
    try {
      // ── Main analysis (runs concurrently with competitorPromise above)
      result = await runGrantAnalysis({
        message: enrichedMessage,
        threadId,
        cityContext,
        onRetrying: (waitMs) => {
          send("status", { message: `AI model rate limit reached — retrying in ${Math.round(waitMs / 1000)}s\u2026` });
        },
        onChunk: (chunk) => {
          send("answer_chunk", { content: chunk });
        },
        onReasoningStep: (step) => {
          if (!firstStepReceived) {
            firstStepReceived = true;
            clearInterval(progressInterval);
          }
          streamedStepNums.add(step.step);
          send("reasoning_step", step);
        },
      });
    } finally {
      clearInterval(progressInterval);
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

    // Emit GraphRAG reasoning paths for frontend visualization
    if (result.graphPaths && result.graphPaths.length > 0) {
      send("graph_paths", { paths: result.graphPaths });
    }

    // Emit which tier of the LLM fallback chain handled this request
    if (result.tier) {
      const TIER_LABELS: Record<number, string> = {
        1: "Azure AI Foundry Assistants API + Foundry IQ MCP",
        2: "Azure OpenAI Chat Completions + AI Search KB",
        3: "Deterministic Mock Engine (zero credentials)",
      };
      send("tier_info", {
        tier: result.tier,
        label: TIER_LABELS[result.tier] ?? "Unknown",
        guardrailsPassed: (result.guardrailViolations ?? []).filter(v => v.level === "BLOCK").length === 0,
        violations: (result.guardrailViolations ?? []).length,
      });
    }

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

    // ── DYNAMIC ORCHESTRATION ROUTER ──────────────────────────────────────
    // For follow-up questions, skip all orchestration — the user just wants
    // a direct answer from the thread context; no need for re-scoring, red team,
    // or competitive intel on what is already an existing analysis.
    if (isFollowUp) {
      send("done", {});
      return;
    }

    const VIABILITY_BAR = 55;
    const GROUNDING_BAR = 2;
    const grounding = result.citations.length;
    let decisionSeq = 0;
    const sendDecision = (d: OrchestrationDecision) =>
      send("decision", { ...d, id: `dec-${++decisionSeq}` });

    // ── Decision 1: low grounding → autonomously RE-QUERY the knowledge base
    if (grounding < GROUNDING_BAR) {
      sendDecision({
        kind: "requery",
        label: "Low grounding confidence",
        detail: `Only ${grounding} source${grounding === 1 ? "" : "s"} backed this analysis (bar: ${GROUNDING_BAR}). Re-querying the knowledge base for deeper grounding…`,
        signal: { matchScore, grounding, threshold: GROUNDING_BAR },
        branch: "kb:requery",
      });
      const requery = searchLocalKb(`${grantName} ${trimmed}`, 5);
      const existingTitles = new Set(result.citations.map((c) => c.title));
      const added = requery.citations.filter((c) => !existingTitles.has(c.title));
      if (added.length > 0) {
        const merged = [...result.citations, ...added];
        send("citations", { citations: merged });
        sendDecision({
          kind: "requery",
          label: "Re-query recovered grounding",
          detail: `Re-query surfaced ${added.length} additional source${added.length === 1 ? "" : "s"} — grounding raised from ${grounding} to ${merged.length}.`,
          signal: { matchScore, grounding: merged.length, threshold: GROUNDING_BAR },
          branch: "kb:requery_done",
        });
      } else {
        sendDecision({
          kind: "requery",
          label: "Re-query complete",
          detail: `No sources beyond the ${grounding} already cited — proceeding with current grounding.`,
          signal: { matchScore, grounding, threshold: GROUNDING_BAR },
          branch: "kb:requery_done",
        });
      }
    }

    // ── Decision 2: viability gate → conditionally spawn the Red Team
    const viable = matchScore >= VIABILITY_BAR;
    let reviewPromise: Promise<RedTeamResult | null> = Promise.resolve(null);
    if (viable) {
      sendDecision({
        kind: "route",
        label: "Viable → adversarial review",
        detail: `Match ${matchScore}% ≥ ${VIABILITY_BAR}% viability bar → spawning Red Team to harden a fundable application.`,
        signal: { matchScore, grounding, threshold: VIABILITY_BAR },
        branch: "red_team:spawn",
      });
      send("agent_status", { agent: "review", message: "Red Team reviewing draft narrative…" });
      reviewPromise = runRedTeamReview(grantName, narrativeDraft, matchScore).catch((err) => {
        console.error("[chat] red team agent failed:", err);
        return null;
      });
    } else {
      sendDecision({
        kind: "route",
        label: "Below bar → skip review",
        detail: `Match ${matchScore}% < ${VIABILITY_BAR}% viability bar → skipping Red Team (not a fundable fit); routing effort to gap analysis instead.`,
        signal: { matchScore, grounding, threshold: VIABILITY_BAR },
        branch: "red_team:skip",
      });
    }

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
