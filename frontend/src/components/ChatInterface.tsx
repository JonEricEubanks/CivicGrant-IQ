import { useState, useRef, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { streamChat, generatePackage, draftApplication, fetchGrantUrl, fetchMonitor, fetchHeroGrants } from "../api";
import type { FetchedUrl, MonitorData, HeroGrantResult } from "../api";
import type { ReasoningStep, Citation, RedTeamResult, CompetitorIntelResult, RefinedNarrativeResult, OrchestrationDecision, WorkIqCityContext } from "../types";
import { GrantMatchWidget } from "./GrantMatchWidget";
import type { GrantMatchData } from "./GrantMatchWidget";
import { GrantPipelineWidget } from "./GrantPipelineWidget";
import type { PipelineGrant } from "./GrantPipelineWidget";
import type { DrawerView } from "./AgentDrawer";
import { AgentDrawer } from "./AgentDrawer";
import { ReportPreviewModal } from "./ReportPreviewModal";
import type { ReportPayload } from "./ReportPreviewModal";
import { GrantRadarSkeleton } from "./GrantRadarSkeleton";
import { AgentOrchestraBar } from "./AgentOrchestraBar";
import { AppHeader } from "./AppHeader";
import { TierBadge } from "./TierBadge";
import { GraphPathsPanel } from "./GraphPathsPanel";
import {
  IconBuilding, IconSearch, IconSettings, IconNewChat,
  IconCopy, IconCheck, IconBolt,
  IconChart, IconFilePdf, IconFileText, IconGlobe,
  IconLink, IconScales, IconTarget, IconSparkle, IconAward,
} from "./Icons";
import "./ChatInterface.css";

type WidgetPayload =
  | { type: "grant_match"; data: GrantMatchData }
  | { type: "grant_pipeline"; data: { grants: PipelineGrant[]; cityName: string; totalOpportunity: number } };

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoningSteps?: ReasoningStep[];
  citations?: Citation[];
  widget?: WidgetPayload;
  decisions?: OrchestrationDecision[];
  redTeamReview?: RedTeamResult;
  competitorIntel?: CompetitorIntelResult;
  refinedNarrative?: RefinedNarrativeResult;
  workIqContext?: WorkIqCityContext;
  tierInfo?: { tier: 1 | 2 | 3; label: string; guardrailsPassed: boolean; violations: number };
  graphPaths?: import("../types").GraphPath[];
  reviewStreaming?: boolean;
  competitorStreaming?: boolean;
  refinementStreaming?: boolean;
  streaming?: boolean;
  statusLog?: string[];
  startedAt?: number;
  completedAt?: number;
  isFollowUp?: boolean;
}

const HERO_GRANTS_DEFAULT: HeroGrantResult[] = [
  {
    name: "RAISE Grant",
    agency: "U.S. Dept of Transportation",
    match: 85,
    funding: "$5M+",
    daysLeft: null,
    awardCeiling: null,
    closeDate: null,
    prompt: "Analyze USDOT RAISE grant for Buffalo Grove IL — Aptakisic Road/IL-83 intersection improvement project",
  },
  {
    name: "HUD CDBG",
    agency: "Housing & Urban Development",
    match: 72,
    funding: "$2.1M",
    daysLeft: null,
    awardCeiling: null,
    closeDate: null,
    prompt: "What HUD CDBG grants does Buffalo Grove IL (Lake County) qualify for with our senior housing and community facility priorities?",
  },
  {
    name: "EPA Water SRF",
    agency: "U.S. Environmental Protection Agency",
    match: 68,
    funding: "$1.6M",
    daysLeft: null,
    awardCeiling: null,
    closeDate: null,
    prompt: "Find EPA Water State Revolving Fund grants for Buffalo Grove IL stormwater and water main replacement projects",
  },
];

const FULL_CIP_CARD = {
  name: "Full CIP Scan",
  agency: "Multiple Federal Agencies",
  match: null as number | null,
  funding: "$8.7M+" as string | null,
  daysLeft: null as number | null,
  prompt: "What federal and Illinois state grants overlap Buffalo Grove IL capital improvement plan this fiscal year? Include IDOT, CMAP, DCEO, FEMA BRIC, and EPA programs.",
};

/** Format a dollar amount given in millions as a compact "$X.XB+" / "$X.XM+" string. */
function formatHeroAmount(millions: number): string {
  if (millions >= 1000) return `$${(millions / 1000).toFixed(2)}B+`;
  if (millions >= 100) return `$${Math.round(millions)}M+`;
  return `$${millions.toFixed(1)}M+`;
}

// ─── Simple markdown renderer ─────────────────────────────────────────────
function renderMarkdown(text: string) {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let i = 0;

  // Helper: is line[j] the start of a list (bullet or numbered)?
  const isListStart = (j: number) => {
    if (j >= lines.length) return false;
    const t = lines[j].trim();
    return t.startsWith("- ") || t.startsWith("* ") || /^\d+\.\s/.test(t);
  };

  // Helper: is a plain text line acting as an implicit section heading?
  // Criteria: non-empty, no markdown prefix, short (<= 70 chars), no sentence-ending punct,
  //           and the NEXT non-empty line starts a list.
  const isImplicitHeading = (j: number) => {
    const t = lines[j].trim();
    if (!t || t.length > 70) return false;
    if (/^[#\-*>]|^\d+\./.test(t)) return false;  // has markdown prefix
    if (/^\*\*/.test(t)) return false;              // bold line (handled separately)
    if (/[.!?]$/.test(t)) return false;             // ends like a sentence
    // Look ahead for next non-empty line
    let k = j + 1;
    while (k < lines.length && lines[k].trim() === "") k++;
    return isListStart(k);
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (/^(?:#{1,4}\s*|\*\*)?\s*Step\s+\d+\s*[\u2014\-]/i.test(trimmed)) {
      // Reasoning step heading — e.g. "Step 1 — Parse the Grant"
      const clean = trimmed.replace(/^#{1,4}\s*/, "").replace(/^\*\*|\*\*$/g, "").trim();
      out.push(<p key={i} className="md-step-heading">{clean}</p>);
    } else if (line.startsWith("### ")) {
      out.push(<h4 key={i} className="md-h4">{line.slice(4)}</h4>);
    } else if (line.startsWith("## ")) {
      out.push(<h3 key={i} className="md-h3">{line.slice(3)}</h3>);
    } else if (line.startsWith("# ")) {
      out.push(<h2 key={i} className="md-h2">{line.slice(2)}</h2>);
    } else if (/^\*\*[^*]+\*\*$/.test(trimmed) && trimmed.length > 4) {
      // Standalone bold-only line → section heading
      out.push(<h3 key={i} className="md-h3">{trimmed.slice(2, -2)}</h3>);
    } else if (isImplicitHeading(i)) {
      // Plain-text line immediately before a list → treat as section heading
      out.push(<h3 key={i} className="md-h3">{renderInline(trimmed)}</h3>);
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      // Group consecutive bullet items into a <ul> (handles indented bullets too)
      const items: React.ReactNode[] = [];
      const startIdx = i;
      while (i < lines.length) {
        const t = lines[i].trim();
        if (!t.startsWith("- ") && !t.startsWith("* ")) break;
        items.push(<li key={i} className="md-li">{renderInline(t.slice(2))}</li>);
        i++;
      }
      out.push(<ul key={`ul-${startIdx}`} className="md-ul">{items}</ul>);
      continue;
    } else if (/^\d+\.\s/.test(line)) {
      // Group consecutive numbered items into an <ol>
      const items: React.ReactNode[] = [];
      const startIdx = i;
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(<li key={i} className="md-oli">{renderInline(lines[i].replace(/^\d+\.\s/, ""))}</li>);
        i++;
      }
      out.push(<ol key={`ol-${startIdx}`} className="md-ol">{items}</ol>);
      continue;
    } else if (line.trim() === "") {
      out.push(<div key={i} className="md-spacer" />);
    } else {
      out.push(<p key={i} className="md-p">{renderInline(line)}</p>);
    }
    i++;
  }
  return <>{out}</>;
}

function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={i}>{part.slice(1, -1)}</em>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={i} className="md-code">{part.slice(1, -1)}</code>;
    return part;
  });
}

// Strip widget JSON block from display text.
// Also strips an incomplete block that's still streaming (no closing ```).
function cleanAnswerText(text: string): string {
  return text
    .replace(/```widget[\s\S]*?```/g, "")    // complete block
    .replace(/```widget[\s\S]*$/, "")         // incomplete block (mid-stream)
    .trim();
}

// ─── Sectioned markdown renderer — used in reply card body ───────────────────
// Parses text into [intro paragraphs] + [section: heading + items]
// Renders each section as a `.rs-section` block matching the widget's design system.
function renderSectionedMarkdown(text: string): React.ReactNode {
  if (!text) return null;
  type Block =
    | { kind: "intro"; lines: string[] }
    | { kind: "section"; heading: string; lines: string[] };

  const rawLines = text.split("\n");
  const blocks: Block[] = [];
  let current: Block = { kind: "intro", lines: [] };

  const isHeadingLine = (line: string): string | null => {
    const t = line.trim();
    if (!t) return null;
    if (line.startsWith("### ")) return line.slice(4).trim();
    if (line.startsWith("## ")) return line.slice(3).trim();
    if (line.startsWith("# ")) return line.slice(2).trim();
    if (/^\*\*[^*]+\*\*$/.test(t) && t.length > 4) return t.slice(2, -2);
    // Implicit heading: short, no punct, followed by a list
    if (t.length <= 70 && !/^[#\-*>]|^\d+\./.test(t) && !/^\*\*/.test(t) && !/[.!?]$/.test(t)) {
      const nextNonEmpty = rawLines.slice(rawLines.indexOf(line) + 1).find(l => l.trim());
      if (nextNonEmpty) {
        const n = nextNonEmpty.trim();
        if (n.startsWith("- ") || n.startsWith("* ") || /^\d+\.\s/.test(n)) return t;
      }
    }
    return null;
  };

  for (const line of rawLines) {
    const heading = isHeadingLine(line);
    if (heading) {
      blocks.push(current);
      current = { kind: "section", heading, lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  blocks.push(current);

  // Collect items from a block's lines into typed entries
  type ItemEntry =
    | { type: "card"; title: string; body: string }
    | { type: "chip"; text: string }
    | { type: "para"; text: string };

  const parseLines = (lines: string[]): ItemEntry[] => {
    const entries: ItemEntry[] = [];
    let i = 0;
    while (i < lines.length) {
      const t = lines[i].trim();
      if (!t) { i++; continue; }

      // Bullet or numbered item
      const isBullet = t.startsWith("- ") || t.startsWith("* ");
      const isNum = /^\d+\.\s/.test(t);
      if (isBullet || isNum) {
        const raw = isBullet ? t.slice(2) : t.replace(/^\d+\.\s/, "");
        // Collect any indented continuation lines
        let full = raw;
        while (i + 1 < lines.length) {
          const next = lines[i + 1];
          if (next.trim() && !next.trim().startsWith("- ") && !next.trim().startsWith("* ") && !/^\d+\.\s/.test(next.trim()) && (next.startsWith("   ") || next.startsWith("\t"))) {
            full += " " + next.trim();
            i++;
          } else break;
        }
        // "**Title**: description" → card; short or no colon → chip
        const cardMatch = full.match(/^\*\*([^*]+)\*\*\s*[:\-–—]\s*(.+)/);
        if (cardMatch) {
          entries.push({ type: "card", title: cardMatch[1], body: cardMatch[2] });
        } else if (full.length <= 60 && !full.includes(":")) {
          entries.push({ type: "chip", text: full.replace(/\*\*/g, "") });
        } else {
          // Treat like a card: bold part before colon is title, rest is body
          const splitColon = full.match(/^([^:]{4,50}):\s*(.{10,})/);
          if (splitColon) {
            entries.push({ type: "card", title: splitColon[1].replace(/\*\*/g, ""), body: splitColon[2] });
          } else {
            entries.push({ type: "chip", text: full.replace(/\*\*/g, "") });
          }
        }
      } else {
        entries.push({ type: "para", text: t });
      }
      i++;
    }
    return entries;
  };

  const renderEntries = (entries: ItemEntry[], sectionKey: string): React.ReactNode => {
    // All chips (short, no colon) → pill row (e.g. city strengths)
    const allChips = entries.every(e => e.type === "chip");
    if (allChips && entries.length > 0) {
      return (
        <div className="rs-chip-row">
          {entries.map((e, j) => (
            <span key={`${sectionKey}-c${j}`} className="rs-chip">{(e as { type: "chip"; text: string }).text}</span>
          ))}
        </div>
      );
    }
    return (
      <div className="rs-items">
        {entries.map((e, j) => {
          if (e.type === "card") {
            return (
              <div key={`${sectionKey}-item${j}`} className="rs-item-card">
                <span className="rs-item-title">{e.title}</span>
                <span className="rs-item-body">{renderInline(e.body)}</span>
              </div>
            );
          }
          if (e.type === "chip") {
            return <div key={`${sectionKey}-chip${j}`} className="rs-item-card rs-item-card--chip">{e.text}</div>;
          }
          // para
          return <p key={`${sectionKey}-p${j}`} className="rs-para">{renderInline(e.text)}</p>;
        })}
      </div>
    );
  };

  // Section icon heuristic based on heading text
  const sectionIcon = (heading: string): string => {
    const h = heading.toLowerCase();
    if (/compet|municip|who else|cities/.test(h)) return "🏙";
    if (/strength|advantage|edge|past|track record/.test(h)) return "✓";
    if (/gap|weakness|missing|risk|challenge/.test(h)) return "⚠";
    if (/strategy|next step|action|recommend|improve|boost/.test(h)) return "→";
    if (/comparison|compare|profile|buffalo/.test(h)) return "◈";
    if (/conclusion|summary|overall/.test(h)) return "◎";
    if (/timeline|deadline|schedule/.test(h)) return "📅";
    return "•";
  };

  return (
    <div className="rs-body">
      {blocks.map((block, bi) => {
        if (block.kind === "intro") {
          const paras = block.lines.filter(l => l.trim());
          if (!paras.length) return null;
          return (
            <div key={`intro-${bi}`} className="rs-intro">
              {paras.map((l, j) => <p key={j} className="rs-intro-para">{renderInline(l.trim())}</p>)}
            </div>
          );
        }
        const entries = parseLines(block.lines);
        if (!entries.length) return null;
        return (
          <div key={`sec-${bi}`} className="rs-section">
            <div className="rs-section-header">
              <span className="rs-section-icon">{sectionIcon(block.heading)}</span>
              <span className="rs-section-title">{block.heading.toUpperCase()}</span>
            </div>
            {renderEntries(entries, `sec-${bi}`)}
          </div>
        );
      })}
    </div>
  );
}

// Contextual follow-up chips — generated from the widget data
function getFollowUpChips(data: import("./GrantMatchWidget").GrantMatchData): Array<{ label: string; prompt: string }> {
  const chips: Array<{ label: string; prompt: string }> = [];
  const topGap = data.gaps?.find(g => g.severity === "critical") ?? data.gaps?.find(g => g.severity === "moderate");
  if (topGap) {
    const title = topGap.title.length > 28 ? topGap.title.slice(0, 28) + "…" : topGap.title;
    chips.push({
      label: `Fix: ${title}`,
      prompt: `How can Buffalo Grove specifically close the "${topGap.title}" gap for ${data.grantName}? Give concrete steps, responsible departments, and timeline.`,
    });
  }
  chips.push({
    label: "Who else is competing?",
    prompt: `Which Illinois municipalities typically compete for ${data.grantName} and how does Buffalo Grove's profile compare to past winning applicants?`,
  });
  if (data.matchScore < 85) {
    chips.push({
      label: "Boost match score",
      prompt: `What 3 targeted improvements would raise Buffalo Grove's match score for ${data.grantName} above 85%? Focus on quick wins we can execute this quarter.`,
    });
  }
  chips.push({
    label: "Scan full CIP for grants",
    prompt: "What federal and Illinois state grants overlap Buffalo Grove IL capital improvement plan this fiscal year? Include IDOT, CMAP, DCEO, FEMA BRIC, and EPA programs.",
  });
  return chips.slice(0, 4);
}

// Generate a downloadable Grant Readiness Certificate HTML file
function generateCertificate(data: import("./GrantMatchWidget").GrantMatchData): string {
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const tier = data.matchScore >= 70 ? "CONFIRMED ELIGIBLE" : data.matchScore >= 45 ? "LIKELY ELIGIBLE" : "POTENTIAL MATCH";
  const tierColor = data.matchScore >= 70 ? "#16a34a" : data.matchScore >= 45 ? "#b45309" : "#6b7280";
  const fmtAmount = data.fundingAmount >= 1_000_000_000
    ? `$${(data.fundingAmount / 1_000_000_000).toFixed(1)}B`
    : data.fundingAmount >= 1_000_000
    ? `$${(data.fundingAmount / 1_000_000).toFixed(1)}M`
    : data.fundingAmount > 0 ? `$${(data.fundingAmount / 1000).toFixed(0)}K` : "Varies";
  const topStrengths = (data.strengths ?? []).slice(0, 3);
  const criticalGaps = (data.gaps ?? []).filter(g => g.severity === "critical").length;
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Grant Readiness Certificate — ${data.grantName.replace(/</g, "&lt;")}</title><style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; background: #eef2f8; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 2rem; }
.cert { background: #fff; border-radius: 20px; max-width: 700px; width: 100%; overflow: hidden; box-shadow: 0 20px 60px rgba(14,58,110,0.15); }
.cert-header { background: linear-gradient(135deg, #0e3a6e 0%, #1a6fba 60%, #0e3a6e 100%); padding: 2.75rem 3rem 2.25rem; text-align: center; position: relative; overflow: hidden; }
.cert-header::before { content: ""; position: absolute; inset: 0; background: repeating-linear-gradient(45deg, rgba(255,255,255,0.02) 0px, rgba(255,255,255,0.02) 1px, transparent 1px, transparent 8px); }
.cert-watermark { font-size: 0.6rem; font-weight: 800; letter-spacing: 0.28em; color: rgba(255,255,255,0.45); text-transform: uppercase; margin-bottom: 1.5rem; position: relative; }
.cert-seal { width: 68px; height: 68px; background: rgba(255,255,255,0.12); border: 2px solid rgba(255,255,255,0.3); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.1rem; font-size: 1.8rem; position: relative; }
.cert-eyebrow { font-size: 0.68rem; font-weight: 700; letter-spacing: 0.22em; color: rgba(255,255,255,0.6); text-transform: uppercase; margin-bottom: 0.45rem; position: relative; }
.cert-org { font-size: 1.9rem; font-weight: 900; color: #fff; letter-spacing: -0.02em; line-height: 1.15; position: relative; }
.cert-sub { font-size: 0.8rem; color: rgba(255,255,255,0.65); margin-top: 0.35rem; position: relative; }
.cert-body { padding: 2.25rem 3rem 0; }
.cert-intro { text-align: center; font-size: 0.82rem; color: #6b7280; margin-bottom: 1.75rem; line-height: 1.65; }
.cert-grant-name { font-size: 1.35rem; font-weight: 800; color: #0e3a6e; text-align: center; margin-bottom: 0.25rem; letter-spacing: -0.01em; }
.cert-agency { font-size: 0.8rem; color: #6b7280; text-align: center; margin-bottom: 1.75rem; }
.cert-score-row { display: flex; gap: 0.85rem; margin-bottom: 1.75rem; }
.cert-score-card { flex: 1; background: #f8faff; border: 1px solid #dbeafe; border-radius: 14px; padding: 1.1rem 0.75rem; text-align: center; }
.cert-score-val { font-size: 2.2rem; font-weight: 900; line-height: 1; letter-spacing: -0.03em; }
.cert-score-lbl { font-size: 0.63rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #9ca3af; margin-top: 5px; }
.cert-tier-badge { display: inline-flex; align-items: center; padding: 3px 12px; border-radius: 100px; font-size: 0.63rem; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; margin-top: 6px; border: 1px solid; }
.cert-strengths { margin-bottom: 1.75rem; }
.cert-section-title { font-size: 0.6rem; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase; color: #9ca3af; margin-bottom: 0.65rem; padding-bottom: 0.4rem; border-bottom: 1px solid #f3f4f6; }
.cert-strength-item { display: flex; align-items: flex-start; gap: 8px; padding: 0.45rem 0; font-size: 0.8rem; color: #374151; line-height: 1.45; }
.cert-check { width: 17px; height: 17px; background: #dcfce7; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: #16a34a; font-size: 0.55rem; font-weight: 900; margin-top: 2px; }
.cert-footer { background: #f8faff; border-top: 1px solid #e8f1ff; padding: 1.25rem 3rem; display: flex; align-items: center; justify-content: space-between; margin-top: 2rem; }
.cert-footer-brand { font-size: 0.78rem; font-weight: 800; color: #0e3a6e; }
.cert-footer-sub { font-size: 0.62rem; color: #9ca3af; margin-top: 2px; }
.cert-grounded { display: inline-flex; align-items: center; gap: 5px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 20px; padding: 3px 9px; font-size: 0.6rem; font-weight: 700; color: #2563eb; text-transform: uppercase; letter-spacing: 0.06em; margin-top: 5px; }
.cert-footer-date { font-size: 0.68rem; color: #6b7280; text-align: right; line-height: 1.5; }
@media print { body { background: white; padding: 0; } .cert { box-shadow: none; border-radius: 0; max-width: 100%; } }
</style></head>
<body><div class="cert">
  <div class="cert-header">
    <div class="cert-watermark">CivicGrant IQ &middot; Official Assessment</div>
    <div class="cert-seal">&#127963;</div>
    <div class="cert-eyebrow">Grant Readiness Certificate</div>
    <div class="cert-org">City of Buffalo Grove, IL</div>
    <div class="cert-sub">Population 41,496 &nbsp;&middot;&nbsp; Lake County &nbsp;&middot;&nbsp; Moody&#8217;s Aa2</div>
  </div>
  <div class="cert-body">
    <p class="cert-intro">This certificate confirms that the City of Buffalo Grove, Illinois has been evaluated for eligibility and readiness against the following federal grant opportunity:</p>
    <div class="cert-grant-name">${data.grantName.replace(/</g, "&lt;")}</div>
    <div class="cert-agency">${data.agency.replace(/</g, "&lt;")}</div>
    <div class="cert-score-row">
      <div class="cert-score-card">
        <div class="cert-score-val" style="color:${tierColor}">${data.matchScore}%</div>
        <div class="cert-score-lbl">Readiness Score</div>
        <div class="cert-tier-badge" style="color:${tierColor};background:${tierColor}18;border-color:${tierColor}44">${tier}</div>
      </div>
      <div class="cert-score-card">
        <div class="cert-score-val" style="color:#1a6fba">${fmtAmount}</div>
        <div class="cert-score-lbl">Max Award</div>
      </div>
      <div class="cert-score-card">
        <div class="cert-score-val" style="color:#7c3aed;font-size:1.8rem">${criticalGaps}</div>
        <div class="cert-score-lbl">Critical Gaps</div>
      </div>
    </div>
    ${topStrengths.length > 0 ? `<div class="cert-strengths"><div class="cert-section-title">Verified City Strengths</div>${topStrengths.map(s => `<div class="cert-strength-item"><div class="cert-check">&#10003;</div><span>${s.replace(/\*\*/g, "").replace(/</g, "&lt;")}</span></div>`).join("")}</div>` : ""}
  </div>
  <div class="cert-footer">
    <div>
      <div class="cert-footer-brand">CivicGrant IQ</div>
      <div class="cert-footer-sub">Powered by Microsoft Azure Foundry IQ</div>
      <div class="cert-grounded">&#11042; Foundry IQ Grounded &middot; Evidence-Based</div>
    </div>
    <div class="cert-footer-date">
      <div>Generated ${today}</div>
      <div style="font-size:0.6rem;color:#9ca3af;margin-top:2px">CivicGrant IQ Assessment Engine</div>
    </div>
  </div>
</div></body></html>`;
  return html;
}

// ─── Tool call status line ───────────────────────────────────────────────
function ToolCallLine({ status, done }: { status: string; done: boolean }) {
  const lc = status.toLowerCase();
  const icon = lc.includes("connect") ? <IconBuilding size={13} />
    : lc.includes("search") ? <IconSearch size={13} />
    : lc.includes("analyz") ? <IconChart size={13} />
    : lc.includes("generat") ? <IconChart size={13} />
    : lc.includes("retriev") ? <IconFileText size={13} />
    : <IconSettings size={13} />;
  return (
    <div className={`tool-call-line ${done ? "tool-call-line--done" : "tool-call-line--active"}`}>
      <span className="tcl-icon">{icon}</span>
      <span className="tcl-text">{status}</span>
      {!done && <span className="tcl-spinner" />}
    </div>
  );
}

// ─── Answer peek — collapsed scrollable window for streaming / full text ───────
function AnswerPeek({ children, streaming, label }: { children: React.ReactNode; streaming: boolean; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="answer-peek-wrap">
      <button className="answer-peek-toggle" onClick={() => setOpen(o => !o)}>
        <span className="answer-peek-toggle-label">
          {label ?? (streaming ? "View live reasoning…" : "View reasoning")}
        </span>
        <span className="answer-peek-toggle-chevron">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className={`answer-peek${streaming ? " answer-peek--streaming" : ""}`}>
          <div className="assistant-text">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Reply card — same visual family as GrantMatchWidget
// isFollowUp=true → "↩ FOLLOW-UP" badge; isFollowUp=false → "◈ AI ANALYSIS" badge
// streaming=true → plain renderMarkdown (partial text); done → renderSectionedMarkdown
function FollowUpCard({ content = "", streaming, isFollowUp = true }: { content: string; streaming: boolean; isFollowUp?: boolean }) {
  return (
    <div className={`followup-card${streaming ? " followup-card--streaming" : ""}`}>
      <div className="followup-card-tag">
        <span className="followup-tag-badge">
          <span className="followup-tag-icon">{isFollowUp ? "↩" : "◈"}</span>
          {isFollowUp ? "Follow-up Reply" : "AI Analysis"}
        </span>
        {streaming && (
          <span className="followup-tag-live">
            <span className="followup-live-dot" />Thinking…
          </span>
        )}
      </div>
      <div className="followup-card-body">
        {streaming ? (
          <div className="assistant-text">
            {renderMarkdown(content)}
            <span className="streaming-cursor" />
          </div>
        ) : (
          renderSectionedMarkdown(content)
        )}
      </div>
    </div>
  );
}

// ─── Thought Process — vertical timeline ────────────────────────────────────
function ThoughtProcess({ steps, isStreaming }: { steps: ReasoningStep[]; isStreaming: boolean }) {
  const [open, setOpen] = useState(true);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  const completedCount = steps.filter(s => s.completed).length;
  // Total expected steps = highest step number seen so far (dynamic — 3 for follow-ups, 6 for full analysis)
  const totalSteps = steps.length > 0 ? Math.max(...steps.map(s => s.step)) : 6;
  const allDone = !isStreaming && completedCount >= totalSteps;

  // Collapse to the clean summary bar once all steps finish
  useEffect(() => { if (allDone) setOpen(false); }, [allDone]);

  if (!steps.length) return null;
  const progress = Math.round((completedCount / totalSteps) * 100);

  const toggleStep = (stepNum: number) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(stepNum)) next.delete(stepNum); else next.add(stepNum);
      return next;
    });
  };

  // Build the display list from actual steps received, filling gaps with pending placeholders.
  // This means follow-ups show 3 steps, full analysis shows 6 — driven by the data.
  const displaySteps = Array.from({ length: totalSteps }, (_, i) => {
    const stepNum = i + 1;
    const step = steps.find(s => s.step === stepNum);
    return { stepNum, label: step?.label ?? `Step ${stepNum}`, step, done: step?.completed ?? false };
  });

  return (
    <div className="thought-process">
      {/* ── Outer header toggle ── */}
      <button className="thought-toggle" onClick={() => setOpen(o => !o)}>
        <span className={`thought-dot${isStreaming ? " thought-dot--live" : allDone ? " thought-dot--done" : ""}`} />
        <span className="thought-label">
          {allDone ? "Tasks complete" : isStreaming ? "Analyzing…" : "Thought process"}
        </span>
        <div className="thought-progress-track">
          <div className="thought-progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <span className="thought-step-counter">{completedCount}/{totalSteps}</span>
        <span className="thought-chevron">{open ? "▲" : "▼"}</span>
      </button>

      {/* ── Step list — driven by actual steps from backend ── */}
      {open && (
        <div className="tp-accordion">
          {displaySteps.map(({ stepNum, label, step, done }, i) => {
            const isLastCompleted = done && isStreaming && stepNum === completedCount;
            const active = isLastCompleted || (isStreaming && !done && completedCount === i);
            const state = (done && !isLastCompleted) ? "done" : active ? "active" : "pending";
            const isStepOpen = expandedSteps.has(stepNum);
            const hasContent = Boolean(step?.content);

            return (
              <div key={stepNum} className={`tp-acc-item tp-acc-item--${state}`}>
                {hasContent ? (
                  <button className="tp-acc-row" onClick={() => toggleStep(stepNum)}>
                    <div className={`tp-node tp-node--${state}`}>
                      {done && !isLastCompleted
                        ? <span className="tp-check">✓</span>
                        : active
                        ? <span className="tp-spin" />
                        : <span className="tp-num">{stepNum}</span>}
                    </div>
                    <span className="tp-acc-label">{label}</span>
                    {done && !isLastCompleted && stepNum === 2 && totalSteps === 6 && (
                      <span className="tp-corroborated-badge">≥2 agents agreed</span>
                    )}
                    <span className="tp-acc-chevron">{isStepOpen ? "▲" : "▶"}</span>
                  </button>
                ) : (
                  <div className="tp-acc-row tp-acc-row--static">
                    <div className={`tp-node tp-node--${state}`}>
                      {active ? <span className="tp-spin" /> : <span className="tp-num">{stepNum}</span>}
                    </div>
                    <span className="tp-acc-label">{label}</span>
                    {active && (
                      <span className="thought-loading-dots tp-acc-dots"><span /><span /><span /></span>
                    )}
                  </div>
                )}

                {hasContent && isStepOpen && (
                  <div className="tp-acc-body">
                    <div className="tp-acc-content">
                      {renderMarkdown(step!.content)}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {isStreaming && completedCount === 0 && (
            <div className="tp-acc-item tp-acc-item--active">
              <div className="tp-acc-row tp-acc-row--static">
                <div className="tp-node tp-node--active"><span className="tp-spin" /></div>
                <span className="tp-acc-label">Processing…</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Workspace right panel ────────────────────────────────────────────────
// Mini animated score arc for the workspace intel cards
function WsScorePip({ score, color }: { score: number; color: string }) {
  const [animated, setAnimated] = useState(0);
  const r = 13;
  const circ = 2 * Math.PI * r;
  const offset = circ - (animated / 100) * circ;
  useEffect(() => {
    const t = setTimeout(() => setAnimated(score), 80);
    return () => clearTimeout(t);
  }, [score]);
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" style={{ flexShrink: 0 }}>
      <circle cx="17" cy="17" r={r} fill="none" stroke="#f1f5f9" strokeWidth="3.5" />
      <circle
        cx="17" cy="17" r={r}
        fill="none"
        stroke={color}
        strokeWidth="3.5"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 17 17)"
        style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.34,1.56,0.64,1)" }}
      />
    </svg>
  );
}

export interface WorkspaceArtifact {
  id: string;
  name: string;
  kind: "package" | "draft" | "certificate";
  createdAt: Date;
  reopen: () => void;
}

interface WorkspacePanelProps {
  steps: ReasoningStep[];
  citations: Citation[];
  graphPaths?: import("../types").GraphPath[];
  artifacts: WorkspaceArtifact[];
  widget?: WidgetPayload;
  analysisText: string;
  isLoading: boolean;
  hasMessages: boolean;
  redTeamReview?: RedTeamResult;
  competitorIntel?: CompetitorIntelResult;
  refinement?: RefinedNarrativeResult;
  reviewStreaming?: boolean;
  competitorStreaming?: boolean;
  refinementStreaming?: boolean;
  onOpenPreview: (payload: ReportPayload) => void;
  onOpenDrawer: (view: DrawerView) => void;
}

function WorkspacePanel({ steps, citations, graphPaths, artifacts, widget, analysisText, isLoading, hasMessages, redTeamReview, competitorIntel, refinement, reviewStreaming, competitorStreaming, refinementStreaming, onOpenPreview, onOpenDrawer }: WorkspacePanelProps) {
  const [planOpen, setPlanOpen] = useState(true);
  const [outputOpen, setOutputOpen] = useState(true);
  const [intelOpen, setIntelOpen] = useState(true);
  const [refsOpen, setRefsOpen] = useState(true);
  const [kgOpen, setKgOpen] = useState(false);
  const [selectedRef, setSelectedRef] = useState<Citation | null>(null);
  // Animate steps completing one-by-one even when they arrive as a batch
  const [visibleSteps, setVisibleSteps] = useState(0);

  useEffect(() => {
    const completed = steps.filter(s => s.completed).length;
    if (completed <= visibleSteps) { setVisibleSteps(completed); return; }
    let i = visibleSteps;
    const tick = () => {
      i++;
      setVisibleSteps(i);
      if (i < completed) setTimeout(tick, 260);
    };
    const t = setTimeout(tick, 80);
    return () => clearTimeout(t);
  }, [steps]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <aside className={`workspace-panel ${hasMessages ? "workspace-panel--visible" : ""}`}>
      <div className="ws-header">
        <span className="ws-title">Workspace</span>
      </div>

      {/* Plan */}
      <div className="ws-section">
        <button className="ws-section-header" onClick={() => setPlanOpen(!planOpen)}>
          <span className="ws-section-name">Plan</span>
          <div className="ws-section-meta">
            {steps.length > 0 && (
              <span className="ws-badge ws-badge--count">{visibleSteps}/{steps.length}</span>
            )}
            <span className={`ws-chevron ${planOpen ? "ws-chevron--open" : ""}`}>›</span>
          </div>
        </button>
        {planOpen && (
          <div className="ws-section-body">
            {steps.map((step, i) => {
              const done = (step.completed ?? false) && visibleSteps > i;
              const active = isLoading && !done && i === visibleSteps;
              return (
                <div key={step.step} className={`ws-plan-item ws-plan-item--${done ? "done" : active ? "active" : "pending"}`}>
                  <span className="ws-plan-check">
                    {done ? "✓" : active ? <span className="ws-plan-spinner" /> : "○"}
                  </span>
                  <span className="ws-plan-label">{step.label}</span>
                </div>
              );
            })}
            {steps.length === 0 && isLoading && (
              <div className="ws-plan-item ws-plan-item--active">
                <span className="ws-plan-check"><span className="ws-plan-spinner" /></span>
                <span className="ws-plan-label">Connecting…</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Output */}
      <div className="ws-section">
        <button className="ws-section-header" onClick={() => setOutputOpen(!outputOpen)}>
          <span className="ws-section-name">Output</span>
          <div className="ws-section-meta">
            {(widget ? 1 : 0) + artifacts.length > 0 && (
              <span className="ws-badge ws-badge--count">{(widget ? 1 : 0) + artifacts.length}</span>
            )}
            <span className={`ws-chevron ${outputOpen ? "ws-chevron--open" : ""}`}>›</span>
          </div>
        </button>
        {outputOpen && (
          <div className="ws-section-body">
            {widget?.type === "grant_match" && (
              <div
                className="ws-file-item ws-file-item--clickable"
                onClick={() => onOpenPreview({
                  type: "grant_match",
                  widget: widget.data,
                  analysisText,
                  title: widget.data.grantName || "Grant Match Dashboard",
                  citations,
                })}
              >
                <IconChart size={13} className="ws-file-icon" />
                <span className="ws-file-name">Grant Match Dashboard</span>
                <button
                  className="ws-file-menu"
                  onClick={(e) => { e.stopPropagation(); onOpenPreview({ type: "grant_match", widget: widget.data, analysisText, title: widget.data.grantName || "Grant Match Dashboard", citations }); }}
                  title="Open preview"
                >↗</button>
              </div>
            )}
            {widget?.type === "grant_pipeline" && (
              <div
                className="ws-file-item ws-file-item--clickable"
                onClick={() => onOpenPreview({
                  type: "grant_pipeline",
                  analysisText,
                  title: "Grant Pipeline Report",
                  citations,
                })}
              >
                <IconFileText size={13} className="ws-file-icon" />
                <span className="ws-file-name">Grant Pipeline Report</span>
                <button
                  className="ws-file-menu"
                  onClick={(e) => { e.stopPropagation(); onOpenPreview({ type: "grant_pipeline", analysisText, title: "Grant Pipeline Report", citations }); }}
                  title="Open preview"
                >↗</button>
              </div>
            )}
            {artifacts.map((art) => (
              <div key={art.id} className="ws-file-item ws-file-item--clickable ws-artifact-item" onClick={art.reopen}>
                {art.kind === "package" && <IconFilePdf size={13} className="ws-file-icon ws-file-icon--package" />}
                {art.kind === "draft" && <IconFileText size={13} className="ws-file-icon ws-file-icon--draft" />}
                {art.kind === "certificate" && <IconAward size={13} className="ws-file-icon ws-file-icon--cert" />}
                <span className="ws-file-name ws-file-name--truncate">{art.name}</span>
                <span className="ws-artifact-time">{art.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                <button className="ws-file-menu" onClick={(e) => { e.stopPropagation(); art.reopen(); }} title="Reopen">↗</button>
              </div>
            ))}
            {!widget && artifacts.length === 0 && hasMessages && (
              <p className="ws-empty">No outputs yet</p>
            )}
          </div>
        )}
      </div>

      {/* Agent Intelligence — result cards for secondary agents */}
      {(redTeamReview || competitorIntel || refinement || reviewStreaming || competitorStreaming || refinementStreaming) && (
        <div className="ws-section">
          <button className="ws-section-header" onClick={() => setIntelOpen(!intelOpen)}>
            <span className="ws-section-name">Agent Intel</span>
            <div className="ws-section-meta">
              {(redTeamReview || competitorIntel || refinement) && (
                <span className="ws-badge ws-badge--intel">
                  {[redTeamReview, competitorIntel, refinement].filter(Boolean).length} agents
                </span>
              )}
              <span className={`ws-chevron ${intelOpen ? "ws-chevron--open" : ""}`}>›</span>
            </div>
          </button>
          {intelOpen && (
            <div className="ws-section-body ws-intel-body">
              {(redTeamReview || reviewStreaming) && (
                <button
                  className={`ws-intel-card ws-intel-card--review ${redTeamReview ? "ws-intel-card--ready" : "ws-intel-card--loading"}`}
                  onClick={() => redTeamReview && onOpenDrawer({ agent: "review", data: redTeamReview })}
                  disabled={!redTeamReview}
                >
                  <div className="ws-intel-card-header">
                    <span className="ws-intel-icon"><IconScales size={14} /></span>
                    <span className="ws-intel-label">Red Team Review</span>
                    {redTeamReview && <span className="ws-intel-open">↗</span>}
                  </div>
                  {redTeamReview ? (
                    <>
                      <div className="ws-intel-score-row">
                        <WsScorePip
                          score={redTeamReview.overallScore}
                          color={redTeamReview.overallScore >= 70 ? "#22c55e" : redTeamReview.overallScore >= 50 ? "#f59e0b" : "#ef4444"}
                        />
                        <div className="ws-intel-score-meta">
                          <span className="ws-intel-score-num" style={{ color: redTeamReview.overallScore >= 70 ? "#16a34a" : redTeamReview.overallScore >= 50 ? "#d97706" : "#dc2626" }}>
                            {redTeamReview.overallScore}
                            <span className="ws-intel-score-denom">/100</span>
                          </span>
                        </div>
                      </div>
                      <div className="ws-intel-verdict">
                        {redTeamReview.reviewerVerdict.length > 52
                          ? redTeamReview.reviewerVerdict.slice(0, 52) + "…"
                          : redTeamReview.reviewerVerdict}
                      </div>
                    </>
                  ) : (
                    <div className="ws-intel-loading">
                      <span className="ws-intel-dots"><span /><span /><span /></span>
                      Reviewing draft…
                    </div>
                  )}
                </button>
              )}

              {/* Competitive Intel card */}
              {(competitorIntel || competitorStreaming) && (
                <button
                  className={`ws-intel-card ws-intel-card--competitor ${competitorIntel ? "ws-intel-card--ready" : "ws-intel-card--loading"}`}
                  onClick={() => competitorIntel && onOpenDrawer({ agent: "competitor", data: competitorIntel })}
                  disabled={!competitorIntel}
                >
                  <div className="ws-intel-card-header">
                    <span className="ws-intel-icon"><IconTarget size={14} /></span>
                    <span className="ws-intel-label">Competitive Intel</span>
                    {competitorIntel && <span className="ws-intel-open">↗</span>}
                  </div>
                  {competitorIntel ? (
                    <>
                      <div className="ws-intel-score-row">
                        <WsScorePip
                          score={competitorIntel.winProbability}
                          color={competitorIntel.winProbability >= 60 ? "#3b82f6" : competitorIntel.winProbability >= 40 ? "#8b5cf6" : "#6366f1"}
                        />
                        <div className="ws-intel-score-meta">
                          <span className="ws-intel-score-num" style={{ color: "#3b82f6" }}>
                            {competitorIntel.winProbability}%
                            <span className="ws-intel-score-denom"> win</span>
                          </span>
                        </div>
                      </div>
                      <div className="ws-intel-verdict">
                        <span className={`ws-level-dot ws-level-dot--${competitorIntel.competitionLevel}`} />
                        {competitorIntel.competitionLevel.charAt(0).toUpperCase() + competitorIntel.competitionLevel.slice(1)} competition
                        <span className="ws-intel-applicants"> · ~{competitorIntel.estimatedApplicants} applicants</span>
                      </div>
                    </>
                  ) : (
                    <div className="ws-intel-loading">
                      <span className="ws-intel-dots"><span /><span /><span /></span>
                      Scanning landscape…
                    </div>
                  )}
                </button>
              )}

              {/* Narrative Refinement card — shows the feedback loop result */}
              {(refinement || refinementStreaming) && (
                <div className={`ws-intel-card ws-intel-card--refinement ${refinement ? "ws-intel-card--ready ws-intel-card--refinement-done" : "ws-intel-card--loading"}`}>
                  <div className="ws-intel-card-header">
                    <span className="ws-intel-icon">✦</span>
                    <span className="ws-intel-label">Narrative Refined</span>
                    {refinement && <span className="ws-intel-open" style={{ color: "#22c55e" }}>✓</span>}
                  </div>
                  {refinement ? (
                    <>
                      <div className="ws-intel-score-row">
                        <div className="ws-refine-delta">+{refinement.estimatedScoreDelta}</div>
                        <div className="ws-intel-score-meta">
                          <span className="ws-intel-score-num" style={{ color: "#22c55e" }}>
                            pts
                            <span className="ws-intel-score-denom"> projected gain</span>
                          </span>
                        </div>
                      </div>
                      <div className="ws-refine-improvements">
                        {refinement.improvements.slice(0, 2).map((imp, i) => (
                          <div key={i} className="ws-refine-item">✓ {imp.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1")}</div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="ws-intel-loading">
                      <span className="ws-intel-dots"><span /><span /><span /></span>
                      Applying Red Team fixes…
                    </div>
                  )}
                </div>
              )}

            </div>
          )}
        </div>
      )}

      {/* References */}
      <div className="ws-section">
        <button className="ws-section-header" onClick={() => setRefsOpen(!refsOpen)}>
          <span className="ws-section-name">References</span>
          <div className="ws-section-meta">
            {citations.length > 0 && (
              <span className="ws-badge ws-badge--count">{citations.length}</span>
            )}
            <span className={`ws-chevron ${refsOpen ? "ws-chevron--open" : ""}`}>›</span>
          </div>
        </button>
        {refsOpen && (
          <div className="ws-section-body">
            {citations.length > 0 ? (
              citations.map((c, i) => (
                <div
                  key={i}
                  className={`ws-file-item ws-file-item--clickable${selectedRef === c ? " ws-file-item--active" : ""}`}
                  onClick={() => setSelectedRef(selectedRef === c ? null : c)}
                  title="Click to preview"
                >
                  {c.source === "web"
                    ? <IconGlobe size={13} className="ws-file-icon" />
                    : <IconFileText size={13} className="ws-file-icon" />}
                  <span className="ws-file-name ws-file-name--truncate">{c.title}</span>
                  <span className="ws-file-menu">›</span>
                </div>
              ))
            ) : (
              <p className="ws-empty">No references yet</p>
            )}

            {/* Knowledge Graph subsection — GraphRAG evidence chains */}
            {graphPaths && graphPaths.length > 0 && (
              <div className="ws-kg-section">
                <button className="ws-kg-header" onClick={() => setKgOpen(o => !o)}>
                  <span className="ws-kg-icon">⬡</span>
                  <span className="ws-kg-label">Knowledge Graph</span>
                  <span className="ws-badge ws-badge--count ws-kg-badge">{graphPaths.length}</span>
                  <span className={`ws-chevron ${kgOpen ? "ws-chevron--open" : ""}`}>›</span>
                </button>
                {kgOpen && (
                  <div className="ws-kg-body">
                    {graphPaths.map((path, pi) => (
                      <div key={pi} className="ws-kg-path">
                        <div className="ws-kg-path-label">
                          <span className={`ws-kg-confidence ws-kg-confidence--${path.confidence.toLowerCase()}`}>{path.confidence}</span>
                          <span className="ws-kg-path-name">{path.grantLabel}</span>
                        </div>
                        <div className="ws-kg-hops">
                          {path.hops.slice(0, 3).map((hop, hi) => (
                            <div key={hi} className="ws-kg-hop">
                              <span className="ws-kg-from">{hop.fromLabel}</span>
                              <span className="ws-kg-rel">→ {hop.rel} →</span>
                              <span className="ws-kg-to">{hop.toLabel}</span>
                            </div>
                          ))}
                          {path.hops.length > 3 && (
                            <div className="ws-kg-more">+{path.hops.length - 3} more hops</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Reference Preview Popover */}
      {selectedRef && (
        <>
          <div className="ref-preview-overlay" onClick={() => setSelectedRef(null)} />
          <div className="ref-preview-card" role="dialog" aria-label="Reference preview">
            <div className="ref-preview-header">
              <div className="ref-preview-title-block">
                <div className="ref-preview-source-badge">
                  <IconFileText size={12} /> Knowledge Base
                </div>
                <div className="ref-preview-title">
                  {selectedRef.title.split(" — ")[0]}
                </div>
                {selectedRef.title.includes(" — ") && (
                  <div className="ref-preview-agency">
                    {selectedRef.title.split(" — ").slice(1).join(" — ")}
                  </div>
                )}
              </div>
              <button className="ref-preview-close" onClick={() => setSelectedRef(null)} aria-label="Close">✕</button>
            </div>
            {selectedRef.excerpt && (
              <div className="ref-preview-body">
                <p className="ref-preview-excerpt">{selectedRef.excerpt}</p>
              </div>
            )}
            <div className="ref-preview-footer">
              {selectedRef.url && (
                <a href={selectedRef.url} target="_blank" rel="noopener noreferrer" className="ref-preview-link">
                  View Source ↗
                </a>
              )}
              <button className="ref-preview-use-btn" onClick={() => setSelectedRef(null)}>
                Done
              </button>
            </div>
          </div>
        </>
      )}
    </aside>
  );
}

export function ChatInterface({ onSwitchToScan, onSwitchToAdmin, tourButton }: { onSwitchToScan?: () => void; onSwitchToAdmin?: () => void; tourButton?: ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [threadId, setThreadId] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const isSendingRef = useRef(false); // StrictMode-safe guard against double sends
  const [copied, setCopied] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<ReportPayload | null>(null);
  const [agentDrawer, setAgentDrawer] = useState<DrawerView>(null);
  const [heroAmt, setHeroAmt] = useState(0);
  const [heroGrants, setHeroGrants] = useState<HeroGrantResult[]>(HERO_GRANTS_DEFAULT);
  const [heroTotal, setHeroTotal] = useState(8.7);
  const [heroProgramCount, setHeroProgramCount] = useState(3);
  const [generatingPackage, setGeneratingPackage] = useState<string | null>(null);
  const [draftingApp, setDraftingApp] = useState<string | null>(null);
  const [certifying, setCertifying] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<WorkspaceArtifact[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [monitorData, setMonitorData] = useState<MonitorData | null>(null);
  const [monitorTab, setMonitorTab] = useState<"health" | "evals">("health");
  const [fetchedUrl, setFetchedUrl] = useState<FetchedUrl | null>(null);
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  // Detect if the input looks like a URL
  const detectedUrl = /^https?:\/\/\S{10,}/.test(input.trim()) ? input.trim() : null;

  // Fetch live grant data for hero cards once on mount
  useEffect(() => {
    fetchHeroGrants().then((data) => {
      if (!data) return;
      setHeroGrants(data.grants);
      setHeroTotal(data.totalMillion);
      if (typeof data.programCount === "number") setHeroProgramCount(data.programCount);
    });
  }, []);

  // Animate the hero pipeline counter when on landing state
  useEffect(() => {
    if (messages.length > 0) return;
    let startTime: number | null = null;
    const TARGET = heroTotal;
    const DURATION = 1800;
    function step(ts: number) {
      if (!startTime) startTime = ts;
      const progress = Math.min((ts - startTime) / DURATION, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setHeroAmt(parseFloat((eased * TARGET).toFixed(1)));
      if (progress < 1) requestAnimationFrame(step);
    }
    const id = requestAnimationFrame(step);
    return () => cancelAnimationFrame(id);
  }, [messages.length, heroTotal]);

  useEffect(() => {
    if (isAtBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Poll /api/monitor every 5s while Settings panel is open
  const refreshMonitor = useCallback(() => {
    fetchMonitor().then(setMonitorData).catch(() => {/* silent */});
  }, []);

  useEffect(() => {
    if (!showSettings) return;
    refreshMonitor();
    const id = setInterval(refreshMonitor, 5000);
    return () => clearInterval(id);
  }, [showSettings, refreshMonitor]);

  // Derive workspace data from the latest assistant message
  const latestAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const wsSteps = latestAssistant?.reasoningSteps ?? [];
  const wsCitations = latestAssistant?.citations ?? [];
  const wsWidget = latestAssistant?.widget;
  const wsAnalysisText = latestAssistant?.content ?? "";
  const wsRedTeam = latestAssistant?.redTeamReview;
  const wsCompetitor = latestAssistant?.competitorIntel;
  const wsRefinement = latestAssistant?.refinedNarrative;
  const wsReviewStreaming = latestAssistant?.reviewStreaming ?? false;
  const wsCompetitorStreaming = latestAssistant?.competitorStreaming ?? false;
  const wsRefinementStreaming = latestAssistant?.refinementStreaming ?? false;
  const wsGraphPaths = latestAssistant?.graphPaths;

  const handleSend = async (text?: string) => {
    const message = text ?? input.trim();
    if (!message || isLoading || isSendingRef.current) return;
    isSendingRef.current = true;
    setInput("");
    // User initiated a new message — always scroll to show the response
    isAtBottomRef.current = true;

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: message };
    const assistantId = crypto.randomUUID();
    const assistantMsg: Message = {
      id: assistantId,
      role: "assistant",
      content: "",
      reasoningSteps: [],
      citations: [],
      streaming: true,
      reviewStreaming: false,
      competitorStreaming: false,
      refinementStreaming: false,
      statusLog: [],
      startedAt: Date.now(),
    };

    // Clear any orphaned streaming messages before adding new ones
    setMessages((prev) => [
      ...prev.filter((m) => !m.streaming),
      userMsg,
      assistantMsg,
    ]);
    setIsLoading(true);

    try {
      await streamChat(message, threadId, {
        onStatus: (status) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, statusLog: [...(m.statusLog ?? []), status] }
                : m
            )
          );
        },
        onMeta: ({ isFollowUp }) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, isFollowUp } : m))
          );
        },
        onWorkIqContext: (context) => {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, workIqContext: context } : m))
          );
        },
        onAgentStatus: ({ agent }) => {
          // Mark secondary agents as streaming
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    reviewStreaming: agent === "review" ? true : m.reviewStreaming,
                    competitorStreaming: agent === "competitor" ? true : m.competitorStreaming,
                    refinementStreaming: agent === "refinement" ? true : m.refinementStreaming,
                  }
                : m
            )
          );
        },
        onReasoningStep: (step) => {
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) return m;
              const existing = m.reasoningSteps ?? [];
              // Upsert: replace existing step with same number, or append new
              const idx = existing.findIndex((s) => s.step === step.step);
              const updated = idx >= 0
                ? existing.map((s) => s.step === step.step ? step : s)
                : [...existing, step];
              return { ...m, reasoningSteps: updated };
            })
          );
        },
        onCitations: (citations) => {
          setMessages((prev) =>
            prev.map((m) => m.id === assistantId ? { ...m, citations } : m)
          );
        },
        onDecision: (decision) => {
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) return m;
              const existing = m.decisions ?? [];
              const idx = existing.findIndex((d) => d.id === decision.id);
              const updated = idx >= 0
                ? existing.map((d) => d.id === decision.id ? decision : d)
                : [...existing, decision];
              return { ...m, decisions: updated };
            })
          );
        },
        onWidget: (widget) => {
          setMessages((prev) =>
            prev.map((m) => m.id === assistantId ? { ...m, widget: widget as WidgetPayload } : m)
          );
        },
        onReview: (review) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, redTeamReview: review, reviewStreaming: false } : m
            )
          );
        },
        onCompetitorIntel: (intel) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, competitorIntel: intel, competitorStreaming: false }
                : m
            )
          );
        },
        onRefinedNarrative: (refined) => {
          // Patch the widget's narrativeDraft in-place — this IS the feedback loop
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) return m;
              if (m.widget?.type === "grant_match") {
                const updatedWidget: WidgetPayload = {
                  type: "grant_match",
                  data: {
                    ...(m.widget.data as GrantMatchData),
                    narrativeDraft: refined.refinedNarrative,
                  },
                };
                return { ...m, widget: updatedWidget, refinedNarrative: refined, refinementStreaming: false };
              }
              return { ...m, refinedNarrative: refined, refinementStreaming: false };
            })
          );
        },
        onTierInfo: (info) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, tierInfo: info as Message["tierInfo"] }
                : m
            )
          );
        },
        onGraphPaths: (data) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, graphPaths: data.paths } : m
            )
          );
        },
        onAnswerChunk: (chunk) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: (m.content ?? "") + chunk } : m
            )
          );
        },
        onAnswer: ({ threadId: tid, content }) => {
          if (tid) setThreadId(tid);
          // Replace accumulated chunks with the final clean version
          const cleanContent = content.replace(/```widget[\s\S]*?```/g, "").trim();
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) return m;
              // NEVER overwrite m.widget here — onWidget already set it
              return { ...m, content: cleanContent, streaming: false };
            })
          );
        },
        onDone: () => {
          setMessages((prev) =>
            prev.map((m) => m.id === assistantId ? { ...m, streaming: false, reviewStreaming: false, competitorStreaming: false, refinementStreaming: false, completedAt: m.completedAt ?? Date.now() } : m)
          );
          setIsLoading(false);
          isSendingRef.current = false;
        },
        onError: (err) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: `Error: ${err}`, streaming: false } : m
            )
          );
          setIsLoading(false);
          isSendingRef.current = false;
        },
      });
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: "Connection error — please try again.", streaming: false } : m
        )
      );
    } finally {
      // Always reset loading state — handles dropped connections and unexpected exits
      setIsLoading(false);
      isSendingRef.current = false;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFetchUrl = async () => {
    const url = detectedUrl;
    if (!url || isFetchingUrl) return;
    setIsFetchingUrl(true);
    try {
      const result = await fetchGrantUrl(url);
      setFetchedUrl(result);
      setInput(`Analyze this grant for Buffalo Grove:\n\n[Source: ${result.title}]\n${result.text.slice(0, 6000)}`);
    } catch (err) {
      setInput(`Could not fetch URL: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsFetchingUrl(false);
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setThreadId(undefined);
    setInput("");
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 1800);
  };

  const handleGeneratePackage = async (msg: Message) => {
    if (!msg.widget || msg.widget.type !== "grant_match" || generatingPackage) return;
    setGeneratingPackage(msg.id);
    try {
      const grantName = (msg.widget.data as GrantMatchData).grantName ?? "Grant";
      const { html } = await generatePackage(msg.widget.data, msg.content, grantName);
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, "_blank");
      // Log to workspace Output so it can be reopened
      const artifactId = crypto.randomUUID();
      const reopen = () => window.open(blobUrl, "_blank");
      setArtifacts(prev => [...prev, { id: artifactId, name: `${grantName} — Package`, kind: "package", createdAt: new Date(), reopen }]);
    } catch (e) {
      console.error("Package generation failed:", e);
    } finally {
      setGeneratingPackage(null);
    }
  };

  const handleDraftApplication = async (msg: Message) => {
    if (!msg.widget || msg.widget.type !== "grant_match" || draftingApp) return;
    setDraftingApp(msg.id);
    try {
      const w = msg.widget.data as GrantMatchData;
      const grantName = w.grantName ?? "Grant";
      const { html } = await draftApplication({
        grantName,
        agency: w.agency,
        fundingAmount: w.fundingAmount,
        awardRange: w.awardRange,
        matchScore: w.matchScore,
        analysisText: msg.content,
      });
      // Open inside the in-app modal so the user can edit inline, then save as PDF
      setPreviewData({ type: "draft_application", html, title: `${grantName} — Draft Application` });
      const blobUrl = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
      const artifactId = crypto.randomUUID();
      const reopen = () => setPreviewData({ type: "draft_application", html, title: `${grantName} — Draft Application` });
      setArtifacts(prev => [...prev, { id: artifactId, name: `${grantName} — Draft Application`, kind: "draft", createdAt: new Date(), reopen }]);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
    } catch (e) {
      console.error("Draft application failed:", e);
    } finally {
      setDraftingApp(null);
    }
  };

  const handleGenerateCertificate = (msg: Message) => {
    if (!msg.widget || msg.widget.type !== "grant_match" || certifying) return;
    setCertifying(msg.id);
    const data = msg.widget.data as import("./GrantMatchWidget").GrantMatchData;
    const grantName = data.grantName ?? "Grant";
    const html = generateCertificate(data);
    const title = `${grantName} — Readiness Certificate`;
    setPreviewData({ type: "draft_application", html, title });
    const artifactId = crypto.randomUUID();
    const reopen = () => setPreviewData({ type: "draft_application", html, title });
    setArtifacts(prev => [...prev, { id: artifactId, name: title, kind: "certificate", createdAt: new Date(), reopen }]);
    setTimeout(() => setCertifying(null), 1200);
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="chat-interface chat-interface--col">
      <AppHeader
        active="chat"
        onNavigate={(t) => { if (t === "scan") onSwitchToScan?.(); else if (t === "admin") onSwitchToAdmin?.(); }}
        actions={
          <>
            {tourButton}
            <button className="cowork-header-icon-btn" title="New chat" onClick={handleNewChat}><IconNewChat size={16} /></button>
            <button
              className={`cowork-header-icon-btn${showSettings ? " cowork-header-icon-btn--active" : ""}`}
              title="Intelligence Hub"
              onClick={() => setShowSettings(s => !s)}
            ><IconSettings size={16} /></button>
          </>
        }
      />

      <div className="chat-body-row">

      {/* Intelligence Hub panel (Settings icon) */}
      {showSettings && (
        <div className="settings-panel">
          <div className="settings-header">
            <span>Intelligence Hub</span>
            <button className="settings-close" onClick={() => setShowSettings(false)}>✕</button>
          </div>
          <div className="settings-body">

            {/* ── City & Model Info ─────────────────────────────── */}
            <div className="settings-section">
              <div className="settings-label">City Profile</div>
              <div className="settings-row"><span>City</span><strong>Buffalo Grove, IL</strong></div>
              <div className="settings-row"><span>Population</span><strong>41,496</strong></div>
              <div className="settings-row"><span>County</span><strong>Lake County</strong></div>
            </div>
            <div className="settings-section">
              <div className="settings-label">AI Model</div>
              <div className="settings-row"><span>Model</span><strong>GPT-4o mini</strong></div>
              <div className="settings-row"><span>Knowledge Base</span><strong>civicgrant-kb</strong></div>
              <div className="settings-row"><span>Platform</span><strong>Azure Foundry</strong></div>
            </div>

            {/* ── Live Agent Monitor ────────────────────────────── */}
            <div className="settings-section">
              <div className="settings-label monitor-label-row">
                <span>Agent Monitor</span>
                <span className="monitor-live-dot" title="Live — refreshes every 5s"></span>
              </div>

              {/* Sub-tabs */}
              <div className="monitor-tabs">
                <button
                  className={`monitor-tab${monitorTab === "health" ? " monitor-tab--active" : ""}`}
                  onClick={() => setMonitorTab("health")}
                >Health</button>
                <button
                  className={`monitor-tab${monitorTab === "evals" ? " monitor-tab--active" : ""}`}
                  onClick={() => setMonitorTab("evals")}
                >Evals</button>
              </div>

              {monitorTab === "health" && (
                <div className="monitor-health">
                  {!monitorData ? (
                    <div className="monitor-empty">Loading…</div>
                  ) : (
                    <>
                      <div className="monitor-stat-grid">
                        <div className="monitor-stat">
                          <div className="monitor-stat-val">{monitorData.stats.totalRuns}</div>
                          <div className="monitor-stat-lbl">Analyses</div>
                        </div>
                        <div className="monitor-stat">
                          <div className="monitor-stat-val">{Math.round(monitorData.stats.successRate * 100)}%</div>
                          <div className="monitor-stat-lbl">Success</div>
                        </div>
                        <div className="monitor-stat">
                          <div className="monitor-stat-val">{monitorData.stats.avgLatencyMs > 0 ? `${(monitorData.stats.avgLatencyMs / 1000).toFixed(1)}s` : "—"}</div>
                          <div className="monitor-stat-lbl">Avg Latency</div>
                        </div>
                        <div className="monitor-stat">
                          <div className="monitor-stat-val">{monitorData.stats.avgMatchScore > 0 ? `${monitorData.stats.avgMatchScore}%` : "—"}</div>
                          <div className="monitor-stat-lbl">Avg Match</div>
                        </div>
                      </div>

                      {monitorData.recentRuns.length > 0 && (
                        <div className="monitor-runs">
                          <div className="monitor-runs-title">Recent Analyses</div>
                          {monitorData.recentRuns.slice(0, 5).map((run) => {
                            const secsAgo = Math.floor((Date.now() - new Date(run.ts).getTime()) / 1000);
                            const ago = secsAgo < 60 ? `${secsAgo}s ago`
                              : secsAgo < 3600 ? `${Math.floor(secsAgo / 60)}m ago`
                              : `${Math.floor(secsAgo / 3600)}h ago`;
                            return (
                              <div key={run.id} className={`monitor-run-row${run.success ? "" : " monitor-run-row--error"}`}>
                                <div className="monitor-run-top">
                                  <span className={`monitor-run-dot${run.success ? "" : " monitor-run-dot--fail"}`}></span>
                                  <div className="monitor-run-query">{run.querySnippet}</div>
                                </div>
                                <div className="monitor-run-meta">
                                  {run.matchScore !== undefined && (
                                    <span className="monitor-run-score">{run.matchScore}% match</span>
                                  )}
                                  <span className="monitor-run-latency">{(run.latencyMs / 1000).toFixed(1)}s</span>
                                  <span className={`monitor-run-src ${run.kbSource === "azure_search" ? "monitor-run-src--azure" : "monitor-run-src--local"}`}>
                                    {run.kbSource === "azure_search" ? "Azure Search" : "Local Docs"}
                                  </span>
                                  <span className="monitor-run-ago">{ago}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {monitorData.recentRuns.length === 0 && (
                        <div className="monitor-empty">No runs yet — ask a grant question to start tracking.</div>
                      )}

                      <a
                        href={monitorData.appInsightsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="monitor-appinsights-btn"
                      >
                        View in Application Insights ↗
                      </a>
                    </>
                  )}
                </div>
              )}

              {monitorTab === "evals" && (
                <div className="monitor-evals">
                  {!monitorData ? (
                    <div className="monitor-empty">Loading…</div>
                  ) : (
                    <>
                      <div className="monitor-eval-summary">
                        <span className="monitor-eval-pass">{monitorData.evalScores.summary.pass}/{monitorData.evalScores.summary.total} passing</span>
                        <span className="monitor-eval-score">{Math.round(monitorData.evalScores.summary.avgScore * 100)}% avg</span>
                        <span className="monitor-eval-model">{monitorData.evalScores.model}</span>
                      </div>
                      {monitorData.evalScores.results.map((tc) => (
                        <div key={tc.id} className="monitor-eval-card">
                          <div className="monitor-eval-card-top">
                            <div className="monitor-eval-name">{tc.name}</div>
                            <span className={`monitor-eval-badge${tc.overall >= 4 ? " monitor-eval-badge--pass" : " monitor-eval-badge--warn"}`}>
                              {tc.overall.toFixed(1)}
                            </span>
                          </div>
                          <div className="monitor-eval-chips">
                            {(["groundedness","relevance","coherence","safety"] as const).map((dim) => (
                              <span key={dim} className={`monitor-eval-chip${tc.scores[dim] >= 4 ? " monitor-eval-chip--pass" : " monitor-eval-chip--warn"}`}>
                                {dim.charAt(0).toUpperCase() + dim.slice(1)} {tc.scores[dim]}/5
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* ── Session ───────────────────────────────────────── */}
            <div className="settings-section">
              <div className="settings-label">Session</div>
              <div className="settings-row">
                <span>Messages</span><strong>{messages.length}</strong>
              </div>
              <div className="settings-row">
                <span>Thread ID</span><strong className="settings-mono">{threadId ? threadId.slice(0, 16) + "…" : "—"}</strong>
              </div>
              <button className="settings-clear-btn" onClick={() => { setMessages([]); setThreadId(undefined); setShowSettings(false); }}>
                Clear conversation
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Main column */}
      <div className="cowork-main-col">
        {/* Chat messages */}
        <main className="chat-main">
          <div
            className="chat-messages"
            ref={messagesContainerRef}
            onScroll={() => {
              const el = messagesContainerRef.current;
              if (!el) return;
              isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
            }}
          >
            {messages.length === 0 ? (
              <div className="chat-empty">
                {/* Animated hero */}
                <div className="hero-section">
                  <div className="hero-live-badge">
                    <span className="hero-live-dot" />
                    Live Grant Intelligence
                  </div>
                  <div className="hero-pipeline">
                    <div className="hero-pipeline-amount">{formatHeroAmount(heroAmt)}</div>
                    <div className="hero-pipeline-sub">
                      in live federal grant funding open right now, across {heroProgramCount} program{heroProgramCount === 1 ? "" : "s"} your projects qualify for
                    </div>
                  </div>
                  <div className="hero-grant-cards">
                    {heroGrants.map((g) => (
                      <button key={g.name} className="hero-grant-card" onClick={() => handleSend(g.prompt)}>
                        {g.live && (
                          <div className="hero-grant-live">
                            <span className="hero-grant-live-dot" />LIVE · Grants.gov
                          </div>
                        )}
                        <div className="hero-grant-name">{g.name}</div>
                        <div className="hero-grant-agency">{g.agency}</div>
                        <div className="hero-grant-bar-outer">
                          <div className="hero-grant-bar-inner" style={{ width: `${g.match}%` }} />
                        </div>
                        <div className="hero-grant-meta">
                          <span>{g.match}% {g.live ? "relevance" : "match"}</span>
                          <span>{g.funding ?? "—"}</span>
                        </div>
                        {g.daysLeft !== null && (
                          <div className="hero-grant-urgency" style={{ color: g.daysLeft < 50 ? "#f59e0b" : "#475569" }}>
                            {g.daysLeft}d to deadline
                          </div>
                        )}
                        {g.url && (
                          <span
                            className="hero-grant-verify"
                            role="link"
                            tabIndex={0}
                            onClick={(e) => { e.stopPropagation(); window.open(g.url!, "_blank", "noopener,noreferrer"); }}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); window.open(g.url!, "_blank", "noopener,noreferrer"); } }}
                          >
                            Verify on Grants.gov ↗
                          </span>
                        )}
                      </button>
                    ))}
                    {/* Full CIP scan card — always uses computed total */}
                    <button className="hero-grant-card" onClick={() => handleSend(FULL_CIP_CARD.prompt)}>
                      <div className="hero-grant-name">{FULL_CIP_CARD.name}</div>
                      <div className="hero-grant-agency">{FULL_CIP_CARD.agency}</div>
                      <div className="hero-grant-meta hero-grant-meta--scan">
                        <span>Full CIP scan</span>
                        <span>{formatHeroAmount(heroTotal)}</span>
                      </div>
                    </button>
                  </div>
                  <p className="hero-desc">
                    Analyzes your eligibility in 6 steps, scores the match, closes gaps, and generates a complete application package — powered by Microsoft Azure Foundry.
                  </p>
                  <div className="hero-safety-notice">
                    <span className="hero-safety-icon">🛡</span>
                    <span>Architecturally never auto-submits. If evidence is insufficient, we tell you — we never bluff.</span>
                  </div>
                  <div className="hero-trust-strip">
                    <span className="hero-trust-item"><IconSparkle size={13} /> 5 specialist agents</span>
                    <span className="hero-trust-dot" />
                    <span className="hero-trust-item"><IconSearch size={13} /> Grounded in Foundry IQ</span>
                    <span className="hero-trust-dot" />
                    <span className="hero-trust-item"><IconCheck size={13} /> Every claim cited to source</span>
                    <span className="hero-trust-dot" />
                    <span className="hero-trust-item"><IconScales size={13} /> Self-critique loop</span>
                  </div>
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`message message--${msg.role}`}>
                  {msg.role === "user" ? (
                    <div className="user-message-row">
                      <div className="message-bubble--user">{msg.content}</div>
                    </div>
                  ) : (
                    <div className="assistant-row">
                      <div className="assistant-avatar"><IconBuilding size={16} color="#1a6fba" /></div>
                      <div className="assistant-body">

                        {/* Tool call lines — always shown (status connection messages) */}
                        {msg.statusLog && msg.statusLog.map((s, i) => (
                          <ToolCallLine
                            key={i}
                            status={s}
                            done={!msg.streaming || i < (msg.statusLog?.length ?? 0) - 1}
                          />
                        ))}

                        {/* Skeleton — pure loading animation, only before any steps arrive */}
                        {msg.streaming && !(msg.reasoningSteps?.length) && (
                          <GrantRadarSkeleton
                            statusLog={msg.statusLog ?? []}
                            completedSteps={0}
                          />
                        )}

                        {/* Process block — shown at top while streaming for live progress;
                            when done these collapse to compact bars and sit above the widget */}
                        {(msg.reasoningSteps?.length ?? 0) > 0 && (
                          <ThoughtProcess
                            steps={msg.reasoningSteps ?? []}
                            isStreaming={msg.streaming ?? false}
                          />
                        )}

                        {/* Dynamic routing — the agent's autonomous branch decisions */}
                        {(msg.decisions?.length ?? 0) > 0 && (
                          <div className="decision-trail">
                            <div className="decision-trail-head">
                              <IconBolt size={13} />
                              Adaptive routing — {msg.decisions!.length} path{msg.decisions!.length === 1 ? "" : "s"} taken
                            </div>
                            {msg.decisions!.map((d) => (
                              <div
                                key={d.id}
                                className={`decision-row decision-row--${d.kind}${d.branch === "red_team:skip" ? " decision-row--skip" : ""}`}
                              >
                                <span className="decision-badge">{d.kind === "requery" ? "RE-QUERY" : "ROUTE"}</span>
                                <div className="decision-body">
                                  <span className="decision-label">{d.label}</span>
                                  <span className="decision-detail">{d.detail}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Multi-agent orchestration strip — live mission control */}
                        {(msg.reasoningSteps?.length ?? 0) > 0 && (
                          <AgentOrchestraBar
                            steps={msg.reasoningSteps ?? []}
                            citationCount={msg.citations?.length ?? 0}
                            redTeamReview={msg.redTeamReview}
                            redTeamSkipped={msg.decisions?.some((d) => d.branch === "red_team:skip") ?? false}
                            competitorIntel={msg.competitorIntel}
                            refinedNarrative={msg.refinedNarrative}
                            reviewStreaming={msg.reviewStreaming}
                            competitorStreaming={msg.competitorStreaming}
                            refinementStreaming={msg.refinementStreaming}
                            streaming={msg.streaming}
                            startedAt={msg.startedAt}
                            completedAt={msg.completedAt}
                            refinementDelta={msg.refinedNarrative?.estimatedScoreDelta}
                          />
                        )}

                        {/* Provenance — grouped with process metadata, above the widget */}
                        {msg.tierInfo && !msg.streaming && (
                          <div className="tier-badge-wrapper">
                            <TierBadge
                              tier={msg.tierInfo.tier}
                              label={msg.tierInfo.label}
                              guardrailsPassed={msg.tierInfo.guardrailsPassed}
                              violations={msg.tierInfo.violations}
                            />
                          </div>
                        )}

                        {msg.graphPaths && msg.graphPaths.length > 0 && !msg.streaming && (
                          <GraphPathsPanel paths={msg.graphPaths} />
                        )}

                        {/* ── VALUE SECTION ── Widget */}
                        {msg.widget?.type === "grant_match" && (
                          <GrantMatchWidget
                            data={msg.widget.data as import("./GrantMatchWidget").GrantMatchData}
                            isRefined={!!msg.refinedNarrative}
                            refinementImprovements={msg.refinedNarrative?.improvements}
                            refinementDelta={msg.refinedNarrative?.estimatedScoreDelta}
                            cityContext={msg.workIqContext}
                          />
                        )}
                        {msg.widget?.type === "grant_pipeline" && (
                          <GrantPipelineWidget
                            grants={msg.widget.data.grants}
                            cityName={msg.widget.data.cityName}
                            totalOpportunity={msg.widget.data.totalOpportunity}
                          />
                        )}

                        {/* ── ACTION SECTION ── Quick actions + follow-up chips */}
                        {msg.widget?.type === "grant_match" && !msg.streaming && (
                          <div className="quick-actions-bar">
                            <button
                              className="qa-btn qa-btn--secondary"
                              onClick={() => setPreviewData({
                                type: "grant_match",
                                widget: msg.widget!.data as GrantMatchData,
                                analysisText: msg.content,
                                title: (msg.widget!.data as GrantMatchData).grantName || "Grant Match Dashboard",
                                citations: msg.citations ?? [],
                                redTeamReview: msg.redTeamReview,
                                competitorIntel: msg.competitorIntel,
                              })}
                            >
                              <IconChart size={13} />
                              Open Full Report
                            </button>
                            <button
                              className={`qa-btn qa-btn--primary ${generatingPackage === msg.id ? "qa-btn--loading" : ""}`}
                              onClick={() => handleGeneratePackage(msg)}
                              disabled={generatingPackage !== null}
                            >
                              <IconFilePdf size={13} />
                              {generatingPackage === msg.id ? "Generating…" : "Save as PDF"}
                            </button>
                            <button
                              className={`qa-btn qa-btn--primary ${draftingApp === msg.id ? "qa-btn--loading" : ""}`}
                              onClick={() => handleDraftApplication(msg)}
                              disabled={draftingApp !== null}
                              title="Recreate a full application from Buffalo Grove's proven past application in Foundry IQ"
                            >
                              <IconFileText size={13} />
                              {draftingApp === msg.id ? "Drafting…" : "Draft Application"}
                            </button>
                            <button
                              className={`qa-btn qa-btn--cert ${certifying === msg.id ? "qa-btn--loading" : ""}`}
                              onClick={() => handleGenerateCertificate(msg)}
                              disabled={certifying !== null}
                              title="Download a Grant Readiness Certificate — shareable proof of eligibility"
                            >
                              <IconAward size={13} />
                              {certifying === msg.id ? "Generating…" : "Readiness Certificate"}
                            </button>
                          </div>
                        )}

                        {msg.widget?.type === "grant_match" && !msg.streaming && (
                          <div className="followup-chips">
                            <span className="followup-chips-label">Ask a follow-up</span>
                            {getFollowUpChips(msg.widget.data as import("./GrantMatchWidget").GrantMatchData).map((chip, i) => (
                              <button key={i} className="followup-chip" onClick={() => handleSend(chip.prompt)}>
                                {chip.label}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Any text-only response (no widget) — streaming: peek or card; done: sectioned reply card */}
                        {msg.content && !msg.widget && (
                          msg.streaming ? (
                            msg.isFollowUp ? (
                              /* Follow-up streaming → card with live tag + plain markdown */
                              <FollowUpCard content={cleanAnswerText(msg.content)} streaming={true} isFollowUp={true} />
                            ) : (
                              /* Full analysis streaming → collapsible peek */
                              <AnswerPeek streaming={true}>
                                {renderMarkdown(cleanAnswerText(msg.content))}
                                <span className="streaming-cursor" />
                              </AnswerPeek>
                            )
                          ) : (
                            /* Done → sectioned reply card */
                            <FollowUpCard content={cleanAnswerText(msg.content)} streaming={false} isFollowUp={msg.isFollowUp ?? false} />
                          )
                        )}
                        {/* Fallback: widget present but malformed */}
                        {msg.content && !msg.streaming && msg.widget && !msg.widget.type && (
                          <FollowUpCard content={cleanAnswerText(msg.content)} streaming={false} isFollowUp={false} />
                        )}

                        {/* Message actions — copy only */}
                        {!msg.streaming && msg.content && (
                          <div className="msg-actions">
                            <button
                              className={`msg-action-btn ${copied === msg.id ? "msg-action-btn--active" : ""}`}
                              onClick={() => handleCopy(msg.id, msg.content)}
                              title="Copy"
                            >
                              {copied === msg.id ? <IconCheck size={13} /> : <IconCopy size={13} />}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input area */}
          <div className="chat-input-area">
            {/* URL fetch banner */}
            {detectedUrl && !fetchedUrl && (
              <div className="url-fetch-banner">
                <span className="url-fetch-icon"><IconLink size={14} /></span>
                <span className="url-fetch-label">Grant URL detected</span>
                <button
                  className="url-fetch-btn"
                  onClick={handleFetchUrl}
                  disabled={isFetchingUrl}
                >
                  {isFetchingUrl ? "Fetching…" : "Fetch & Analyze"}
                </button>
                <button className="url-fetch-dismiss" onClick={() => setFetchedUrl(null)} title="Dismiss">✕</button>
              </div>
            )}
            {fetchedUrl && (
              <div className="url-fetched-badge">
                <span><IconFileText size={14} /></span>
                <span className="url-fetched-title">{fetchedUrl.title}</span>
                <span className="url-fetched-meta">{fetchedUrl.wordCount.toLocaleString()} words loaded</span>
                <button className="url-fetch-dismiss" onClick={() => { setFetchedUrl(null); setInput(""); }} title="Clear">✕</button>
              </div>
            )}
            <div className="input-wrapper">
              <textarea
                ref={inputRef}
                className="chat-input"
                value={input}
                onChange={(e) => { setInput(e.target.value); if (!e.target.value.trim()) setFetchedUrl(null); }}
                onKeyDown={handleKeyDown}
                placeholder="Ask about a grant, paste a URL or announcement text, or ask 'what grants does Buffalo Grove qualify for?'"
                rows={1}
                disabled={isLoading}
              />
              <div className="input-actions">
                <button
                  className="send-btn"
                  onClick={() => handleSend()}
                  disabled={isLoading || !input.trim()}
                >
                  {isLoading ? <span className="send-spinner" /> : "\u2191"}
                </button>
              </div>
            </div>
            <div className="input-hint">
              Powered by Microsoft Foundry IQ · Sources cited · Paste any grant URL to auto-fetch · Press Enter to send
            </div>
          </div>
        </main>
      </div>

      {/* Right Workspace panel */}
      <WorkspacePanel
        steps={wsSteps}
        citations={wsCitations}
        graphPaths={wsGraphPaths}
        artifacts={artifacts}
        widget={wsWidget}
        analysisText={wsAnalysisText}
        isLoading={isLoading}
        hasMessages={hasMessages}
        redTeamReview={wsRedTeam}
        competitorIntel={wsCompetitor}
        refinement={wsRefinement}
        reviewStreaming={wsReviewStreaming}
        competitorStreaming={wsCompetitorStreaming}
        refinementStreaming={wsRefinementStreaming}
        onOpenPreview={setPreviewData}
        onOpenDrawer={setAgentDrawer}
      />
      </div>

      {/* Agent Intel Drawer — slides in from right, sits above workspace panel */}
      <AgentDrawer view={agentDrawer} onClose={() => setAgentDrawer(null)} />

      {/* Report Preview Modal */}
      {previewData && (
        <ReportPreviewModal
          data={previewData}
          onClose={() => setPreviewData(null)}
        />
      )}
    </div>
  );
}

