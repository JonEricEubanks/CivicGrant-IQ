import { useState, useRef } from "react";
import type { GrantMatchData } from "./GrantMatchWidget";
import type { Citation, RedTeamResult, CompetitorIntelResult } from "../types";
import {
  IconSun, IconMoon, IconMaximize, IconMinimize,
  IconDownload, IconChevronDown, IconX,
  IconGlobe, IconFileText, IconFilePdf, IconChart,
} from "./Icons";
import "./ReportPreviewModal.css";

// ─── Types ────────────────────────────────────────────────────────────────
export type ReportPayload =
  | { type: "grant_match"; widget: GrantMatchData; analysisText: string; title: string; citations?: Citation[]; redTeamReview?: RedTeamResult; competitorIntel?: CompetitorIntelResult }
  | { type: "grant_pipeline"; analysisText: string; title: string; citations?: Citation[] };

// ─── HTML Report Generator ─────────────────────────────────────────────────
function formatFunding(amount: number): string {
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toLocaleString()}`;
}

function daysUntil(dateStr: string): number | null {
  const time = new Date(dateStr).getTime();
  if (Number.isNaN(time)) return null;
  return Math.max(0, Math.ceil((time - Date.now()) / 86_400_000));
}

function safeDate(
  dateStr: string,
  opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" },
  fallback = "Rolling / see NOFO"
): string {
  const time = new Date(dateStr).getTime();
  if (Number.isNaN(time)) return fallback;
  return new Date(time).toLocaleDateString("en-US", opts);
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function applyInline(t: string): string {
  return t
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, `<code style="background:#f1f5f9;padding:0.1em 0.4em;border-radius:3px;font-size:0.82em;font-family:monospace;">$1</code>`);
}

function mdToHtml(rawText: string): string {
  const stepColors = ["#2563eb", "#4f46e5", "#0891b2", "#059669", "#7c3aed"];

  function convertBlock(block: string): string {
    const lines = block.split("\n");
    const result: string[] = [];
    let inUl = false;
    for (const line of lines) {
      const h2 = line.match(/^##\s+(.+)$/);
      if (h2) { if (inUl) { result.push("</ul>"); inUl = false; } result.push(`<h2 style="font-size:1.05rem;font-weight:800;color:#0f172a;margin:1.1rem 0 0.35rem;letter-spacing:-0.02em;">${applyInline(h2[1])}</h2>`); continue; }
      const h3 = line.match(/^###\s+(.+)$/);
      if (h3) { if (inUl) { result.push("</ul>"); inUl = false; } result.push(`<h3 style="font-size:0.92rem;font-weight:700;color:#1e293b;margin:0.85rem 0 0.28rem;">${applyInline(h3[1])}</h3>`); continue; }
      const h4 = line.match(/^####\s+(.+)$/);
      if (h4) { if (inUl) { result.push("</ul>"); inUl = false; } result.push(`<h4 style="font-size:0.84rem;font-weight:700;color:#334155;margin:0.65rem 0 0.2rem;">${applyInline(h4[1])}</h4>`); continue; }
      const bull = line.match(/^[-*]\s+(.+)$/);
      if (bull) {
        if (!inUl) { result.push(`<ul style="padding-left:1.15rem;margin:0.4rem 0;">`); inUl = true; }
        result.push(`<li style="margin:0.3rem 0;font-size:0.84rem;line-height:1.6;">${applyInline(bull[1])}</li>`);
        continue;
      }
      if (inUl) { result.push("</ul>"); inUl = false; }
      if (line.trim() === "") continue;
      result.push(`<p style="margin:0.32rem 0;font-size:0.85rem;line-height:1.7;">${applyInline(line)}</p>`);
    }
    if (inUl) result.push("</ul>");
    return result.join("\n");
  }

  // Split by Step headers: "### Step N — Title", "Step N — Title", "Step N: Title"
  const stepRe = /^(?:#{1,3}\s*)?Step\s+(\d+)\s*[—–:\-]+\s*(.+)$/gim;
  const stepMatches: Array<{ index: number; n: number; title: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = stepRe.exec(rawText)) !== null) {
    stepMatches.push({ index: m.index, n: parseInt(m[1]), title: m[2].trim() });
  }

  if (stepMatches.length === 0) return convertBlock(rawText);

  const parts: string[] = [];
  if (stepMatches[0].index > 0) {
    parts.push(convertBlock(rawText.slice(0, stepMatches[0].index)));
  }

  for (let i = 0; i < stepMatches.length; i++) {
    const sm = stepMatches[i];
    const lineEnd = rawText.indexOf("\n", sm.index);
    const contentStart = lineEnd === -1 ? rawText.length : lineEnd + 1;
    const contentEnd = i + 1 < stepMatches.length ? stepMatches[i + 1].index : rawText.length;
    const content = rawText.slice(contentStart, contentEnd);
    const c = stepColors[(sm.n - 1) % stepColors.length];
    parts.push(
      `<div style="background:#f8fafc;border:1px solid #eef2f8;border-left:3px solid ${c};border-radius:10px;padding:1rem 1.15rem 0.9rem;margin:0.85rem 0;">` +
      `<div style="display:flex;align-items:center;gap:0.65rem;margin-bottom:0.6rem;">` +
      `<span style="background:${c};color:#fff;min-width:24px;height:24px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:0.68rem;font-weight:800;flex-shrink:0;box-shadow:0 2px 6px ${c}40;">${sm.n}</span>` +
      `<span style="font-size:0.94rem;font-weight:700;color:#0f172a;letter-spacing:-0.015em;">${applyInline(sm.title)}</span>` +
      `</div>` +
      convertBlock(content) +
      `</div>`
    );
  }
  return parts.join("\n");
}

export function generateReportHtml(data: ReportPayload, dark: boolean, citations?: Citation[]): string {
  const bg = dark ? "#0f1117" : "#f4f7fc";
  const card = dark ? "#1a1d26" : "#ffffff";
  const cardBorder = dark ? "#252836" : "#e8eef7";
  const text = dark ? "#e2e8f0" : "#1e293b";
  const subText = dark ? "#8b9bbf" : "#64748b";
  const accent = "#3b82f6";
  const accentLight = dark ? "#1e2d42" : "#eff6ff";
  const successColor = dark ? "#22c55e" : "#16a34a";
  const warnColor = dark ? "#f59e0b" : "#d97706";
  const dangerColor = dark ? "#ef4444" : "#dc2626";
  const headerBg = dark
    ? "#0c1428"
    : "radial-gradient(120% 140% at 0% 0%, rgba(99,102,241,0.55) 0%, transparent 55%), radial-gradient(120% 140% at 100% 0%, rgba(56,189,248,0.35) 0%, transparent 50%), linear-gradient(120deg, #1e40af 0%, #3730a3 55%, #4338ca 100%)";
  const cardShadow = dark
    ? "0 1px 2px rgba(0,0,0,0.3)"
    : "0 0.6px 1.8px rgba(15,23,42,0.09), 0 3.2px 7.2px rgba(15,23,42,0.10)";

  const now = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  // Build citations block up-front so bodyHtml can reference it
  const citList = citations ?? data.citations ?? [];
  const citationsHtml = citList.length > 0 ? `
    <div style="background:${card};border:1px solid ${cardBorder};border-radius:12px;padding:1.25rem;margin-bottom:1rem;">
      <h3 style="margin:0 0 0.75rem;font-size:0.85rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:${subText};">Sources &amp; References</h3>
      <div style="display:flex;flex-direction:column;gap:0.45rem;">
        ${citList.map((c, i) => `
          <div style="display:flex;align-items:flex-start;gap:0.65rem;padding:0.6rem 0.75rem;background:${dark ? "#141824" : "#f8fafc"};border:1px solid ${cardBorder};border-radius:8px;">
            <span style="font-size:0.7rem;font-weight:700;min-width:20px;text-align:center;background:${accent}22;color:${accent};border-radius:50%;padding:0.15rem 0.4rem;flex-shrink:0;">${i + 1}</span>
            <div style="min-width:0;">
              ${ c.url
                  ? `<a href="${escHtml(c.url)}" target="_blank" rel="noopener" style="font-size:0.82rem;color:${accent};text-decoration:none;font-weight:500;word-break:break-word;">${escHtml(c.title)}</a>`
                  : `<span style="font-size:0.82rem;color:${text};font-weight:500;">${escHtml(c.title)}</span>` }
              ${ c.url ? `<div style="font-size:0.72rem;color:${subText};margin-top:0.15rem;word-break:break-all;">${escHtml(c.url)}</div>` : "" }
              ${ c.excerpt ? `<div style="font-size:0.78rem;color:${subText};margin-top:0.2rem;line-height:1.5;">${escHtml(c.excerpt.substring(0, 180))}${c.excerpt.length > 180 ? "…" : ""}</div>` : "" }
            </div>
          </div>`).join("\n")}
      </div>
    </div>` : "";

  let bodyHtml = "";

  if (data.type === "grant_match") {
    const w = data.widget;
    const days = daysUntil(w.deadline);
    const sevColor = (sev: string) =>
      sev === "critical" ? dangerColor : sev === "moderate" ? warnColor : accent;
    const sevBg = (sev: string) =>
      dark
        ? sev === "critical" ? "#2d1515" : sev === "moderate" ? "#2d2010" : "#0f1d35"
        : sev === "critical" ? "#fef2f2" : sev === "moderate" ? "#fffbeb" : "#eff6ff";

    const gapsHtml = w.gaps.length
      ? w.gaps.map(g => `
        <div style="background:${sevBg(g.severity)};border:1px solid ${sevColor(g.severity)}33;border-left:3px solid ${sevColor(g.severity)};border-radius:8px;padding:0.9rem 1rem;margin-bottom:0.6rem;">
          <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.3rem;">
            <span style="font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:${sevColor(g.severity)};background:${sevColor(g.severity)}22;padding:0.1rem 0.45rem;border-radius:20px;">${g.severity}</span>
            <strong style="font-size:0.88rem;color:${text};">${escHtml(g.title)}</strong>
          </div>
          <p style="margin:0.2rem 0 0.1rem;font-size:0.82rem;color:${subText};">${escHtml(g.suggestion)}</p>
        </div>`).join("")
      : `<p style="color:${subText};font-style:italic;font-size:0.85rem;">No critical gaps identified.</p>`;

    const strengthsHtml = w.strengths.map(s =>
      `<li style="margin:0.3rem 0;font-size:0.85rem;color:${text};">${escHtml(s.replace(/\*\*/g, ""))}</li>`
    ).join("");

    const scoreColor = w.matchScore >= 80 ? successColor : w.matchScore >= 60 ? warnColor : dangerColor;
    const circumference = 2 * Math.PI * 44;
    const dashOffset = circumference * (1 - w.matchScore / 100);

    bodyHtml = `
      <!-- Metrics row -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;margin-bottom:1.5rem;">
        <div style="background:${card};border:1px solid ${cardBorder};border-radius:12px;padding:1.25rem;text-align:center;">
          <div style="position:relative;width:100px;height:100px;margin:0 auto 0.5rem;">
            <svg width="100" height="100" viewBox="0 0 100 100" style="transform:rotate(-90deg);">
              <circle cx="50" cy="50" r="44" fill="none" stroke="${dark ? "#1e293b" : "#e2e8f0"}" stroke-width="8"/>
              <circle cx="50" cy="50" r="44" fill="none" stroke="${scoreColor}" stroke-width="8"
                stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}"
                stroke-linecap="round"/>
            </svg>
            <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:1.4rem;font-weight:800;color:${scoreColor};">${w.matchScore}%</div>
          </div>
          <div style="font-size:0.75rem;color:${subText};text-transform:uppercase;letter-spacing:0.07em;">Match Score</div>
        </div>
        <div style="background:${card};border:1px solid ${cardBorder};border-radius:12px;padding:1.25rem;text-align:center;display:flex;flex-direction:column;justify-content:center;">
          <div style="font-size:1.8rem;font-weight:800;color:${accent};">${formatFunding(w.fundingAmount)}</div>
          <div style="font-size:0.72rem;color:${subText};text-transform:uppercase;letter-spacing:0.07em;margin-top:0.4rem;">Available Funding</div>
          <div style="font-size:0.78rem;color:${subText};margin-top:0.25rem;">${escHtml(w.awardRange)}</div>
        </div>
        <div style="background:${card};border:1px solid ${cardBorder};border-radius:12px;padding:1.25rem;text-align:center;display:flex;flex-direction:column;justify-content:center;">
          <div style="font-size:1.8rem;font-weight:800;color:${days === null ? subText : days <= 30 ? dangerColor : days <= 90 ? warnColor : successColor};">${days === null ? "TBD" : days}</div>
          <div style="font-size:0.72rem;color:${subText};text-transform:uppercase;letter-spacing:0.07em;margin-top:0.4rem;">${days === null ? "Deadline" : "Days to Deadline"}</div>
          <div style="font-size:0.78rem;color:${subText};margin-top:0.25rem;">${days === null ? "Rolling / see NOFO" : new Date(w.deadline).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}</div>
        </div>
      </div>

      <!-- Strengths -->
      <div style="background:${card};border:1px solid ${cardBorder};border-radius:12px;padding:1.25rem;margin-bottom:1rem;">
        <h3 style="margin:0 0 0.75rem;font-size:0.85rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:${successColor};">City Strengths</h3>
        <ul style="margin:0;padding-left:1.25rem;">${strengthsHtml}</ul>
      </div>

      <!-- Gaps -->
      <div style="background:${card};border:1px solid ${cardBorder};border-radius:12px;padding:1.25rem;margin-bottom:1rem;">
        <h3 style="margin:0 0 0.75rem;font-size:0.85rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:${warnColor};">Gap Analysis</h3>
        ${gapsHtml}
      </div>

      ${w.narrativeDraft ? `
      <!-- Narrative -->
      <div style="background:${accentLight};border:1px solid ${accent}33;border-radius:12px;padding:1.25rem;margin-bottom:1rem;">
        <h3 style="margin:0 0 0.75rem;font-size:0.85rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:${accent};">Draft Project Narrative</h3>
        <p style="margin:0;font-size:0.85rem;color:${text};line-height:1.7;">${escHtml(w.narrativeDraft)}</p>
      </div>` : ""}

      ${data.redTeamReview ? (() => {
        const rt = data.redTeamReview!;
        const rtColor = rt.overallScore >= 70 ? successColor : rt.overallScore >= 50 ? warnColor : dangerColor;
        const rtCriteriaHtml = rt.criteria.map(c => {
          const cColor = c.status === "pass" ? successColor : c.status === "warn" ? warnColor : dangerColor;
          const cBg = dark
            ? (c.status === "pass" ? "#0f2a1a" : c.status === "warn" ? "#2a1f0a" : "#2a0f0f")
            : (c.status === "pass" ? "#f0fdf4" : c.status === "warn" ? "#fffbeb" : "#fef2f2");
          const pct = Math.round((c.score / 5) * 100);
          return `<div style="background:${cBg};border:1px solid ${cColor}33;border-radius:8px;padding:0.75rem 0.9rem;margin-bottom:0.5rem;">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.35rem;">
              <strong style="font-size:0.82rem;color:${text};">${escHtml(c.name)}</strong>
              <span style="font-size:0.78rem;font-weight:700;color:${cColor};">${c.score}/5</span>
            </div>
            <div style="height:5px;background:${dark?"#1e293b":"#e2e8f0"};border-radius:3px;overflow:hidden;margin-bottom:0.35rem;">
              <div style="height:100%;width:${pct}%;background:${cColor};border-radius:3px;"></div>
            </div>
            <p style="margin:0;font-size:0.78rem;color:${subText};">${escHtml(c.feedback)}</p>
          </div>`;
        }).join("");
        const risksHtml = rt.topRisks.map(r => `<li style="margin:0.3rem 0;font-size:0.82rem;color:${dangerColor};">${escHtml(r)}</li>`).join("");
        const fixesHtml = rt.quickFixes.map(f => `<li style="margin:0.3rem 0;font-size:0.82rem;color:${successColor};">${escHtml(f)}</li>`).join("");
        return `
        <div style="background:${card};border:1px solid ${cardBorder};border-radius:12px;padding:1.25rem;margin-bottom:1rem;">
          <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1rem;padding-bottom:0.75rem;border-bottom:1px solid ${cardBorder};">
            <div style="width:48px;height:48px;border-radius:50%;background:${rtColor}18;border:2px solid ${rtColor}44;display:flex;align-items:center;justify-content:center;font-size:1.3rem;font-weight:900;color:${rtColor};flex-shrink:0;">${rt.overallScore}</div>
            <div>
              <h3 style="margin:0 0 0.2rem;font-size:0.85rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:${subText};">⚖ Red Team Risk Assessment</h3>
              <p style="margin:0;font-size:0.82rem;color:${text};">${escHtml(rt.reviewerVerdict)}</p>
            </div>
          </div>
          ${rtCriteriaHtml}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-top:0.75rem;">
            <div>
              <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:${dangerColor};margin-bottom:0.4rem;">Top Risks</div>
              <ul style="padding-left:1.1rem;margin:0;">${risksHtml}</ul>
            </div>
            <div>
              <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:${successColor};margin-bottom:0.4rem;">Quick Fixes</div>
              <ul style="padding-left:1.1rem;margin:0;">${fixesHtml}</ul>
            </div>
          </div>
        </div>`;
      })() : ""}

      ${data.competitorIntel ? (() => {
        const ci = data.competitorIntel!;
        const winColor = ci.winProbability >= 60 ? successColor : ci.winProbability >= 40 ? warnColor : dangerColor;
        const levelColor = ci.competitionLevel === "low" ? successColor : ci.competitionLevel === "medium" ? warnColor : dangerColor;
        const competitorsHtml = ci.keyCompetitors.map(c => {
          const tColor = c.threat === "high" ? dangerColor : c.threat === "medium" ? warnColor : successColor;
          return `<div style="display:flex;align-items:flex-start;gap:0.6rem;padding:0.55rem 0.7rem;background:${dark?"#141824":"#f8fafc"};border:1px solid ${cardBorder};border-radius:7px;margin-bottom:0.35rem;">
            <span style="font-size:0.65rem;font-weight:700;padding:0.1rem 0.4rem;border-radius:20px;background:${tColor}22;color:${tColor};white-space:nowrap;flex-shrink:0;margin-top:1px;">${c.threat.toUpperCase()}</span>
            <div><strong style="font-size:0.8rem;color:${text};">${escHtml(c.type)}</strong> <span style="font-size:0.78rem;color:${subText};">— ${escHtml(c.description)}</span></div>
          </div>`;
        }).join("");
        const diffsHtml = ci.differentiators.map(d => `<li style="margin:0.3rem 0;font-size:0.82rem;color:${text};">${escHtml(d)}</li>`).join("");
        return `
        <div style="background:${card};border:1px solid ${cardBorder};border-radius:12px;padding:1.25rem;margin-bottom:1rem;">
          <h3 style="margin:0 0 0.75rem;font-size:0.85rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:${subText};">Competitive Positioning</h3>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.75rem;margin-bottom:1rem;">
            <div style="text-align:center;padding:0.75rem;background:${dark?"#141824":"#f8fafc"};border:1px solid ${cardBorder};border-radius:8px;">
              <div style="font-size:1.5rem;font-weight:800;color:${winColor};">${ci.winProbability}%</div>
              <div style="font-size:0.68rem;color:${subText};text-transform:uppercase;letter-spacing:0.06em;margin-top:0.2rem;">Win Probability</div>
            </div>
            <div style="text-align:center;padding:0.75rem;background:${dark?"#141824":"#f8fafc"};border:1px solid ${cardBorder};border-radius:8px;">
              <div style="font-size:1.1rem;font-weight:800;color:${levelColor};text-transform:capitalize;">${ci.competitionLevel}</div>
              <div style="font-size:0.68rem;color:${subText};text-transform:uppercase;letter-spacing:0.06em;margin-top:0.2rem;">Competition Level</div>
            </div>
            <div style="text-align:center;padding:0.75rem;background:${dark?"#141824":"#f8fafc"};border:1px solid ${cardBorder};border-radius:8px;">
              <div style="font-size:1.5rem;font-weight:800;color:${text};">~${ci.estimatedApplicants}</div>
              <div style="font-size:0.68rem;color:${subText};text-transform:uppercase;letter-spacing:0.06em;margin-top:0.2rem;">Applicants Est.</div>
            </div>
          </div>
          <div style="margin-bottom:0.75rem;">${competitorsHtml}</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;">
            <div>
              <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:${accent};margin-bottom:0.4rem;">Your Differentiators</div>
              <ul style="padding-left:1.1rem;margin:0;">${diffsHtml}</ul>
            </div>
            <div style="background:${accentLight};border:1px solid ${accent}33;border-radius:8px;padding:0.75rem;">
              <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:${accent};margin-bottom:0.4rem;">Strategy Tip</div>
              <p style="margin:0;font-size:0.8rem;color:${text};line-height:1.55;">${escHtml(ci.strategyTip)}</p>
            </div>
          </div>
        </div>`;
      })() : ""}

      ${citationsHtml}

      <!-- Full analysis -->
      ${data.analysisText ? `
      <div style="background:${card};border:1px solid ${cardBorder};border-radius:12px;padding:1.4rem 1.5rem 1.25rem;">
        <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:1.1rem;padding-bottom:0.75rem;border-bottom:1px solid ${cardBorder};">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${accent};flex-shrink:0;"></span>
          <h3 style="margin:0;font-size:0.74rem;font-weight:800;text-transform:uppercase;letter-spacing:0.1em;color:${subText};">Full Analysis</h3>
        </div>
        <div style="color:${text};">${mdToHtml(escHtml(data.analysisText))}</div>
      </div>` : ""}
    `;
  } else {
    bodyHtml = data.analysisText
      ? `<div style="background:${card};border:1px solid ${cardBorder};border-radius:12px;padding:1.5rem;">
           <div style="font-size:0.875rem;color:${text};line-height:1.75;">${mdToHtml(escHtml(data.analysisText))}</div>
           ${citationsHtml}
         </div>`
      : "";
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${escHtml(data.title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com"/>
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{background:${bg};color:${text};font-family:'Inter',-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;padding:2rem;font-size:14px;}
    @media print{body{padding:0.5in}}
    h2,h3,h4{color:${text};margin:0.8rem 0 0.3rem}
    p{margin:0.3rem 0}
    li{margin:0.2rem 0}
    code{background:${dark?"#1e293b":"#f1f5f9"};padding:0.1em 0.3em;border-radius:3px;font-size:0.82em;font-family:'JetBrains Mono',monospace}
    .report-container{max-width:820px;margin:0 auto}
    .report-container > div{box-shadow:${cardShadow};}
  </style>
</head>
<body>
<div class="report-container">
  <div style="background:${headerBg};border-radius:16px;padding:2.25rem 2.25rem 1.75rem;margin-bottom:1.5rem;color:#fff;position:relative;overflow:hidden;box-shadow:0 10px 30px rgba(37,99,235,0.22);">
    <div style="font-size:0.64rem;font-weight:700;text-transform:uppercase;letter-spacing:0.14em;color:#c7d2fe;margin-bottom:0.6rem;display:inline-block;background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.18);border-radius:100px;padding:0.28rem 0.7rem;">GRANT ANALYSIS REPORT &middot; CIVICGRANT IQ</div>
    <h1 style="font-size:1.85rem;font-weight:800;color:#fff;margin:0 0 0.5rem;letter-spacing:-0.025em;text-shadow:0 1px 12px rgba(0,0,0,0.15);">${escHtml(data.title)}</h1>
    ${data.type === "grant_match" ? `
    <div style="display:flex;gap:1.5rem;flex-wrap:wrap;margin-top:0.75rem;">
      <span style="font-size:0.8rem;color:#93c5fd;">${escHtml(data.widget.agency)}</span>
      <span style="font-size:0.8rem;color:#93c5fd;">Deadline: ${safeDate(data.widget.deadline, { month: "long", day: "numeric", year: "numeric" })}</span>
      <span style="font-size:0.8rem;color:#94a3b8;">Generated: ${now}</span>
    </div>` : `<div style="font-size:0.8rem;color:#94a3b8;margin-top:0.5rem;">Generated: ${now}</div>`}
  </div>
  ${bodyHtml}
  <div style="text-align:center;padding:2rem 0 0.5rem;font-size:0.7rem;color:${subText};">
    Generated by CivicGrant IQ · Powered by Microsoft Foundry IQ · Azure AI Search
  </div>
</div>
</body>
</html>`;
}

// ─── Component ────────────────────────────────────────────────────────────
interface ReportPreviewModalProps {
  data: ReportPayload;
  onClose: () => void;
}

export function ReportPreviewModal({ data, onClose }: ReportPreviewModalProps) {
  const [dark, setDark] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [dlOpen, setDlOpen] = useState(false);
  const dlRef = useRef<HTMLDivElement>(null);

  const citations = data.citations;
  const html = generateReportHtml(data, dark, citations);

  const downloadAs = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setDlOpen(false);
  };

  const handleDownloadHtml = () =>
    downloadAs(`civicgrant-report.html`, html, "text/html");

  const handleDownloadWord = () => {
    const docHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="UTF-8"><title>${data.title}</title></head>
      <body>${generateReportHtml(data, false, citations)}</body></html>`;
    downloadAs(`civicgrant-report.doc`, docHtml, "application/msword");
  };

  const handleDownloadPdf = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(generateReportHtml(data, false, citations));
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
    setDlOpen(false);
  };

  return (
    <div className={`rp-overlay ${fullscreen ? "rp-overlay--fullscreen" : ""}`} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`rp-modal ${fullscreen ? "rp-modal--fullscreen" : ""}`}>

        {/* Toolbar */}
        <div className="rp-toolbar">
          <div className="rp-toolbar-left">
            <IconChart size={16} color="#3b82f6" className="rp-toolbar-icon" />
            <span className="rp-toolbar-title">{data.title}</span>
          </div>
          <div className="rp-toolbar-right">
            {/* Theme toggle */}
            <button
              className="rp-tool-btn"
              title={dark ? "Switch to light mode" : "Switch to dark mode"}
              onClick={() => setDark(!dark)}
            >
              {dark ? <IconSun size={15} /> : <IconMoon size={15} />}
            </button>

            {/* Present / fullscreen */}
            <button
              className="rp-tool-btn"
              title={fullscreen ? "Exit fullscreen" : "Present fullscreen"}
              onClick={() => setFullscreen(!fullscreen)}
            >
              {fullscreen ? <IconMinimize size={15} /> : <IconMaximize size={15} />}
            </button>

            {/* Download menu */}
            <div className="rp-dl-wrapper" ref={dlRef}>
              <button className="rp-dl-btn" onClick={() => setDlOpen(!dlOpen)}>
                <IconDownload size={13} color="#fff" />
                Download
                <IconChevronDown size={11} color="#93c5fd" className="rp-dl-caret" />
              </button>
              {dlOpen && (
                <div className="rp-dl-menu">
                  <button className="rp-dl-item" onClick={handleDownloadHtml}>
                    <IconGlobe size={16} className="rp-dl-item-icon" />
                    <div>
                      <div className="rp-dl-item-label">HTML Report</div>
                      <div className="rp-dl-item-sub">View in any browser</div>
                    </div>
                  </button>
                  <button className="rp-dl-item" onClick={handleDownloadWord}>
                    <IconFileText size={16} className="rp-dl-item-icon" />
                    <div>
                      <div className="rp-dl-item-label">Word Document (.doc)</div>
                      <div className="rp-dl-item-sub">Open &amp; edit in Microsoft Word</div>
                    </div>
                  </button>
                  <button className="rp-dl-item" onClick={handleDownloadPdf}>
                    <IconFilePdf size={16} className="rp-dl-item-icon" />
                    <div>
                      <div className="rp-dl-item-label">PDF</div>
                      <div className="rp-dl-item-sub">Print or save as PDF</div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            <div className="rp-divider" />
            <button className="rp-tool-btn rp-close-btn" title="Close" onClick={onClose}>
              <IconX size={15} />
            </button>
          </div>
        </div>

        {/* Report preview iframe */}
        <div className="rp-preview">
          <iframe
            className="rp-iframe"
            srcDoc={html}
            sandbox="allow-same-origin"
            title="Report Preview"
          />
        </div>

        {/* Status bar */}
        <div className="rp-statusbar">
          <span className="rp-status-text">
            {data.type === "grant_match"
              ? `${data.widget.matchScore}% match · ${formatFunding(data.widget.fundingAmount)} available · Deadline ${safeDate(data.widget.deadline)}`
              : "Grant pipeline analysis"}
          </span>
          <span className="rp-status-hint">
            {dark ? "Dark mode" : "Light mode"} · Share with staff via Download
          </span>
        </div>
      </div>
    </div>
  );
}
