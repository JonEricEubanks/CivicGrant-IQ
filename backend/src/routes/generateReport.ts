import { Router, Request, Response } from "express";
import { getOpenAIClient } from "../agent";
import { findGrant, buildGrantContext } from "../grantPortfolio";
import { withSpan } from "../telemetry";

export const generateReportRouter = Router();

// ─── Report type configs ─────────────────────────────────────────────────────
type ReportType = "quarterly" | "sf425" | "closeout";

interface ReportConfig {
  title: string;
  federalForm?: string;
  instructions: string;
}

const REPORT_CONFIGS: Record<ReportType, ReportConfig> = {
  quarterly: {
    title: "Quarterly Performance Progress Report",
    federalForm: "SF-PPR",
    instructions: `Write a complete, submission-ready Quarterly Performance Progress Report (SF-PPR format) for the provided grant.

The report must include ALL of the following sections, each fully populated with real data from the grant context:

## SECTION 1 — COVER PAGE
- Federal Award Identification Number (FAIN): [use grant CFDA as placeholder, e.g., FAIN: SMC-SIIP-2024-BG-001]
- Project Title
- Recipient Organization: Village of Buffalo Grove, IL
- Reporting Period: [current quarter: April 1, 2026 – June 30, 2026]
- Report Due Date
- Report Prepared By: [Grant Coordinator name + title]
- Report Period End Date

## SECTION 2 — EXECUTIVE SUMMARY (100–150 words)
Summarize overall project status, key accomplishments this quarter, and percent complete.
Be specific with dollar amounts and milestone names.

## SECTION 3 — PROGRESS ON PERFORMANCE MEASURES
For each project objective/milestone, provide:
| Milestone | Status | % Complete | Target Date | Notes |
Use actual milestone data. Mark completed milestones with ✓.

## SECTION 4 — FINANCIAL STATUS
Report as a formatted table:
| Cost Category | Total Budget | Prior Expenditures | This Period | Cumulative | % Spent |
Include:
- Federal share (award amount)
- Local match
- Construction (by phase)
- Engineering/Design
- Administration
Base on actual disbursement data.

## SECTION 5 — ISSUES, RISKS, AND REMEDIATION
List any problems encountered, risks identified, and how they are being addressed.
If key risk from grant data exists, analyze it here with a mitigation plan.

## SECTION 6 — NEXT QUARTER PLANNED ACTIVITIES
List 3–5 specific, measurable activities planned for Q3 2026 with responsible departments.

## SECTION 7 — CERTIFICATION
"By submitting this report, the authorized representative certifies to the best of their knowledge and belief that the report is correct and complete..."
Include signature block: Village Manager, Village of Buffalo Grove; Date: [today's date]

## FORMATTING RULES:
- Output as clean, valid HTML only (no markdown)
- Use a professional government document style with a teal (#0d7377) header band
- Tables should have clear borders and alternating row shading (#f0f9fa)
- Include the village seal placeholder: <div class="seal">[Village Seal]</div>
- Total report length: ~600-900 words of content
- Make it look like an actual federal submission document`,
  },
  sf425: {
    title: "SF-425 Federal Financial Report",
    federalForm: "SF-425",
    instructions: `Write a complete, submission-ready SF-425 Federal Financial Report for the provided grant.

Output as clean HTML with a professional government document header (teal #0d7377 band).

Include ALL required SF-425 fields:
1. Federal Agency and Organizational Element to Which Report is Submitted
2. Federal Grant or Other Identifying Number Assigned by Federal Agency
3. Recipient Organization (Name and complete address)
4. EIN: 36-6005958 (Buffalo Grove's actual EIN)
5. Recipient Account Number or Identifying Number
6. Report Type: [X] Quarterly / [ ] Annual / [ ] Final
7. Basis of Accounting: [X] Cash / [ ] Accrual
8. Period Covered by this Report: April 1, 2026 – June 30, 2026
9. Federal Cash (columns a–f): federal cash on hand, federal disbursements, federal share
10. Federal Expenditures and Unobligated Balance
11. Recipient Share (local match): required, actual, remaining
12. Program Income: earned, expended
13. Indirect Expense (if applicable)
14. Remarks
15. Certification block

Populate all financial fields from the actual disbursement data in the grant context.
Show the math clearly — every number should trace back to the disbursement schedule.
Format as a proper government form with labeled boxes.`,
  },
  closeout: {
    title: "Final Closeout Report & Grant Completion Certification",
    federalForm: "SF-269 / Final Report",
    instructions: `Write a complete Final Closeout Report for the provided grant, as if the project has successfully completed all work.

Include:
1. Project accomplishments summary (what was built, impact metrics)
2. Final financial reconciliation table
3. Compliance certification summary (all requirements met)
4. Performance outcomes vs. targets (quantitative)
5. Lessons learned (3–5 bullets)
6. Final certification statement

Output as clean HTML with professional government styling.`,
  },
};

// ─── System persona ───────────────────────────────────────────────────────────
const REPORT_PERSONA = `You are CivicGrant IQ in **Report Generation Mode**.
You are an expert federal grant compliance officer with 20+ years writing government reports.
You produce complete, accurate, submission-ready documents using real grant data.
NEVER leave placeholders like [INSERT], [TBD], or [X] in the final report — use real data from the grant context.
Use today's date: ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`;

/**
 * POST /api/generate-report
 * Body: { grantId: string; reportType: "quarterly" | "sf425" | "closeout" }
 * Streams SSE events:
 *   status → html_chunk → html_done → done
 */
generateReportRouter.post("/", async (req: Request, res: Response) => {
  const { grantId, reportType = "quarterly" } = req.body as {
    grantId: string;
    reportType?: ReportType;
  };

  if (!grantId) {
    res.status(400).json({ error: "grantId is required" });
    return;
  }

  const grant = findGrant(grantId);
  if (!grant) {
    res.status(404).json({ error: `Grant "${grantId}" not found` });
    return;
  }

  if (grant.status !== "active" && grant.status !== "closeout") {
    res.status(400).json({ error: "Report generation is only available for active/closeout grants" });
    return;
  }

  const config = REPORT_CONFIGS[reportType] || REPORT_CONFIGS.quarterly;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  await withSpan("generate-report", { grantId, reportType }, async (_span) => {
    try {
      send("status", { message: `Loading ${grant.name} data…` });
      const grantContext = buildGrantContext(grant);

      send("status", { message: `Agent is writing ${config.title}…` });

      const systemPrompt = `${REPORT_PERSONA}\n\n## GRANT DATA\n${grantContext}\n\n## REPORT INSTRUCTIONS\n${config.instructions}`;

      const oai = getOpenAIClient();
      const stream = await oai.chat.completions.create({
        model: process.env.FOUNDRY_MODEL_DEPLOYMENT || "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Generate the complete ${config.title}${config.federalForm ? ` (${config.federalForm})` : ""} for the ${grant.name} grant. Today is ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}. Output ONLY the HTML document — no explanation, no markdown code fences.`,
          },
        ],
        stream: true,
        temperature: 0.2,
        max_tokens: 2500,
      });

      let fullHtml = "";
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? "";
        if (delta) {
          fullHtml += delta;
          send("html_chunk", { content: delta });
        }
      }

      // Wrap in a printable shell if the model didn't include full doc structure
      if (!fullHtml.trim().startsWith("<!DOCTYPE") && !fullHtml.trim().startsWith("<html")) {
        fullHtml = wrapInPrintableShell(fullHtml, grant.name, config.title);
      }

      send("html_done", { html: fullHtml, title: config.title, grantName: grant.name });
      send("done", {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      send("error", { message: `Report generation failed: ${msg}` });
    } finally {
      res.end();
    }
  });
});

function wrapInPrintableShell(content: string, grantName: string, reportTitle: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${reportTitle} — ${grantName}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Times New Roman', Times, serif; font-size: 11pt; color: #1a1a1a; margin: 0; padding: 0; background: #fff; }
  .doc-header { background: #0d7377; color: white; padding: 18px 32px; display: flex; align-items: center; justify-content: space-between; }
  .doc-header h1 { font-size: 15pt; margin: 0; font-weight: 700; letter-spacing: 0.02em; }
  .doc-header .sub { font-size: 9pt; opacity: 0.85; margin-top: 4px; }
  .seal { width: 56px; height: 56px; border: 2px solid rgba(255,255,255,0.4); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 8pt; color: rgba(255,255,255,0.7); text-align: center; flex-shrink: 0; }
  .doc-body { padding: 28px 36px; max-width: 780px; margin: 0 auto; }
  h2 { font-size: 12pt; font-weight: 700; color: #0d7377; border-bottom: 1.5px solid #0d7377; padding-bottom: 4px; margin: 22px 0 10px; text-transform: uppercase; letter-spacing: 0.04em; }
  h3 { font-size: 11pt; font-weight: 700; margin: 14px 0 6px; }
  p { margin: 6px 0; line-height: 1.6; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 10pt; }
  th { background: #0d7377; color: white; padding: 7px 10px; text-align: left; font-weight: 600; font-size: 9.5pt; }
  td { padding: 6px 10px; border: 1px solid #c5d8d9; }
  tr:nth-child(even) td { background: #f0f9fa; }
  .field-row { display: flex; gap: 20px; margin: 6px 0; }
  .field { flex: 1; }
  .field-label { font-size: 8pt; font-weight: 700; text-transform: uppercase; color: #555; letter-spacing: 0.05em; }
  .field-value { font-size: 10.5pt; border-bottom: 1px solid #aaa; padding: 3px 0; min-height: 22px; }
  .cert-block { border: 1.5px solid #0d7377; padding: 14px 18px; margin-top: 24px; font-size: 9.5pt; background: #f8ffff; }
  .cert-sig { margin-top: 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .sig-line { border-bottom: 1px solid #333; height: 28px; margin-bottom: 3px; }
  .sig-label { font-size: 8.5pt; color: #555; }
  ul { margin: 6px 0; padding-left: 18px; }
  li { margin: 4px 0; line-height: 1.5; }
  .status-complete { color: #15803d; font-weight: 700; }
  .status-progress { color: #1d4ed8; font-weight: 700; }
  .status-pending { color: #6b7280; }
  .status-risk { color: #dc2626; font-weight: 700; }
  @media print { 
    body { font-size: 10pt; }
    .doc-header { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
<div class="doc-header">
  <div>
    <h1>${reportTitle}</h1>
    <div class="sub">${grantName}</div>
  </div>
  <div class="seal">Village<br>Seal</div>
</div>
<div class="doc-body">
${content}
</div>
</body>
</html>`;
}
