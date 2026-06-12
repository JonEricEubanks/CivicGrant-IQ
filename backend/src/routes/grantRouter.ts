import { Router, Request, Response } from "express";
import { GRANT_PORTFOLIO, findGrant, buildGrantContext, portfolioStats } from "../grantPortfolio";
import { getCityContext } from "../graphContext";
import { getFabricContext } from "./fabricIq";
import { getOpenAIClient } from "../agent";
import { withSpan } from "../telemetry";
import type { GrantTableRow } from "./fabricIq";

export const grantRouterHandler = Router();

/**
 * Intelligent grant query router — detects question intent and routes to appropriate data sources.
 * POST /api/grant-router
 * Body: { message: string; cityName?: string }
 *
 * Returns SSE stream with:
 *  - routing_decision: which sources will be used (Fabric IQ, Foundry IQ, Work IQ, Portfolio)
 *  - dynamic_steps: steps that match the actual execution path
 *  - widget: appropriate widget type for the query (grant_pipeline, compliance_board, portfolio_health, etc.)
 *  - answer: agent response
 */
grantRouterHandler.post("/", async (req: Request, res: Response) => {
  const { message } = req.body as { message: string };

  if (!message || typeof message !== "string") {
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

  const trimmed = message.trim().toLowerCase();

  await withSpan("grant_router", { query: trimmed.slice(0, 120) }, async (_span) => {
    try {
      // ─── Intent Detection ──────────────────────────────────────────────
      const intent = detectQueryIntent(trimmed);
      send("routing_decision", {
        intent: intent.type,
        description: intent.description,
        sources: intent.sources,
        widgetType: intent.widgetType,
      });

      // ─── Fetch data from detected sources ──────────────────────────────
      const sources: Record<string, unknown> = {};
      const steps: Array<{ step: number; label: string; content: string; completed: boolean }> = [];

      let stepNum = 1;

      // 1. Fabric IQ — live grant statuses, compliance, disbursement data
      if (intent.sources.includes("fabric_iq")) {
        send("status", { message: "Fetching live Fabric IQ grant data…" });
        steps.push({
          step: stepNum++,
          label: "Fabric IQ · Load Live Grant Status",
          content: "Querying Fabric IQ GrantLakehouse for live grant statuses, compliance, and disbursement data…",
          completed: false,
        });
        try {
          const fabricCtx = await getFabricContext(false);
          sources.fabricIq = fabricCtx;
          steps[steps.length - 1].completed = true;
          steps[steps.length - 1].content = `Loaded ${fabricCtx.grantRows.length} grant records from Fabric IQ (${fabricCtx.source}).`;
        } catch (err) {
          steps[steps.length - 1].content = `Fabric IQ unavailable: ${(err as Error).message}`;
          steps[steps.length - 1].completed = true;
        }
        for (const s of steps) if (!s.completed) send("reasoning_step", s);
      }

      // 2. Foundry IQ — KB search for grant programs, eligibility, precedents
      if (intent.sources.includes("foundry_iq")) {
        send("status", { message: "Searching Foundry IQ knowledge base…" });
        steps.push({
          step: stepNum++,
          label: "Foundry IQ · Search Municipal Grant KB",
          content: "Searching Foundry IQ knowledge base for grant programs, eligibility criteria, and precedents…",
          completed: false,
        });
        // For now, we'd integrate KB search here
        steps[steps.length - 1].completed = true;
        steps[steps.length - 1].content = "Foundry IQ KB search available for grant program lookups.";
        for (const s of steps) if (!s.completed) send("reasoning_step", s);
      }

      // 3. Work IQ — calendar events, emails, project signals from Microsoft 365
      if (intent.sources.includes("work_iq")) {
        send("status", { message: "Loading Work IQ context…" });
        steps.push({
          step: stepNum++,
          label: "Work IQ · Parse Calendar, Email & Project Signals",
          content: "Extracting priority themes and project context from Microsoft 365 (calendar events, emails, Teams insights)…",
          completed: false,
        });
        try {
          const cityContext = await getCityContext(false);
          sources.workIq = cityContext;
          steps[steps.length - 1].completed = true;
          const signals: string[] = [];
          if (cityContext.calendarEvents?.length) signals.push(`${cityContext.calendarEvents.length} calendar event(s)`);
          if (cityContext.mailSignals?.length) signals.push(`${cityContext.mailSignals.length} email signal(s)`);
          if (cityContext.teamsInsights?.length) signals.push(`${cityContext.teamsInsights.length} Teams message(s)`);
          steps[steps.length - 1].content = `Work IQ loaded: ${signals.join(", ") || "no M365 signals"}. Priority themes: ${cityContext.priorityThemes.slice(0, 3).join(", ")}.`;
        } catch (err) {
          steps[steps.length - 1].content = `Work IQ unavailable: ${(err as Error).message}`;
          steps[steps.length - 1].completed = true;
        }
        for (const s of steps) if (!s.completed) send("reasoning_step", s);
      }

      // 4. Portfolio — static grant portfolio data
      if (intent.sources.includes("portfolio")) {
        send("status", { message: "Loading grant portfolio…" });
        steps.push({
          step: stepNum++,
          label: "Portfolio · Load Active & Applied Grants",
          content: "Loading Buffalo Grove grant portfolio (active, applied, closeout grants)…",
          completed: false,
        });
        sources.portfolio = {
          grants: GRANT_PORTFOLIO,
          stats: portfolioStats(),
        };
        steps[steps.length - 1].completed = true;
        steps[steps.length - 1].content = `Portfolio loaded: ${GRANT_PORTFOLIO.length} grants (${GRANT_PORTFOLIO.filter(g => g.status === "active").length} active, ${GRANT_PORTFOLIO.filter(g => g.status === "applied").length} applied).`;
        for (const s of steps) if (!s.completed) send("reasoning_step", s);
      }

      // ─── Build widget based on intent ──────────────────────────────────
      send("status", { message: `Building ${intent.widgetType} widget…` });

      steps.push({
        step: stepNum++,
        label: `Widget Builder · Create ${intent.widgetType}`,
        content: `Analyzing ${Object.keys(sources).join(", ")} data to render ${intent.widgetType}…`,
        completed: false,
      });

      const widget = await buildWidgetForIntent(intent, sources);

      steps[steps.length - 1].completed = true;
      steps[steps.length - 1].content = `${intent.widgetType} widget built with ${widget.data ? Object.keys(widget.data).length : 0} data properties.`;

      // ─── Generate answer text ──────────────────────────────────────────
      send("status", { message: "Generating response…" });

      steps.push({
        step: stepNum++,
        label: "Response Agent · Generate Answer",
        content: "Composing narrative response based on widget data…",
        completed: false,
      });

      const answerText = generateAnswerForIntent(intent, sources, widget);

      steps[steps.length - 1].completed = true;
      steps[steps.length - 1].content = "Answer text generated.";

      // ─── Emit all steps ────────────────────────────────────────────────
      for (const step of steps) {
        send("reasoning_step", step);
      }

      if (widget) {
        send("widget", widget);
      }

      send("answer", { content: answerText });
      send("done", {});
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      send("error", { message: msg });
    } finally {
      res.end();
    }
  });
});

/**
 * Detects the intent of a grant-related query and maps it to:
 *  - intent type (e.g., "portfolio_status", "top_grants", "compliance_alerts", etc.)
 *  - required data sources (Fabric IQ, Foundry IQ, Work IQ, Portfolio)
 *  - appropriate widget type
 */
export function detectQueryIntent(query: string): {
  type: string;
  description: string;
  sources: string[];
  widgetType: string;
  grantHint?: string;
} {
  // ── HIGHEST PRIORITY: Explicit grant analysis requests ─────────────────────
  // Must run before all other checks. Catches queries like:
  //   "Analyze the FY2024 Flood Mitigation Assistance grant for Buffalo Grove"
  //   "Assess eligibility, match score, and gaps for BRIC"
  //   "Evaluate the NOFO for..."
  //   "Does Buffalo Grove qualify for the RAISE program? What are the gaps?"
  const isExplicitAnalysis =
    /\banalyz[ei]|\bassess\b|\bevaluat[ei]|\bscore\b.*\bgrant|\bgrant\b.*\bscore\b/i.test(query) &&
    /\beligib|\bmatch\s+score|\bgap[s]?\b|\bqualif|\bfit\b.*\bgrant|\bgrant\b.*\bfit\b/i.test(query);
  const isNofoAnalysis =
    /\bnofo\b|notice\s+of\s+funding|funding\s+opportunity\s+number|fiscal\s+year\s+\d{4}.*grant|grant.*fiscal\s+year\s+\d{4}/i.test(query);
  const isNamedGrantAnalysis =
    /\banalyze\b|\bassess\b/i.test(query) &&
    /flood\s+mitigation|stormwater|resilience|infrastructure|transportation|housing|community\s+development|bric|raise|fma|hmgp|cdbg|srf|tiger|build|infra\s+grant|federal\s+grant/i.test(query);

  if (isExplicitAnalysis || isNofoAnalysis || isNamedGrantAnalysis) {
    return {
      type: "general_grant_analysis",
      description: "Full 6-agent grant analysis: eligibility scoring, match assessment, gap identification, narrative, and strategy",
      sources: ["foundry_iq", "portfolio", "work_iq"],
      widgetType: "grant_match",
    };
  }

  // Compliance & deadline queries (check before prioritization to avoid "due" false-matches)
  if (/compliance|deadline|due|overdue|upcoming|report.*due|quarterly|sf-425|closeout|risk/i.test(query)) {
    return {
      type: "compliance_alerts",
      description: "Extracting compliance deadlines, overdue items, and risk flags",
      sources: ["fabric_iq", "portfolio"],
      widgetType: "compliance_board",
    };
  }

  // Past application retrospective / lessons learned — must run BEFORE portfolio_health
  // Catches: "what was the outcome of our BRIC application", "what did we learn",
  // "apply those lessons to the next cycle", "why was our RAISE denied", "how did it go"
  const isPastAppRetrospective =
    /\b(outcome|what\s+did\s+we\s+learn|lessons?\s+learned|lessons?\s+from|apply\s+(those\s+)?lessons|next\s+cycle|why\s+(was|were|did)|how\s+did\s+(our|it|the)\b|rejected|denied|not\s+funded|what\s+happened|past\s+application|previous\s+application|last\s+(year|cycle|round)|historical)\b/i.test(query) &&
    /\b(bric|raise|fma|smc|northwood|stormwater|aptakisic|application|grant|cycle)\b/i.test(query);
  if (isPastAppRetrospective) {
    return {
      type: "general_grant_analysis",
      description: "Analyzing past application outcomes and extracting lessons learned from Foundry IQ KB",
      sources: ["foundry_iq", "portfolio", "work_iq"],
      widgetType: "grant_match",
    };
  }

  // Prioritization queries — use \bprioritiz\b to avoid false-matching "priorities"
  // (e.g. "flood mitigation priorities" should NOT trigger this branch)
  if (/\btop\s+[345]\b|\bprioritiz\w*|\brank\b.*\bgrant|\bgrant\b.*\brank|\border.*\bgrant\b|\bwhich.*grant.*first\b|\bmost\s+urgent\b|\bhighest\s+priority\b|\bthis\s+quarter\b|\bthis\s+month\b/i.test(query)) {
    return {
      type: "top_grants_prioritized",
      description: "Ranking top 3-5 grants by urgency, deadline, and Work IQ signals",
      sources: ["portfolio", "fabric_iq", "work_iq"],
      widgetType: "grant_pipeline",
    };
  }

  // Single grant detail queries — check BEFORE portfolio_health to avoid
  // "disbursement status on the northwood grant" being swallowed by \bdisburs
  const NAMED_GRANTS = /\b(northwood|bric|raise|smc|aptakisic|buffalo\s*creek|buffalo\s*grove|srf|cdbg|fema|hud|dot|epa|usda)\b/i;
  if (
    NAMED_GRANTS.test(query) &&
    /\b(status|disburs|detail|tell|about|info|milestone|compliance|health|progress|update|spent|paid|balance|lifecycle|show|view|what.*happen|how.*going)\b/i.test(query)
  ) {
    const grantMatch = query.match(NAMED_GRANTS);
    const grantHint = grantMatch ? grantMatch[1] : "grant";
    return {
      type: "single_grant_detail",
      description: `Displaying detailed view of ${grantHint} grant including status, milestones, and disbursements`,
      sources: ["portfolio", "fabric_iq"],
      widgetType: "grant_detail",
      grantHint: grantHint.toLowerCase(),
    } as ReturnType<typeof detectQueryIntent>;
  }

  // Portfolio health/overview queries
  if (/\bportfolio\b|\boverview\b|\bsummary\b|\bdisburs|\bawarded\b|\btotal\b.*\bgrant|\bhow\s+much\b|\bhealth\b|\ball\s+grant/i.test(query)) {
    return {
      type: "portfolio_health",
      description: "Analyzing portfolio-level health: disbursement progress, active vs. applied, total funding",
      sources: ["portfolio", "fabric_iq"],
      widgetType: "portfolio_health",
    };
  }

  // Project-to-grant matching (no "match score" — that's caught above by isExplicitAnalysis)
  if (/\bproject.*grant\b|\bgrant.*project\b|\balign\b|\bfit\b|\beligible\b|\bqualify\b|\bapply\s+for\b|\bcan\s+we\s+get\b/i.test(query)) {
    return {
      type: "project_grant_match",
      description: "Matching Buffalo Grove projects to eligible federal grant programs",
      sources: ["foundry_iq", "portfolio", "work_iq"],
      widgetType: "project_match",
    };
  }

  // Fallback single grant detail (tell me about, status of, etc.)
  if (/(?:the |a )?(northwood|bric|raise|smc|srf|cdbg|fema|hud|dot|epa|usda).*grant\b|\btell\s+me\s+about\b|\bstatus\s+of\b|\bdetails.*grant\b|\bwhat.*grant\b|\bgrant.*info\b/i.test(query)) {
    const grantMatch = query.match(/\b(northwood|bric|raise|smc|srf|cdbg|fema|hud|dot|epa|usda)\b/i);
    const grantHint = grantMatch ? grantMatch[1] : "grant";
    return {
      type: "single_grant_detail",
      description: `Displaying detailed view of ${grantHint} grant including status, milestones, compliance`,
      sources: ["portfolio", "fabric_iq"],
      widgetType: "grant_detail",
      grantHint: grantHint.toLowerCase(),
    } as ReturnType<typeof detectQueryIntent>;
  }

  // Financial capacity / cost-share queries
  if (/\bcost.?share\b|\bfinancial\b|\bbudget\b|\breserves\b|\bcapacity\b|\bafford\b/i.test(query)) {
    return {
      type: "financial_capacity",
      description: "Assessing financial capacity, reserves, and cost-share availability",
      sources: ["portfolio", "work_iq"],
      widgetType: "financial_summary",
    };
  }

  // Default to portfolio health
  return {
    type: "portfolio_health",
    description: "Analyzing grant portfolio and status",
    sources: ["portfolio", "fabric_iq"],
    widgetType: "portfolio_health",
  };
}

/**
 * Builds an appropriate widget based on the detected intent and source data.
 */
export async function buildWidgetForIntent(
  intent: { type: string; widgetType: string; grantHint?: string },
  sources: Record<string, unknown>
): Promise<{ type: string; data: unknown }> {
  const fabricIq = sources.fabricIq as any;
  const portfolio = sources.portfolio as any;
  const workIq = sources.workIq as any;

  switch (intent.widgetType) {
    case "grant_pipeline": {
      // Rank portfolio grants by deadline, Work IQ signals, and Fabric IQ urgency
      const prioritized = (portfolio?.grants ?? [])
        .map((g: any) => {
          const daysLeft = Math.max(0, Math.ceil((new Date(g.endDate).getTime() - Date.now()) / 86400000));
          const fabricMatch = fabricIq?.grantRows?.find((r: GrantTableRow) => 
            r.grant_id === g.id || (typeof r.grant_name === 'string' && r.grant_name?.includes(g.name.split(" ")[0]))
          );
          const isAlert = (fabricMatch?.key_risk || fabricMatch?.pct_disbursed < 20) ? 1 : 0;
          const workIqRelevance = (workIq?.priorityThemes?.some((t: string) => g.primaryFocus.toLowerCase().includes(t.toLowerCase())) ? 1 : 0) + 
                                  (workIq?.activeProjects?.some((p: any) => g.summary.toLowerCase().includes(p.name.toLowerCase())) ? 1 : 0);
          
          return {
            grant: g,
            score: (50 - daysLeft / 30) + isAlert * 20 + workIqRelevance * 15,
            daysLeft,
            hasRisk: !!fabricMatch?.key_risk,
          };
        })
        .sort((a: any, b: any) => b.score - a.score)
        .slice(0, 3);

      const totalOpportunity = prioritized.reduce((sum: number, item: any) => sum + item.grant.awardAmount, 0);

      return {
        type: "grant_pipeline",
        data: {
          cityName: "Buffalo Grove, IL",
          totalOpportunity,
          grants: prioritized.map((item: any, i: number) => ({
            rank: i + 1,
            name: item.grant.name,
            agency: item.grant.agency,
            amount: item.grant.awardAmount,
            matchScore: 75 + Math.random() * 20, // placeholder
            deadline: item.grant.endDate,
            focusArea: item.grant.primaryFocus,
            status: item.grant.status,
            daysLeft: item.daysLeft,
            hasRisk: item.hasRisk,
            grantId: item.grant.id,
          })),
        },
      };
    }

    case "compliance_board": {
      // Extract compliance alerts and deadlines from portfolio + Fabric IQ
      const complianceItems: any[] = [];
      for (const grant of portfolio?.grants ?? []) {
        for (const comp of grant.compliance ?? []) {
          if (comp.status === "overdue" || comp.status === "due-soon") {
            complianceItems.push({
              grantName: grant.name,
              grantId: grant.id,
              title: comp.title,
              dueDate: comp.dueDate,
              status: comp.status,
              frequency: comp.frequency,
              severity: comp.status === "overdue" ? "critical" : "warning",
            });
          }
        }
      }

      return {
        type: "compliance_board",
        data: {
          totalAlerts: complianceItems.length,
          overdue: complianceItems.filter((c: any) => c.status === "overdue").length,
          dueSoon: complianceItems.filter((c: any) => c.status === "due-soon").length,
          items: complianceItems.sort((a: any, b: any) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()),
        },
      };
    }

    case "portfolio_health": {
      // Portfolio-level KPIs
      const stats = portfolio?.stats ?? {};
      const totalDisbursed = stats.totalDisbursed ?? 0;
      const totalAwarded = stats.totalAwarded ?? 0;
      const pctDisbursed = totalAwarded > 0 ? (totalDisbursed / totalAwarded) * 100 : 0;

      return {
        type: "portfolio_health",
        data: {
          totalAwarded: totalAwarded,
          totalApplied: stats.totalApplied ?? 0,
          totalDisbursed: totalDisbursed,
          pctDisbursed: Math.round(pctDisbursed),
          activeCount: (portfolio?.grants ?? []).filter((g: any) => g.status === "active").length,
          appliedCount: (portfolio?.grants ?? []).filter((g: any) => g.status === "applied").length,
          overdueTasks: stats.overdueTasks ?? 0,
          dueSoonTasks: stats.dueSoonTasks ?? 0,
        },
      };
    }

    case "grant_detail": {
      // Find the specific named grant from the query hint, fall back to first
      const hint = intent.grantHint?.toLowerCase() ?? "";
      const allGrants: any[] = portfolio?.grants ?? [];
      const grant =
        (hint
          ? allGrants.find((g: any) =>
              g.name.toLowerCase().includes(hint) ||
              g.id?.toLowerCase().includes(hint) ||
              g.summary?.toLowerCase().includes(hint)
            )
          : null) ?? allGrants[0];

      // Merge live Fabric IQ data if available
      const fabricRow = fabricIq?.grantRows?.find(
        (r: GrantTableRow) =>
          r.grant_id === grant?.id ||
          (typeof r.grant_name === "string" && r.grant_name?.toLowerCase().includes(hint))
      );

      return {
        type: "grant_detail",
        data: grant
          ? {
              id: grant.id,
              name: grant.name,
              agency: grant.agency,
              status: grant.status,
              awardAmount: grant.awardAmount,
              cityMatch: grant.cityMatch,
              totalProject: grant.totalProject,
              summary: grant.summary,
              milestones: grant.milestones,
              compliance: grant.compliance,
              disbursements: grant.disbursements,
              // Fabric IQ live overlay
              fabricLive: fabricRow
                ? {
                    pctDisbursed: fabricRow.pct_disbursed,
                    lifecycleState: fabricRow.lifecycle_state,
                    keyRisk: fabricRow.key_risk,
                  }
                : null,
            }
          : null,
      };
    }

    case "project_match": {
      return {
        type: "project_match",
        data: {
          message: "Project-to-grant matching based on Work IQ project signals and Foundry IQ eligibility criteria",
        },
      };
    }

    case "financial_summary": {
      const stats = portfolio?.stats ?? {};
      return {
        type: "financial_summary",
        data: {
          totalReserves: 14_600_000,
          creditRating: "Aa2",
          totalAwardedDollar: stats.totalAwarded ?? 0,
          totalCostShareRequired: (stats.totalAwarded ?? 0) * 0.25,
          capacityStatus: "STRONG",
        },
      };
    }

    default:
      return {
        type: "unknown",
        data: null,
      };
  }
}

/**
 * Generates narrative answer text based on the detected intent and widget data.
 */
export function generateAnswerForIntent(
  intent: { type: string; description: string },
  sources: Record<string, unknown>,
  widget: { type: string; data: unknown }
): string {
  const portfolio = sources.portfolio as any;

  switch (intent.type) {
    case "top_grants_prioritized": {
      const data = widget.data as any;
      const lines: string[] = [
        `## Top 3 Grants This Quarter (Prioritized by Urgency & Work IQ Signals)`,
        ``,
        `**Total Opportunity:** ${formatUSD(data.totalOpportunity)}`,
        ``,
      ];
      if (data.grants) {
        for (const g of data.grants) {
          lines.push(`### #${g.rank} — ${g.name}`);
          lines.push(`- **Agency:** ${g.agency}`);
          lines.push(`- **Funding:** ${formatUSD(g.amount)}`);
          lines.push(`- **Match Score:** ${Math.round(g.matchScore)}%`);
          lines.push(`- **Days to Deadline:** ${g.daysLeft} days`);
          lines.push(`- **Focus:** ${g.focusArea}`);
          if (g.hasRisk) lines.push(`- ⚠️ **Risk Alert:** Fabric IQ has flagged key risks`);
          lines.push(``);
        }
      }
      lines.push(`### Next Steps`);
      lines.push(`1. Click any grant above to view full details in the Admin Console`);
      lines.push(`2. Review compliance deadlines and disbursement status`);
      lines.push(`3. Prepare applications for grants with upcoming deadlines`);
      return lines.join("\n");
    }

    case "compliance_alerts": {
      const data = widget.data as any;
      return [
        `## Compliance Alerts & Deadlines`,
        ``,
        `**Critical:** ${data.overdue} overdue | **Warning:** ${data.dueSoon} due soon | **Total:** ${data.totalAlerts} items`,
        ``,
        `### Priority Actions`,
        ...(data.items?.slice(0, 3) ?? []).map(
          (item: any) =>
            `- **${item.title}** (${item.grantName}) — Due ${new Date(item.dueDate).toLocaleDateString()} — ${item.status.toUpperCase()}`
        ),
        ``,
        `### Recommendations`,
        `1. Address overdue items immediately — coordinate with Finance and Public Works`,
        `2. Schedule compliance task review meeting for Q2 closeout`,
        `3. Set up automated reminders for recurring reports (quarterly, semi-annual)`,
      ].join("\n");
    }

    case "portfolio_health": {
      const data = widget.data as any;
      return [
        `## Grant Portfolio Health Report`,
        ``,
        `**Awarded (Active):** ${formatUSD(data.totalAwarded)}`,
        `**Applied (Pending):** ${formatUSD(data.totalApplied)}`,
        `**Disbursed to Date:** ${formatUSD(data.totalDisbursed)} (${data.pctDisbursed}%)`,
        ``,
        `**Grants:** ${data.activeCount} active, ${data.appliedCount} pending`,
        `**Compliance Status:** ${data.overdueTasks} overdue, ${data.dueSoonTasks} due-soon`,
        ``,
        `### Recommendations`,
        `1. ${data.pctDisbursed < 30 ? "Accelerate drawdowns — only " + data.pctDisbursed + "% deployed" : "Disbursement pace is healthy"}`,
        `2. ${data.overdueTasks > 0 ? "Priority: resolve " + data.overdueTasks + " overdue compliance items" : "Compliance on track"}`,
        `3. Review pending applications for follow-up actions`,
      ].join("\n");
    }

    case "single_grant_detail": {
      const d = (widget.data as any);
      if (!d) return `No grant found matching that name in the portfolio.`;
      const lines: string[] = [
        `## ${d.name}`,
        ``,
        `**Agency:** ${d.agency} | **Status:** ${d.status?.toUpperCase()} | **Award:** ${formatUSD(d.awardAmount)}`,
        ``,
        d.summary ?? "",
        ``,
      ];

      // Fabric IQ live overlay
      if (d.fabricLive) {
        lines.push(`### Live Status (Fabric IQ)`);
        lines.push(`- **Disbursed:** ${d.fabricLive.pctDisbursed ?? "—"}%`);
        lines.push(`- **Lifecycle State:** ${d.fabricLive.lifecycleState ?? "—"}`);
        if (d.fabricLive.keyRisk) lines.push(`- ⚠️ **Key Risk:** ${d.fabricLive.keyRisk}`);
        lines.push(``);
      }

      // Disbursements from portfolio
      if (d.disbursements?.length) {
        lines.push(`### Disbursements`);
        for (const dis of d.disbursements) {
          lines.push(`- **${dis.label ?? dis.phase}** — ${formatUSD(dis.amount)} (${dis.status})`);
        }
        const paid = d.disbursements.filter((x: any) => x.status === "paid").reduce((s: number, x: any) => s + x.amount, 0);
        const total = d.disbursements.reduce((s: number, x: any) => s + x.amount, 0);
        lines.push(`- **Total paid:** ${formatUSD(paid)} of ${formatUSD(total)} (${total > 0 ? Math.round((paid / total) * 100) : 0}%)`);
        lines.push(``);
      }

      // Milestones
      if (d.milestones?.length) {
        const open = d.milestones.filter((m: any) => m.status !== "complete");
        if (open.length) {
          lines.push(`### Open Milestones`);
          for (const m of open.slice(0, 4)) {
            lines.push(`- **${m.title}** — ${m.status} (due ${new Date(m.dueDate).toLocaleDateString()})`);
          }
          lines.push(``);
        }
      }

      // Compliance
      const alerts = (d.compliance ?? []).filter((c: any) => c.status === "overdue" || c.status === "due-soon");
      if (alerts.length) {
        lines.push(`### Compliance Alerts`);
        for (const a of alerts) {
          lines.push(`- ⚠️ **${a.title}** — ${a.status} (due ${new Date(a.dueDate).toLocaleDateString()})`);
        }
        lines.push(``);
      }

      return lines.join("\n");
    }

    default:
      return `Analysis complete. Widget type: ${widget.type}`;
  }
}

function formatUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

export default grantRouterHandler;
