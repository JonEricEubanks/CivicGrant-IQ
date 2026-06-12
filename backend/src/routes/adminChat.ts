import { Router, Request, Response } from "express";
import { getOpenAIClient } from "../agent";
import { GRANT_PORTFOLIO, findGrant, buildGrantContext, portfolioStats } from "../grantPortfolio";
import { buildOntologyGrounding, buildAvailableActionsBlock, isFabricIqActive } from "../fabricIq";
import { getFabricContext, formatFabricContextForPrompt } from "./fabricIq";
import type { GrantTableRow } from "./fabricIq";
import { withSpan } from "../telemetry";

// ─── Fabric → portfolio merger ───────────────────────────────────────────────

const LIFECYCLE_STATUS: Record<string, "active" | "applied" | "closeout" | "closed" | "declined"> = {
  Active:      "active",
  Closeout:    "closeout",
  Closed:      "closed",
  UnderReview: "applied",
  Submitted:   "applied",
  Declined:    "declined",
};

/**
 * Overlay live Fabric dim_grant row onto a portfolio grant.
 * Mutates a shallow copy — only overwrites fields present in the live row.
 */
function mergeWithFabricRow(
  grant: (typeof GRANT_PORTFOLIO)[number],
  row: GrantTableRow
): (typeof GRANT_PORTFOLIO)[number] {
  const out = { ...grant };

  // Status from lifecycle_state
  const liveStatus = LIFECYCLE_STATUS[String(row.lifecycle_state ?? "")];
  if (liveStatus) (out as Record<string, unknown>).status = liveStatus;

  // Award / match amounts (Fabric is source of truth)
  if (row.award_amount != null)
    (out as Record<string, unknown>).awardAmount = Number(row.award_amount);
  if (row.city_match != null)
    (out as Record<string, unknown>).cityMatch = Number(row.city_match);
  if (row.total_project != null)
    (out as Record<string, unknown>).totalProject = Number(row.total_project);

  // Key risk — live from Fabric
  if (row.key_risk != null && String(row.key_risk).trim())
    (out as Record<string, unknown>).keyRisk = String(row.key_risk);

  // Summary — live from Fabric
  if (row.summary != null && String(row.summary).trim())
    (out as Record<string, unknown>).summary = String(row.summary);

  // Disbursed % — patch the first disbursement to reflect live pct
  if (row.pct_disbursed != null && out.disbursements.length) {
    const pct = Number(row.pct_disbursed) / 100;
    const liveAmount = Math.round(out.awardAmount * pct);
    // Update paid disbursements total without rebuilding all rows
    (out as Record<string, unknown>)._fabricPctDisbursed = Number(row.pct_disbursed);
    (out as Record<string, unknown>)._fabricDisbursed    = liveAmount;
  }

  return out;
}

/**
 * Merge the full GRANT_PORTFOLIO with live Fabric dim_grant rows.
 * Matches on grant_id (exact) or normalized grant_name substring.
 */
function mergePortfolioWithFabric(
  rows: GrantTableRow[]
): { merged: (typeof GRANT_PORTFOLIO)[number][]; liveCount: number } {
  if (!rows.length) return { merged: GRANT_PORTFOLIO, liveCount: 0 };

  let liveCount = 0;
  const merged = GRANT_PORTFOLIO.map((g) => {
    const row = rows.find(
      (r) =>
        String(r.grant_id ?? "") === g.id ||
        String(r.grant_name ?? "")
          .toLowerCase()
          .includes(g.name.toLowerCase().slice(0, 20))
    );
    if (row) { liveCount++; return mergeWithFabricRow(g, row); }
    return g;
  });
  return { merged, liveCount };
}

export const adminChatRouter = Router();

const ADMIN_SYSTEM_PROMPT = `You are CivicGrant IQ in **Grant Administration Mode**.
You are an expert post-award grant administrator helping the Village of Buffalo Grove, IL manage its active grant portfolio.

Your role covers the full post-award lifecycle:
- Disbursement tracking and reimbursement request preparation
- Milestone monitoring and schedule risk assessment
- Compliance requirement tracking (Davis-Bacon, quarterly reports, SF-425, environmental monitoring)
- Progress report drafting (quarterly, semi-annual, final)
- Risk identification and remediation recommendations
- Budget variance analysis
- Closeout preparation

## Communication Style
- Be direct and action-oriented — grant staff are busy professionals
- Lead with what's most urgent (overdue items, upcoming deadlines)
- When drafting reports or documents, output clean, professional prose ready to copy-paste
- Cite specific dollar amounts, dates, percentages, and milestone names from the grant data
- If a question is about a metric not in the provided data, say so clearly rather than estimating

## WIDGET OUTPUT
When the user asks for a status summary, budget overview, or portfolio overview, append a machine-readable widget block at the very end of your response:

\`\`\`widget
{
  "type": "grant_admin",
  "data": {
    "grantId": "<grant id or 'portfolio'>",
    "grantName": "<name>",
    "pctDisbursed": <0-100>,
    "activeMilestone": "<current in-progress milestone title>",
    "nextDeadline": { "label": "<task name>", "date": "<ISO date>", "urgency": "critical|warning|normal" },
    "complianceAlerts": ["<alert 1>", "<alert 2>"],
    "disbursedAmount": <dollars>,
    "remainingAmount": <dollars>
  }
}
\`\`\`

Only include the widget when it adds value (status overviews, budget questions). Skip it for simple factual answers or document drafts.`;

/**
 * POST /api/admin-chat
 * Streams grant administration answers as Server-Sent Events.
 *
 * Body: { grantId?: string; message: string; history?: Array<{role,content}> }
 *   - grantId: if provided, injects that grant's full data as context
 *   - If grantId is omitted, injects portfolio-level summary
 */
adminChatRouter.post("/", async (req: Request, res: Response) => {
  const { grantId, message, history } = req.body as {
    grantId?: string;
    message: string;
    history?: Array<{ role: "user" | "assistant"; content: string }>;
  };

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

  await withSpan("admin-chat", { grantId: grantId ?? "portfolio" }, async (_span) => {
    try {
      send("status", { message: "Loading grant portfolio data…" });

      // ─── Pull live Fabric data (cached 3 min, never blocks) ──────────
      let fabricRows: GrantTableRow[] = [];
      let fabricLive = false;
      try {
        const fabricCtx = await getFabricContext(false);
        if (fabricCtx.source !== "fabric-offline" && fabricCtx.grantRows.length) {
          fabricRows = fabricCtx.grantRows;
          fabricLive = true;
          send("status", { message: `Fabric IQ: loaded ${fabricRows.length} live grant records…` });
        }
      } catch {
        // Fabric unavailable — proceed with static data
      }

      // ─── Build context ────────────────────────────────────────────────
      let grantContext: string;
      let actionsBlock = "";
      if (grantId) {
        const grant = findGrant(grantId);
        if (!grant) {
          send("error", { message: `Grant "${grantId}" not found in portfolio.` });
          res.end();
          return;
        }
        // Overlay live Fabric row if available
        const liveGrant = fabricRows.length
          ? (mergePortfolioWithFabric(fabricRows).merged.find((g) => g.id === grantId) ?? grant)
          : grant;
        grantContext = buildGrantContext(liveGrant as Parameters<typeof buildGrantContext>[0]);
        actionsBlock = buildAvailableActionsBlock(liveGrant as Parameters<typeof buildAvailableActionsBlock>[0]);
      } else {
        // Portfolio-level: merge all grants with live Fabric data
        const { merged } = mergePortfolioWithFabric(fabricRows);
        const stats = portfolioStats();
        const summaryLines = [
          `PORTFOLIO SUMMARY (as of ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })})`,
          fabricLive ? `[Source: Microsoft Fabric IQ — Live GrantLakehouse data]` : `[Source: static portfolio data]`,
          `Total Awarded (active): $${stats.totalAwarded.toLocaleString()}`,
          `Total Applied (pending): $${stats.totalApplied.toLocaleString()}`,
          `Total Disbursed to Date: $${stats.totalDisbursed.toLocaleString()}`,
          `Compliance Alerts — Overdue: ${stats.overdueTasks} | Due Soon: ${stats.dueSoonTasks}`,
          ``,
          `ACTIVE GRANTS:`,
          ...merged.map((g) => `  [${(g.status as string).toUpperCase()}] ${g.name} — $${g.awardAmount.toLocaleString()} (${g.agency})`),
          ``,
          `─── GRANT DETAILS ───`,
          ...merged.filter((g) => g.status === "active").map((g) => buildGrantContext(g as Parameters<typeof buildGrantContext>[0])),
        ];
        grantContext = summaryLines.join("\n");
      }

      // ─── Fabric IQ: ground the agent in the grant-lifecycle ontology ──
      const ontologyGrounding = buildOntologyGrounding();
      if (ontologyGrounding) {
        send("status", { message: "Grounding in Fabric IQ grant-lifecycle ontology…" });
      }

      // ─── Fabric IQ live data block (key risks, lifecycle states) ─────
      let fabricLiveBlock = "";
      if (fabricLive && fabricRows.length) {
        const riskLines = fabricRows
          .filter((r) => r.key_risk && String(r.key_risk).trim())
          .map((r) => `  • ${r.grant_name} [${r.lifecycle_state}] — ${r.key_risk}`);
        if (riskLines.length) {
          fabricLiveBlock = [
            `## FABRIC IQ — LIVE GRANT STATUS (GrantLakehouse @ ${new Date().toLocaleString()})`,
            `These are the authoritative live values from the GrantLakehouse SQL Analytics endpoint.`,
            `Use these to override any static data when answering about disbursement status, lifecycle state, or risk.`,
            ``,
            `Live lifecycle states and key risks:`,
            ...riskLines,
          ].join("\n");
        }
      }

      send("status", { message: "Analyzing grant data…" });

      // ─── Build messages ───────────────────────────────────────────────
      const systemMessage = [
        ADMIN_SYSTEM_PROMPT,
        ontologyGrounding,
        fabricLiveBlock,
        `## CURRENT GRANT DATA\n${grantContext}${actionsBlock}`,
      ].filter(Boolean).join("\n\n");

      type Msg = { role: "system" | "user" | "assistant"; content: string };
      const messages: Msg[] = [{ role: "system", content: systemMessage }];

      // Inject recent conversation history (last 6 turns to stay within context)
      if (history && Array.isArray(history)) {
        const recent = history.slice(-6);
        for (const h of recent) {
          if (h.role === "user" || h.role === "assistant") {
            messages.push({ role: h.role, content: h.content });
          }
        }
      }

      messages.push({ role: "user", content: message.trim() });

      // ─── Stream response ──────────────────────────────────────────────
      send("status", { message: "Agent responding…" });

      const oai = getOpenAIClient();
      const stream = await oai.chat.completions.create({
        model: process.env.FOUNDRY_MODEL_DEPLOYMENT || "gpt-4o-mini",
        messages,
        stream: true,
        temperature: 0.3,
        max_tokens: 1200,
      });

      let fullText = "";
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? "";
        if (delta) {
          fullText += delta;
          send("answer_chunk", { content: delta });
        }
      }

      // ─── Extract widget if present ────────────────────────────────────
      const widgetMatch = fullText.match(/```widget\s*([\s\S]*?)```/);
      if (widgetMatch) {
        try {
          const widgetData = JSON.parse(widgetMatch[1]) as { type: string; data: unknown };
          send("widget", widgetData);
        } catch {
          // malformed widget — skip
        }
      }

      // Strip widget block from the display answer
      const cleanAnswer = fullText.replace(/```widget[\s\S]*?```/g, "").trim();
      send("answer", { content: cleanAnswer });
      send("done", {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      send("error", { message: `Admin agent error: ${msg}` });
    } finally {
      res.end();
    }
  });
});

/**
 * GET /api/admin-chat/portfolio
 * Returns the full grant portfolio as JSON (for initial dashboard load).
 */
adminChatRouter.get("/portfolio", async (_req: Request, res: Response) => {
  let fabricLive = false;
  let fabricPulledAt: string | null = null;
  let grants = GRANT_PORTFOLIO as typeof GRANT_PORTFOLIO;

  try {
    const fabricCtx = await getFabricContext(false);
    if (fabricCtx.source !== "fabric-offline" && fabricCtx.grantRows.length) {
      const { merged, liveCount } = mergePortfolioWithFabric(fabricCtx.grantRows);
      if (liveCount > 0) {
        grants = merged as typeof GRANT_PORTFOLIO;
        fabricLive = true;
        fabricPulledAt = fabricCtx.pulledAt;
      }
    }
  } catch {
    // Fabric unavailable — fall back to static data
  }

  res.json({
    grants,
    stats: portfolioStats(),
    fabricIq: isFabricIqActive(),
    fabricLive,
    fabricPulledAt,
  });
});

