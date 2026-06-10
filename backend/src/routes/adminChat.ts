import { Router, Request, Response } from "express";
import { getOpenAIClient } from "../agent";
import { GRANT_PORTFOLIO, findGrant, buildGrantContext, portfolioStats } from "../grantPortfolio";
import { withSpan } from "../telemetry";

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

      // ─── Build context ────────────────────────────────────────────────
      let grantContext: string;
      if (grantId) {
        const grant = findGrant(grantId);
        if (!grant) {
          send("error", { message: `Grant "${grantId}" not found in portfolio.` });
          res.end();
          return;
        }
        grantContext = buildGrantContext(grant);
      } else {
        // Portfolio-level: include all grants + summary stats
        const stats = portfolioStats();
        const summaryLines = [
          `PORTFOLIO SUMMARY (as of ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })})`,
          `Total Awarded (active): $${stats.totalAwarded.toLocaleString()}`,
          `Total Applied (pending): $${stats.totalApplied.toLocaleString()}`,
          `Total Disbursed to Date: $${stats.totalDisbursed.toLocaleString()}`,
          `Compliance Alerts — Overdue: ${stats.overdueTasks} | Due Soon: ${stats.dueSoonTasks}`,
          ``,
          `ACTIVE GRANTS:`,
          ...GRANT_PORTFOLIO.map((g) => `  [${g.status.toUpperCase()}] ${g.name} — $${g.awardAmount.toLocaleString()} (${g.agency})`),
          ``,
          `─── GRANT DETAILS ───`,
          ...GRANT_PORTFOLIO.filter((g) => g.status === "active").map((g) => buildGrantContext(g)),
        ];
        grantContext = summaryLines.join("\n");
      }

      send("status", { message: "Analyzing grant data…" });

      // ─── Build messages ───────────────────────────────────────────────
      const systemMessage = `${ADMIN_SYSTEM_PROMPT}\n\n## CURRENT GRANT DATA\n${grantContext}`;

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
adminChatRouter.get("/portfolio", (_req: Request, res: Response) => {
  res.json({ grants: GRANT_PORTFOLIO, stats: portfolioStats() });
});
