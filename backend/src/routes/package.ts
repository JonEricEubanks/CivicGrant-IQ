import { Router } from "express";
import type { Request, Response } from "express";

export const packageRouter = Router();

interface GapItem {
  title: string;
  severity: "critical" | "moderate" | "minor";
  suggestion: string;
}

interface StrategyMilestone {
  week: number;
  task: string;
  owner?: string;
}

interface WidgetData {
  grantName?: string;
  agency?: string;
  fundingAmount?: number;
  awardRange?: string;
  deadline?: string;
  matchScore?: number;
  gaps?: GapItem[];
  strengths?: string[];
  narrativeDraft?: string;
  strategy?: {
    actionItems?: string[];
    winningDifferentiator?: string;
    competitionLevel?: string;
    weeklyMilestones?: StrategyMilestone[];
  };
}

function fmt(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

function sevColor(sev: string): string {
  return sev === "critical" ? "#b91c1c" : sev === "moderate" ? "#92400e" : "#1e40af";
}
function sevBg(sev: string): string {
  return sev === "critical" ? "#fef2f2" : sev === "moderate" ? "#fffbeb" : "#eff6ff";
}

function buildPackageHtml(widget: WidgetData, analysisText: string): string {
  const today = new Date();
  const todayStr = today.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  // Guard against non-empty but unparseable deadlines (e.g. "Not specified") — these
  // produce an Invalid Date that is truthy, yielding "Invalid Date" / "NaN" in the report.
  const parsedDeadline = widget.deadline ? new Date(widget.deadline) : null;
  const deadline = parsedDeadline && !Number.isNaN(parsedDeadline.getTime()) ? parsedDeadline : null;
  const daysLeft = deadline ? Math.ceil((deadline.getTime() - today.getTime()) / 86400000) : null;
  const deadlineStr = deadline
    ? deadline.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : "TBD";

  const grantName = widget.grantName ?? "Grant Program";
  const agency = widget.agency ?? "Federal Agency";
  const score = widget.matchScore ?? 0;
  const funding = widget.fundingAmount ? fmt(widget.fundingAmount) : "Varies";
  const awardRange = widget.awardRange ?? "Varies";
  const gaps = widget.gaps ?? [];
  const strengths = widget.strengths ?? [];
  const narrative = widget.narrativeDraft ?? "";
  const strategy = widget.strategy ?? {};

  // Pull full Step 5 narrative from analysisText if available
  const narMatch = analysisText.match(
    /(?:####?\s*Step 5|\*\*Step 5)[^\n]*\n+([\s\S]{80,}?)(?:\n####?\s*Step|\n\*\*Step|```widget|$)/i
  );
  const fullNarrative = narMatch ? narMatch[1].trim() : narrative;

  // Competition badge color
  const compColor = strategy.competitionLevel === "high" ? "#b91c1c"
    : strategy.competitionLevel === "medium" ? "#92400e" : "#166534";
  const compBg = strategy.competitionLevel === "high" ? "#fef2f2"
    : strategy.competitionLevel === "medium" ? "#fffbeb" : "#f0fdf4";

  const complianceRows = gaps.map((g, i) => `
    <tr>
      <td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;">${i + 1}. ${g.title}</td>
      <td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;text-align:center;">
        <span style="background:${sevBg(g.severity)};color:${sevColor(g.severity)};padding:2px 10px;border-radius:20px;font-size:0.75rem;font-weight:700;text-transform:uppercase;">${g.severity}</span>
      </td>
      <td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;">${g.suggestion}</td>
      <td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;text-align:center;">
        <span style="display:inline-block;width:16px;height:16px;border:2px solid #9ca3af;border-radius:3px;"></span>
      </td>
    </tr>`).join("");

  const strengthRows = strengths.map((s, i) => `
    <tr>
      <td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;color:#6b7280;">${i + 1}</td>
      <td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;">${s}</td>
      <td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;text-align:center;color:#16a34a;font-weight:700;">Confirmed</td>
    </tr>`).join("");

  const actionItems = (strategy.actionItems ?? []).map((a, i) => `
    <div style="display:flex;gap:12px;margin-bottom:12px;align-items:flex-start;">
      <div style="background:#1d4ed8;color:white;min-width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.72rem;font-weight:700;">${i + 1}</div>
      <div style="padding-top:2px;font-size:0.91rem;line-height:1.5;">${a}</div>
    </div>`).join("");

  const milestoneRows = (strategy.weeklyMilestones ?? []).map((m) => `
    <tr>
      <td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;font-weight:700;color:#1e40af;">Week ${m.week}</td>
      <td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;">${m.task}</td>
      <td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;color:#6b7280;">${m.owner ?? "Grant Team"}</td>
    </tr>`).join("");

  const narrativeHtml = fullNarrative
    ? fullNarrative.split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => `<p style="margin-bottom:12px;">${l.replace(/\*\*/g, "")}</p>`)
        .join("")
    : `<p>${narrative}</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${grantName} — Application Package</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #111827; line-height: 1.65; background: #fff; }
    .page { max-width: 860px; margin: 0 auto; }
    .cover { background: linear-gradient(140deg, #1e3a8a 0%, #1d4ed8 50%, #2563eb 100%); color: white; padding: 36px 64px 30px; }
    .cover-eyebrow { font-size: 0.68rem; font-weight: 700; letter-spacing: 0.18em; opacity: 0.6; text-transform: uppercase; margin-bottom: 12px; }
    .cover-title { font-size: 1.5rem; font-weight: 800; line-height: 1.2; margin-bottom: 4px; }
    .cover-agency { font-size: 0.9rem; opacity: 0.8; margin-bottom: 20px; }
    .cover-stats { display: flex; gap: 36px; flex-wrap: wrap; }
    .cs-label { font-size: 0.62rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.65; margin-bottom: 3px; }
    .cs-value { font-size: 1.15rem; font-weight: 800; }
    .cover-alert { margin-top: 18px; padding: 8px 16px; background: rgba(255,255,255,0.13); border-radius: 8px; font-size: 0.78rem; display: inline-block; border: 1px solid rgba(255,255,255,0.2); }
    .section { padding: 40px 64px; border-bottom: 1px solid #e5e7eb; }
    .section-title { font-size: 0.75rem; font-weight: 800; color: #1e3a8a; text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid #3b82f6; }
    .body-text { font-size: 0.93rem; color: #374151; }
    .score-bar-outer { background: #e5e7eb; border-radius: 100px; height: 8px; width: 220px; display: inline-block; vertical-align: middle; margin-right: 10px; }
    .score-bar-inner { background: linear-gradient(90deg, #2563eb, #06b6d4); border-radius: 100px; height: 8px; }
    .edge-box { background: linear-gradient(135deg, #eff6ff, #dbeafe); border: 1px solid #bfdbfe; border-radius: 10px; padding: 16px 20px; margin-top: 18px; }
    .edge-label { font-size: 0.68rem; font-weight: 800; color: #1e40af; text-transform: uppercase; letter-spacing: 0.12em; margin-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; font-size: 0.88rem; margin-top: 4px; }
    th { background: #f1f5f9; padding: 10px 14px; text-align: left; font-weight: 700; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; border-bottom: 2px solid #e2e8f0; }
    .footer { padding: 20px 64px 32px; text-align: center; font-size: 0.73rem; color: #9ca3af; }
    @media print {
      @page { size: A4; margin: 0; }
      html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page { max-width: 100%; }
      .cover { -webkit-print-color-adjust: exact; print-color-adjust: exact; page-break-after: avoid; padding: 26px 44px 22px; }
      .cover-title { font-size: 1.3rem; }
      .cover-agency { margin-bottom: 14px; }
      .cover-stats { gap: 28px; }
      .cs-value { font-size: 1.05rem; }
      .section { padding: 28px 44px; page-break-inside: avoid; }
      .section:nth-child(n+4) { page-break-before: auto; }
      table { page-break-inside: avoid; }
      .footer { margin-top: 24px; }
    }
  </style>
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 300); };<\/script>
</head>
<body>
<div class="page">

  <!-- Cover -->
  <div class="cover">
    <div class="cover-eyebrow">Grant Application Package &middot; Prepared by CivicGrant IQ &middot; ${todayStr}</div>
    <div class="cover-title">${grantName}</div>
    <div class="cover-agency">${agency}</div>
    <div class="cover-stats">
      <div><div class="cs-label">Available Funding</div><div class="cs-value">${funding}</div></div>
      <div><div class="cs-label">Award Range</div><div class="cs-value" style="font-size:1.1rem;padding-top:4px;">${awardRange}</div></div>
      <div><div class="cs-label">Match Score</div><div class="cs-value">${score}%</div></div>
      <div><div class="cs-label">Deadline</div><div class="cs-value" style="font-size:1rem;padding-top:4px;">${deadlineStr}</div></div>
      ${daysLeft !== null ? `<div><div class="cs-label">Days Remaining</div><div class="cs-value" style="color:${daysLeft < 30 ? "#fcd34d" : "#a5f3fc"}">${daysLeft}</div></div>` : ""}
    </div>
    ${daysLeft !== null && daysLeft < 60 ? `<div class="cover-alert">Action Required — ${daysLeft} days to deadline. Begin preparation immediately.</div>` : ""}
  </div>

  <!-- 1. Executive Summary -->
  <div class="section">
    <div class="section-title">1 &mdash; Executive Summary</div>
    <div class="body-text">
      <p>This application package covers <strong>${grantName}</strong> administered by ${agency}. Our AI-assisted analysis produced a <strong>${score}% eligibility match</strong> with <strong>${funding}</strong> in total available funding and a submission deadline of <strong>${deadlineStr}</strong>.</p>
      <div style="margin-top:18px;display:flex;align-items:center;gap:0;">
        <div class="score-bar-outer"><div class="score-bar-inner" style="width:${score}%"></div></div>
        <strong>${score}% Overall Match Score</strong>
      </div>
      ${strategy.winningDifferentiator ? `
      <div class="edge-box">
        <div class="edge-label">Winning Differentiator</div>
        <div style="font-size:0.93rem;">${strategy.winningDifferentiator}</div>
      </div>` : ""}
      ${strategy.competitionLevel ? `
      <p style="margin-top:14px;font-size:0.85rem;color:#6b7280;">
        Expected competition:
        <span style="background:${compBg};color:${compColor};padding:2px 10px;border-radius:20px;font-size:0.75rem;font-weight:700;text-transform:uppercase;margin-left:6px;">${strategy.competitionLevel} competition</span>
      </p>` : ""}
    </div>
  </div>

  <!-- 2. Project Narrative -->
  <div class="section">
    <div class="section-title">2 &mdash; Project Narrative</div>
    <div class="body-text">${narrativeHtml}</div>
  </div>

  <!-- 3. City Strengths -->
  <div class="section">
    <div class="section-title">3 &mdash; City Strengths &amp; Qualifications</div>
    <div class="body-text">
      ${strengths.length > 0 ? `
      <table>
        <thead><tr><th>#</th><th>Qualification</th><th>Status</th></tr></thead>
        <tbody>${strengthRows}</tbody>
      </table>` : "<p>Analysis did not return specific strengths. Review Step 2 output.</p>"}
    </div>
  </div>

  <!-- 4. Compliance Checklist -->
  <div class="section">
    <div class="section-title">4 &mdash; Eligibility Gap Checklist</div>
    <div class="body-text">
      <p style="margin-bottom:16px;color:#6b7280;font-size:0.86rem;">Complete all items before submission. Critical items require immediate attention.</p>
      ${gaps.length > 0 ? `
      <table>
        <thead><tr><th>Gap</th><th>Severity</th><th>Recommended Action</th><th>Done</th></tr></thead>
        <tbody>${complianceRows}</tbody>
      </table>` : `<p style="color:#16a34a;font-weight:600;">No compliance gaps identified — excellent eligibility standing.</p>`}
    </div>
  </div>

  <!-- 5. Preliminary Budget Framework -->
  <div class="section">
    <div class="section-title">5 &mdash; Preliminary Budget Framework</div>
    <div class="body-text">
      <p style="margin-bottom:16px;color:#6b7280;font-size:0.86rem;">Develop with actual cost estimates in coordination with Finance and Public Works. Award range: <strong>${awardRange}</strong>.</p>
      <table>
        <thead><tr><th>Cost Category</th><th>Description</th><th>Est. Amount</th><th>Grant %</th><th>City Match %</th></tr></thead>
        <tbody>
          <tr><td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;">Construction / Infrastructure</td><td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;">Primary project scope per engineer estimate</td><td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;color:#6b7280;">TBD by Engineering</td><td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;">80%</td><td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;">20%</td></tr>
          <tr><td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;">Preliminary Engineering &amp; Design</td><td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;">Plans, specs, environmental review</td><td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;color:#6b7280;">TBD by Engineering</td><td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;">80%</td><td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;">20%</td></tr>
          <tr><td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;">Environmental Compliance</td><td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;">NEPA / SEPA documentation</td><td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;color:#6b7280;">TBD</td><td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;">Eligible</td><td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;">—</td></tr>
          <tr><td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;">Project Management &amp; Admin</td><td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;">Staff time, compliance reporting</td><td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;color:#6b7280;">TBD</td><td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;">Eligible</td><td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;">—</td></tr>
          <tr style="font-weight:700;background:#f8fafc;"><td style="padding:9px 14px;">TOTAL REQUEST</td><td style="padding:9px 14px;"></td><td style="padding:9px 14px;">TBD</td><td style="padding:9px 14px;"></td><td style="padding:9px 14px;"></td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- 6. Application Strategy -->
  ${(strategy.actionItems?.length || strategy.weeklyMilestones?.length) ? `
  <div class="section">
    <div class="section-title">6 &mdash; Application Strategy &amp; 30-Day Action Plan</div>
    <div class="body-text">
      ${strategy.actionItems?.length ? `
      <h4 style="font-weight:700;color:#1e3a8a;margin-bottom:14px;font-size:0.93rem;">Priority Actions</h4>
      ${actionItems}` : ""}
      ${strategy.weeklyMilestones?.length ? `
      <h4 style="font-weight:700;color:#1e3a8a;margin:24px 0 14px;font-size:0.93rem;">Submission Milestone Timeline</h4>
      <table>
        <thead><tr><th>Week</th><th>Milestone</th><th>Department / Owner</th></tr></thead>
        <tbody>${milestoneRows}</tbody>
      </table>` : ""}
    </div>
  </div>` : ""}

  <div class="footer">
    Generated by CivicGrant IQ &bull; ${todayStr} &bull; Powered by Microsoft Azure Foundry &bull;
    AI-generated analysis — must be reviewed by qualified grant professionals before submission.
  </div>
</div>
</body>
</html>`;
}

packageRouter.post("/", (req: Request, res: Response) => {
  const { widget, analysisText, title } = req.body as {
    widget: WidgetData;
    analysisText?: string;
    title?: string;
  };

  if (!widget || typeof widget !== "object") {
    res.status(400).json({ error: "widget data is required" });
    return;
  }

  try {
    const html = buildPackageHtml(widget, analysisText ?? "");
    res.json({
      html,
      title: title ?? `${widget.grantName ?? "Grant"} — Application Package`,
    });
  } catch {
    res.status(500).json({ error: "Package generation failed" });
  }
});
