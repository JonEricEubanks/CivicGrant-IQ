import { useState, useRef, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { streamChat, streamScan, generatePackage, draftApplication, fetchGrantUrl, fetchMonitor, fetchHeroGrants, fetchFabricContext } from "../api";
import type { FetchedUrl, MonitorData, HeroGrantResult, FabricIqContext } from "../api";
import type { ReasoningStep, Citation, RedTeamResult, CompetitorIntelResult, RefinedNarrativeResult, OrchestrationDecision, WorkIqCityContext, CityProfile, AgentHandoff, ToolCallEvent, GuardrailsSummaryData } from "../types";
import { GrantMatchWidget } from "./GrantMatchWidget";
import type { GrantMatchData } from "./GrantMatchWidget";
import { GrantPipelineWidget } from "./GrantPipelineWidget";
import type { PipelineGrant } from "./GrantPipelineWidget";
import { CityProfileScanWidget } from "./CityProfileScanWidget";
import type { CityProfileScanData } from "./CityProfileScanWidget";
import { InlineScanSetupCard } from "./InlineScanSetupCard";
import type { DrawerView } from "./AgentDrawer";
import { AgentDrawer } from "./AgentDrawer";
import { ReportPreviewModal } from "./ReportPreviewModal";
import type { ReportPayload } from "./ReportPreviewModal";
import { AppHeader } from "./AppHeader";
import { GraphPathsPanel } from "./GraphPathsPanel";
import { ProcessPill } from "./ProcessPill";
import {
  IconBuilding, IconSearch, IconSettings, IconNewChat,
  IconCopy, IconCheck, IconBolt,
  IconChart, IconFilePdf, IconFileText, IconGlobe,
  IconLink, IconScales, IconTarget, IconSparkle, IconAward,
  IconPaperclip, IconDatabase, IconPanelRight,
  IconFabricIQ, IconAlert, IconClock, IconChat,
} from "./Icons";
import "./ChatInterface.css";

type WidgetPayload =
  | { type: "grant_match"; data: GrantMatchData }
  | { type: "grant_pipeline"; data: { grants: PipelineGrant[]; cityName: string; totalOpportunity: number } }
  | { type: "grant_detail"; data: Record<string, unknown> | null }
  | { type: "portfolio_health"; data: Record<string, unknown> }
  | { type: "compliance_board"; data: Record<string, unknown> }
  | { type: "city_scan"; data: CityProfileScanData };

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
  agentHandoffs?: AgentHandoff[];
  toolCalls?: ToolCallEvent[];
  guardrailsSummary?: GuardrailsSummaryData;
  workIqContext?: WorkIqCityContext;
  tierInfo?: { tier: 1 | 2 | 3; label: string; guardrailsPassed: boolean; violations: number };
  graphPaths?: import("../types").GraphPath[];
  routingDecision?: { intent: string; sources: string[]; widgetType: string };
  concurrencyLog?: string[];
  reviewStreaming?: boolean;
  competitorStreaming?: boolean;
  refinementStreaming?: boolean;
  streaming?: boolean;
  statusLog?: string[];
  startedAt?: number;
  completedAt?: number;
  isFollowUp?: boolean;
  isScanSetup?: boolean;
  scanSetupConfirmed?: boolean;
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
    if (/compet|municip|who else|cities/.test(h)) return "◈";
    if (/strength|advantage|edge|past|track record/.test(h)) return "✓";
    if (/gap|weakness|missing|risk|challenge/.test(h)) return "⚠";
    if (/strategy|next step|action|recommend|improve|boost/.test(h)) return "→";
    if (/comparison|compare|profile|buffalo/.test(h)) return "◈";
    if (/conclusion|summary|overall/.test(h)) return "◎";
    if (/timeline|deadline|schedule/.test(h)) return "◷";
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

// ─── Grant Detail Card — rich structured card for grant_detail widget type ─────
function fmtUSDShort(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function GrantDetailCard({ data }: { data: Record<string, unknown> | null }) {
  if (!data) return null;
  const d = data as {
    name?: string; agency?: string; status?: string; awardAmount?: number; summary?: string;
    disbursements?: Array<{ label?: string; phase?: string; amount: number; status: string }>;
    milestones?: Array<{ title: string; status: string; dueDate: string }>;
    compliance?: Array<{ title: string; status: string; dueDate: string }>;
    fabricLive?: { pctDisbursed?: number; lifecycleState?: string; keyRisk?: string };
  };

  const disburse = d.disbursements ?? [];
  const paid = disburse.filter(x => x.status === "paid").reduce((s, x) => s + x.amount, 0);
  const total = disburse.reduce((s, x) => s + x.amount, 0) || d.awardAmount || 0;
  const pctPaid = d.fabricLive?.pctDisbursed ?? (total > 0 ? Math.round((paid / total) * 100) : 0);
  const openMilestones = (d.milestones ?? []).filter(m => m.status !== "complete");
  const alerts = (d.compliance ?? []).filter(c => c.status === "overdue" || c.status === "due-soon");

  const statusColor: Record<string, string> = {
    paid: "#15803d", pending: "#b45309", planned: "#64748b", overdue: "#dc2626", "due-soon": "#d97706",
  };

  return (
    <div className="gdc">
      {/* Header — same navy gradient as GrantMatchWidget */}
      <div className="gdc-header">
        <div className="gdc-badge">Grant Status Report</div>
        <div className="gdc-name">{d.name ?? "Grant Detail"}</div>
        <div className="gdc-meta">
          <span>{d.agency}</span>
          {d.status && (
            <span className={`gdc-status-badge gdc-status-badge--${d.status.toLowerCase()}`}>
              {d.status.toUpperCase()}
            </span>
          )}
        </div>
      </div>

      {/* KPI row */}
      <div className="gdc-kpis">
        {d.awardAmount != null && (
          <div className="gdc-kpi">
            <span className="gdc-kpi-val">{fmtUSDShort(d.awardAmount)}</span>
            <span className="gdc-kpi-lbl">Award</span>
          </div>
        )}
        <div className="gdc-kpi">
          <span className="gdc-kpi-val" style={{ color: pctPaid >= 50 ? "#15803d" : pctPaid >= 25 ? "#b45309" : "#1d4ed8" }}>{pctPaid}%</span>
          <span className="gdc-kpi-lbl">Disbursed</span>
        </div>
        {d.fabricLive?.lifecycleState && (
          <div className="gdc-kpi">
            <span className="gdc-kpi-val gdc-kpi-val--sm">{d.fabricLive.lifecycleState}</span>
            <span className="gdc-kpi-lbl">Lifecycle</span>
          </div>
        )}
        {openMilestones.length > 0 && (
          <div className="gdc-kpi">
            <span className="gdc-kpi-val" style={{ color: "#7c3aed" }}>{openMilestones.length}</span>
            <span className="gdc-kpi-lbl">Open Milestones</span>
          </div>
        )}
        {alerts.length > 0 && (
          <div className="gdc-kpi">
            <span className="gdc-kpi-val" style={{ color: "#dc2626" }}>{alerts.length}</span>
            <span className="gdc-kpi-lbl">Alerts</span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div className="gdc-progress-wrap">
          <div className="gdc-progress-track">
            <div className="gdc-progress-fill" style={{ width: `${Math.min(pctPaid, 100)}%` }} />
          </div>
          <span className="gdc-progress-label">
            {fmtUSDShort(paid)} of {fmtUSDShort(total)} disbursed
          </span>
        </div>
      )}

      {/* Fabric IQ live overlay */}
      {d.fabricLive?.keyRisk && (
        <div className="gdc-fabric-risk">
          <span className="gdc-fabric-risk-icon"><IconAlert size={13} /></span>
          <span className="gdc-fabric-risk-text"><strong>Key Risk (Fabric IQ):</strong> {d.fabricLive.keyRisk}</span>
        </div>
      )}

      {/* Disbursements */}
      {disburse.length > 0 && (
        <div className="gdc-section">
          <div className="gdc-section-title">
            <span className="gdc-section-icon">$</span>DISBURSEMENTS
          </div>
          <div className="gdc-dis-list">
            {disburse.map((dis, i) => (
              <div key={i} className="gdc-dis-row">
                <span className="gdc-dis-label">{dis.label ?? dis.phase}</span>
                <span className="gdc-dis-amount">{fmtUSDShort(dis.amount)}</span>
                <span className="gdc-dis-status" style={{ color: statusColor[dis.status] ?? "#64748b" }}>
                  {dis.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Open milestones */}
      {openMilestones.length > 0 && (
        <div className="gdc-section">
          <div className="gdc-section-title">
            <span className="gdc-section-icon"><IconClock size={13} /></span>OPEN MILESTONES
          </div>
          <div className="gdc-milestone-list">
            {openMilestones.slice(0, 5).map((m, i) => {
              const due = new Date(m.dueDate);
              const daysLeft = Math.ceil((due.getTime() - Date.now()) / 86_400_000);
              const urgent = daysLeft < 30;
              return (
                <div key={i} className="gdc-milestone-row">
                  <span className={`gdc-milestone-dot gdc-milestone-dot--${m.status}`} />
                  <span className="gdc-milestone-title">{m.title}</span>
                  <span className="gdc-milestone-meta">
                    <span className={`gdc-milestone-date${urgent ? " gdc-milestone-date--urgent" : ""}`}>
                      {due.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      {urgent && <IconAlert size={11} style={{ marginLeft: 3, verticalAlign: "middle" }} color="#dc2626" />}
                    </span>
                    <span className={`gdc-milestone-status gdc-milestone-status--${m.status}`}>{m.status}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Compliance alerts */}
      {alerts.length > 0 && (
        <div className="gdc-section gdc-section--alert">
          <div className="gdc-section-title">
            <span className="gdc-section-icon"><IconAlert size={13} /></span>COMPLIANCE ALERTS
          </div>
          <div className="gdc-alert-list">
            {alerts.map((a, i) => (
              <div key={i} className={`gdc-alert-row gdc-alert-row--${a.status}`}>
                <span className="gdc-alert-title">{a.title}</span>
                <span className="gdc-alert-due">due {new Date(a.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                <span className={`gdc-alert-badge gdc-alert-badge--${a.status}`}>{a.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fabric IQ source tag */}
      {d.fabricLive && (
        <div className="gdc-fabric-tag">
          <span className="gdc-fabric-dot" />Fabric IQ · Live overlay
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
function ThoughtProcess({ steps, isStreaming, forceOpen }: { steps: ReasoningStep[]; isStreaming: boolean; forceOpen?: boolean }) {
  const [open, setOpen] = useState(true);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  const completedCount = steps.filter(s => s.completed).length;
  const maxSeenStep = steps.length > 0 ? Math.max(...steps.map(s => s.step)) : 0;
  const maxCompletedStep = completedCount > 0 ? Math.max(...steps.filter(s => s.completed).map(s => s.step)) : 0;
  // While streaming keep at least 6 slots so "1/6" shows instead of "1/1" during early steps.
  // After streaming ends, base on completed steps only — avoids "0/1" from a lone incomplete preview.
  const totalSteps = isStreaming ? Math.max(6, maxSeenStep) : (maxCompletedStep > 0 ? maxCompletedStep : maxSeenStep > 0 ? maxSeenStep : 6);
  const allDone = !isStreaming && completedCount >= totalSteps;

  // Collapse to the clean summary bar once all steps finish — unless forced open (e.g. inside ProcessPill)
  useEffect(() => { if (allDone && !forceOpen) setOpen(false); }, [allDone, forceOpen]);

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
  inputs: AttachDoc[];
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
  tierInfo?: { tier: 1 | 2 | 3; label: string; guardrailsPassed: boolean; violations: number };
  isVisible: boolean;
  onToggleVisibility: () => void;
  onOpenPreview: (payload: ReportPayload) => void;
  onOpenDrawer: (view: DrawerView) => void;
}

function WorkspacePanel({ steps, citations, graphPaths, artifacts, inputs, widget, analysisText, isLoading, hasMessages, redTeamReview, competitorIntel, refinement, reviewStreaming, competitorStreaming, refinementStreaming, tierInfo, isVisible, onToggleVisibility, onOpenPreview, onOpenDrawer }: WorkspacePanelProps) {
  const [planOpen, setPlanOpen] = useState(true);
  const [outputOpen, setOutputOpen] = useState(true);
  const [inputsOpen, setInputsOpen] = useState(true);
  const [intelOpen, setIntelOpen] = useState(true);
  const [refsOpen, setRefsOpen] = useState(true);
  const [selectedRef, setSelectedRef] = useState<Citation | null>(null);
  const [selectedInput, setSelectedInput] = useState<AttachDoc | null>(null);
  const [graphPopoutOpen, setGraphPopoutOpen] = useState(false);
  const [tierPopoverOpen, setTierPopoverOpen] = useState(false);

  // Only show steps that are fully completed — don't pollute the Plan with in-flight partial labels
  const completedSteps = steps.filter(s => s.completed);
  const completedCount = completedSteps.length;
  // Expected total: use what we know — 3 for follow-ups (they get 3 fixed steps), 6 for full analysis
  // While loading and we have no steps yet, default to 6. After done, use actual count.
  const expectedTotal = !isLoading
    ? completedCount
    : completedCount >= 3 && steps.some(s => s.label.includes("Load Session Context"))
    ? 3
    : Math.max(6, completedCount);
  const allPlanDone = !isLoading && completedCount > 0;

  return (
    <aside className={`workspace-panel ${hasMessages && isVisible ? "workspace-panel--visible" : ""}`}>
      <div className="ws-header">
        <span className="ws-title">Workspace</span>
        <button
          className="ws-header-toggle"
          onClick={onToggleVisibility}
          title="Hide details panel (Ctrl+Shift+B)"
          aria-label="Hide details panel"
          type="button"
        >
          <IconPanelRight size={14} />
        </button>
      </div>

      {/* Plan */}
      <div className="ws-section">
        <button className="ws-section-header" onClick={() => setPlanOpen(!planOpen)}>
          <span className="ws-section-name">Plan</span>
          <div className="ws-section-meta">
            {isLoading && (
              <span className="ws-badge ws-badge--count">{completedCount}/{expectedTotal}</span>
            )}
            {allPlanDone && (
              <span className="ws-badge ws-badge--done">✓ {completedCount}</span>
            )}
            <span className={`ws-chevron ${planOpen ? "ws-chevron--open" : ""}`}>›</span>
          </div>
        </button>
        {planOpen && (
          <div className="ws-section-body">
            {/* Only render completed steps — in-flight partial steps stay in ThoughtProcess */}
            {completedSteps.map((step) => (
              <div key={step.step} className="ws-plan-item ws-plan-item--done">
                <span className="ws-plan-check">✓</span>
                <span className="ws-plan-label">{step.label}</span>
              </div>
            ))}
            {/* Loading placeholder while no steps have completed yet */}
            {isLoading && completedCount === 0 && (
              <div className="ws-plan-item ws-plan-item--active">
                <span className="ws-plan-check"><span className="ws-plan-spinner" /></span>
                <span className="ws-plan-label">Analyzing…</span>
              </div>
            )}
            {/* While loading, show pending placeholders for remaining steps */}
            {isLoading && completedCount > 0 && completedCount < expectedTotal && (
              <div className="ws-plan-item ws-plan-item--active">
                <span className="ws-plan-check"><span className="ws-plan-spinner" /></span>
                <span className="ws-plan-label">{expectedTotal - completedCount} step{expectedTotal - completedCount !== 1 ? "s" : ""} remaining…</span>
              </div>
            )}
            {!isLoading && completedCount === 0 && (
              <p className="ws-empty">No plan yet</p>
            )}
          </div>
        )}
      </div>

      {/* Inputs — pinned context docs & M365 signals used in this analysis */}
      {inputs.length > 0 && (
        <div className="ws-section">
          <button className="ws-section-header" onClick={() => setInputsOpen(!inputsOpen)}>
            <span className="ws-section-name">Inputs</span>
            <div className="ws-section-meta">
              <span className="ws-badge ws-badge--count">{inputs.length}</span>
              <span className={`ws-chevron ${inputsOpen ? "ws-chevron--open" : ""}`}>›</span>
            </div>
          </button>
          {inputsOpen && (
            <div className="ws-section-body">
              {inputs.map((doc) => {
                const isExpanded = selectedInput?.id === doc.id;
                const preview = doc.content ?? doc.desc;
                return (
                  <div key={doc.id} className="ws-input-item">
                    <button
                      className={`ws-file-item ws-file-item--clickable${isExpanded ? " ws-file-item--active" : ""}`}
                      onClick={() => setSelectedInput(isExpanded ? null : doc)}
                      title="Click to preview"
                    >
                      <span className="ws-input-icon">
                        {doc.kind === "calendar"
                          ? <IconClock size={13} className="ws-file-icon" />
                          : doc.kind === "teams"
                            ? <IconChat size={13} className="ws-file-icon" />
                            : doc.source === "foundry-iq"
                              ? <IconDatabase size={13} className="ws-file-icon" />
                              : <IconFileText size={13} className="ws-file-icon" />}
                      </span>
                      <span className="ws-file-name ws-file-name--truncate">{doc.label}</span>
                      <span className="ws-file-menu">{isExpanded ? "∧" : "›"}</span>
                    </button>
                    {isExpanded && (
                      <div className="ws-input-preview">
                        <div className="ws-input-preview-source">{doc.desc}</div>
                        <div className="ws-input-preview-body">{preview}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Output */}
      <div className="ws-section">
        <button className="ws-section-header" onClick={() => setOutputOpen(!outputOpen)}>
          <span className="ws-section-name">Output</span>
          <div className="ws-section-meta">
            {(widget ? 1 : 0) + artifacts.length + (!widget && !isLoading && analysisText ? 1 : 0) > 0 && (
              <span className="ws-badge ws-badge--count">{(widget ? 1 : 0) + artifacts.length + (!widget && !isLoading && analysisText ? 1 : 0)}</span>
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
            {(widget?.type === "grant_detail" || widget?.type === "portfolio_health" || widget?.type === "compliance_board") && (
              <div
                className="ws-file-item ws-file-item--clickable"
                onClick={() => onOpenPreview({
                  type: "grant_pipeline",
                  analysisText,
                  title: widget.type === "grant_detail" ? ((widget.data as any)?.name ?? "Grant Detail") : widget.type === "portfolio_health" ? "Portfolio Health Report" : "Compliance Alerts",
                  citations,
                })}
              >
                <IconFileText size={13} className="ws-file-icon" />
                <span className="ws-file-name">
                  {widget.type === "grant_detail" ? ((widget.data as any)?.name ?? "Grant Detail") : widget.type === "portfolio_health" ? "Portfolio Health Report" : "Compliance Alerts"}
                </span>
                <button
                  className="ws-file-menu"
                  onClick={(e) => { e.stopPropagation(); onOpenPreview({ type: "grant_pipeline", analysisText, title: widget.type === "grant_detail" ? ((widget.data as any)?.name ?? "Grant Detail") : widget.type === "portfolio_health" ? "Portfolio Health Report" : "Compliance Alerts", citations }); }}
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
            {!widget && artifacts.length === 0 && !isLoading && analysisText && hasMessages && (
              <div
                className="ws-file-item ws-file-item--clickable"
                onClick={() => onOpenPreview({ type: "grant_pipeline", analysisText, title: "Follow-up Analysis", citations })}
              >
                <IconFileText size={13} className="ws-file-icon" />
                <span className="ws-file-name">Follow-up Analysis</span>
                <button
                  className="ws-file-menu"
                  onClick={(e) => { e.stopPropagation(); onOpenPreview({ type: "grant_pipeline", analysisText, title: "Follow-up Analysis", citations }); }}
                  title="Open preview"
                >↗</button>
              </div>
            )}
            {!widget && artifacts.length === 0 && !(!isLoading && analysisText) && hasMessages && (
              <p className="ws-empty">No outputs yet</p>
            )}
          </div>
        )}
      </div>

      {/* Agent Intelligence — result cards for secondary agents */}
      {(redTeamReview || competitorIntel || refinement || reviewStreaming || competitorStreaming || refinementStreaming || tierInfo) && (
        <div className="ws-section">
          <button className="ws-section-header" onClick={() => setIntelOpen(!intelOpen)}>
            <span className="ws-section-name">Agent Intel</span>
            <div className="ws-section-meta">
              {(redTeamReview || competitorIntel || refinement) && (
                <span className="ws-badge ws-badge--intel">
                  {[redTeamReview && "Red Team", competitorIntel && "Intel", refinement && "Refined"].filter(Boolean).join(" · ")}
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
                          <span className="ws-intel-score-sub">
                            {redTeamReview.overallScore >= 80
                              ? "Federal reviewer would likely approve"
                              : redTeamReview.overallScore >= 60
                              ? "Approve with conditions"
                              : "Significant revisions needed"}
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
                          <span className="ws-intel-score-sub">
                            ~{competitorIntel.estimatedApplicants} applicants expected
                          </span>
                        </div>
                      </div>
                      <div className="ws-intel-verdict">
                        <span className={`ws-level-dot ws-level-dot--${competitorIntel.competitionLevel}`} />
                        {competitorIntel.competitionLevel.charAt(0).toUpperCase() + competitorIntel.competitionLevel.slice(1)} competition
                        <span className="ws-intel-applicants"> · stronger position than average</span>
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
                          <span className="ws-intel-score-sub">
                            Narrative hardened by adversarial self-critique
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

              {/* Tier / provenance card */}
              {tierInfo && (
                <div className="ws-tier-card-wrap">
                  <div
                    className="ws-intel-card ws-intel-card--tier ws-intel-card--ready"
                    onClick={() => setTierPopoverOpen((o) => !o)}
                    title="Click to see all AI tiers"
                  >
                    <div className="ws-intel-card-header">
                      <span className="ws-intel-icon">⬡</span>
                      <span className="ws-intel-label">AI Provenance</span>
                      <span className="ws-tier-expand-hint">{tierPopoverOpen ? "▲" : "▼"}</span>
                    </div>
                    <div className="ws-tier-label">{tierInfo.tier === 1 ? "Tier 1 — Foundry SDK" : tierInfo.tier === 2 ? "Tier 2 — Azure OpenAI" : "Tier 3 — Mock Engine"}</div>
                    <div className="ws-tier-rules">
                      <span className={`ws-tier-pill ${tierInfo.guardrailsPassed ? "ws-tier-pill--pass" : "ws-tier-pill--warn"}`}>
                        {tierInfo.guardrailsPassed ? `17 rules passed` : `${tierInfo.violations} flag${tierInfo.violations === 1 ? "" : "s"}`}
                      </span>
                    </div>
                  </div>
                  {tierPopoverOpen && (
                    <div className="ws-tier-popover">
                      <div className="ws-tier-popover-title">AI Routing Tiers</div>
                      <div className="ws-tier-popover-rows">
                      {([
                        { t: 1, label: "Tier 1 — Foundry SDK", sub: "Full Azure AI Foundry Assistants API with MCP tool calls, knowledge base retrieval, and OpenAI Assistants thread management.", color: "#1a6fba" },
                        { t: 2, label: "Tier 2 — Azure OpenAI", sub: "Direct Azure OpenAI chat completions with SSE streaming. Guardrails and grounding still applied.", color: "#3b82f6" },
                        { t: 3, label: "Tier 3 — Mock Engine", sub: "Local deterministic mock — no AI calls. Used for offline demos or when Azure credentials are unavailable.", color: "#94a3b8" },
                      ] as { t: 1|2|3; label: string; sub: string; color: string }[]).map(({ t, label, sub, color }) => (
                        <div key={t} className={`ws-tier-popover-row${tierInfo.tier === t ? " ws-tier-popover-row--active" : ""}`}>
                          <div className="ws-tier-popover-row-header">
                            <span className="ws-tier-popover-dot" style={{ background: color }} />
                            <span className="ws-tier-popover-label">{label}</span>
                            {tierInfo.tier === t && <span className="ws-tier-popover-current">current</span>}
                          </div>
                          <p className="ws-tier-popover-sub">{sub}</p>
                        </div>
                      ))}
                      </div>
                      <div className="ws-tier-popover-footer">
                        <span className="ws-tier-pill ws-tier-pill--pass">17 guardrail rules active</span>
                      </div>
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
                  onClick={() => { setSelectedRef(selectedRef === c ? null : c); setGraphPopoutOpen(false); }}
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

            {/* GraphRAG entry — opens the paths popout */}
            {graphPaths && graphPaths.length > 0 && (
              <div
                className={`ws-file-item ws-file-item--clickable ws-file-item--graphrag${graphPopoutOpen ? " ws-file-item--active" : ""}`}
                onClick={() => { setGraphPopoutOpen(v => !v); setSelectedRef(null); }}
                title="View GraphRAG reasoning paths"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.2" className="ws-file-icon">
                  <circle cx="5" cy="12" r="3" /><circle cx="19" cy="5" r="3" /><circle cx="19" cy="19" r="3" />
                  <line x1="8" y1="11" x2="16" y2="7" /><line x1="8" y1="13" x2="16" y2="17" />
                </svg>
                <span className="ws-file-name">GraphRAG · {graphPaths.length} path{graphPaths.length !== 1 ? "s" : ""}</span>
                <span className="ws-file-menu">›</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* GraphRAG Popout */}
      {graphPopoutOpen && graphPaths && graphPaths.length > 0 && (
        <>
          <div className="ref-preview-overlay" onClick={() => setGraphPopoutOpen(false)} />
          <div className="ref-preview-card ref-preview-card--graphrag" role="dialog" aria-label="GraphRAG reasoning paths">
            <div className="ref-preview-header">
              <div className="ref-preview-title-block">
                <div className="ref-preview-source-badge ref-preview-source-badge--graphrag">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="5" cy="12" r="3" /><circle cx="19" cy="5" r="3" /><circle cx="19" cy="19" r="3" />
                    <line x1="8" y1="11" x2="16" y2="7" /><line x1="8" y1="13" x2="16" y2="17" />
                  </svg>
                  GraphRAG
                </div>
                <div className="ref-preview-title">Reasoning Paths</div>
                <div className="ref-preview-agency">{graphPaths.length} evidence path{graphPaths.length !== 1 ? "s" : ""} traversed by the AI</div>
              </div>
              <button className="ref-preview-close" onClick={() => setGraphPopoutOpen(false)} aria-label="Close">✕</button>
            </div>
            <div className="ref-preview-body ref-preview-body--graphrag">
              <GraphPathsPanel paths={graphPaths} defaultOpen />
            </div>
            <div className="ref-preview-footer">
              <button className="ref-preview-use-btn" onClick={() => setGraphPopoutOpen(false)}>Done</button>
            </div>
          </div>
        </>
      )}

      {/* Reference Preview Popover */}
      {selectedRef && (() => {
        const raw = selectedRef.excerpt ?? "";
        // Strip separator lines (===, ---, ~~~) and collect clean non-empty lines
        const lines = raw
          .split(/\r\n|\r|\n/)
          .map(l => l.trim())
          .filter(l => l.length > 0 && !/^[=\-~]{3,}$/.test(l));
        // Bucket into sections: ALL-CAPS short lines are headings
        type KbSection = { heading: string | null; lines: string[] };
        const sections: KbSection[] = [];
        let cur: KbSection = { heading: null, lines: [] };
        for (const l of lines) {
          const isHeader = l === l.toUpperCase() && l.length <= 72 && /[A-Z]{3}/.test(l);
          if (isHeader) {
            if (cur.lines.length > 0 || cur.heading) sections.push(cur);
            cur = { heading: l, lines: [] };
          } else {
            cur.lines.push(l);
          }
        }
        if (cur.lines.length > 0 || cur.heading) sections.push(cur);
        const docName = selectedRef.title.split(" — ")[0];
        const docSub  = selectedRef.title.includes(" — ")
          ? selectedRef.title.split(" — ").slice(1).join(" — ") : null;
        return (
        <>
          <div className="ref-preview-overlay" onClick={() => setSelectedRef(null)} />
          <div className="ref-preview-card" role="dialog" aria-label="Reference preview">
            <div className="ref-preview-header">
              <div className="ref-preview-title-block">
                <div className="ref-preview-source-badge">
                  <IconFileText size={12} /> Knowledge Base
                </div>
                <div className="ref-preview-title">{docName}</div>
                {docSub && <div className="ref-preview-agency">{docSub}</div>}
              </div>
              <button className="ref-preview-close" onClick={() => setSelectedRef(null)} aria-label="Close">✕</button>
            </div>
            <div className="ref-preview-body ref-preview-body--kb">
              {sections.slice(0, 5).map((sec, si) => (
                <div key={si} className={`ref-kb-section${sec.heading ? "" : " ref-kb-section--no-heading"}`}>
                  {sec.heading && <div className="ref-kb-heading">{sec.heading}</div>}
                  {sec.lines.slice(0, 6).map((line, li) => (
                    <p key={li} className="ref-preview-excerpt">{line}</p>
                  ))}
                </div>
              ))}
            </div>
            <div className="ref-preview-footer">
              {selectedRef.url && (
                <a href={selectedRef.url} target="_blank" rel="noopener noreferrer" className="ref-preview-link">
                  View Source ↗
                </a>
              )}
              <button className="ref-preview-use-btn" onClick={() => setSelectedRef(null)}>Done</button>
            </div>
          </div>
        </>
        );
      })()}
    </aside>
  );
}

// ─── Attachment picker data ─────────────────────────────────────────────────
interface AttachDoc {
  id: string;
  label: string;
  desc: string;
  source: "work-iq" | "foundry-iq" | "fabric-iq";
  kind?: "doc" | "calendar" | "email" | "teams";
  /** Full content to inject into prompt when pinned */
  content?: string;
}

const LOCAL_WORK_IQ_DOCS: AttachDoc[] = [
  { id: "city-profile", label: "City Profile 2026", desc: "Demographics, budget, Aa2 Moody\u2019s rating, CRS Class 7", source: "work-iq" },
  { id: "cip", label: "Capital Improvement Plan 2026\u20132030", desc: "15 priority projects \u00b7 $89.4M total \u00b7 $34.4M grant pursuit", source: "work-iq" },
  { id: "bric", label: "FEMA BRIC \u2014 Buffalo Creek 2025", desc: "Flood warning system, green infrastructure, $3.4M application", source: "work-iq" },
  { id: "northwood", label: "Northwood Stormwater SMC 2024", desc: "AWARDED $5.5M stormwater wetland & road reconstruction", source: "work-iq" },
  { id: "raise", label: "RAISE Aptakisic/IL-83 2024", desc: "$5M request \u00b7 intersection, adaptive signals, protected bike lane", source: "work-iq" },
];

const FOUNDRY_IQ_DOCS: AttachDoc[] = [
  // City & Capital context
  { id: "fiq-city", label: "City Profile 2026", desc: "Foundry IQ · demographics, financials & city overview", source: "foundry-iq" },
  { id: "fiq-cip", label: "Capital Improvement Plan 2026–2030", desc: "Foundry IQ · infrastructure projects, budgets & timelines", source: "foundry-iq" },
  // Past applications
  { id: "fiq-bric-2025", label: "BRIC Application — Buffalo Creek 2025", desc: "Foundry IQ · past application narrative & scoring feedback", source: "foundry-iq" },
  { id: "fiq-smc-2024", label: "SMC Award — Northwood Stormwater 2024", desc: "Foundry IQ · awarded application with compliance data", source: "foundry-iq" },
  { id: "fiq-raise-2024", label: "RAISE Application — Aptakisic IL83 2024", desc: "Foundry IQ · transportation grant application & scoring", source: "foundry-iq" },
  // Grant intelligence
  { id: "fiq-federal-programs", label: "Federal Major Grant Programs 2026", desc: "Foundry IQ · BRIC, RAISE, CDBG-DR, BUILD, EPA programs", source: "foundry-iq" },
  { id: "fiq-scoring-rubrics", label: "Federal Grant Scoring Rubrics", desc: "Foundry IQ · winning criteria & reviewer scoring logic", source: "foundry-iq" },
  { id: "fiq-calendar", label: "Grant Calendar FY2026 Deadlines", desc: "Foundry IQ · upcoming deadlines & notice of funding dates", source: "foundry-iq" },
  { id: "fiq-metro-landscape", label: "Metro/Suburban Grant Landscape 2026", desc: "Foundry IQ · competitive landscape for suburban municipalities", source: "foundry-iq" },
  { id: "fiq-smallcity", label: "Small City & Rural Grant Guide", desc: "Foundry IQ · programs sized for communities under 50K", source: "foundry-iq" },
  { id: "fiq-framework", label: "Universal City Grant Framework", desc: "Foundry IQ · cross-program strategy & eligibility matrix", source: "foundry-iq" },
  { id: "fiq-equity", label: "Equity & Justice40 Framing Guide", desc: "Foundry IQ · DAC scoring, equity narratives & J40 criteria", source: "foundry-iq" },
  { id: "fiq-stacking", label: "Multi-Grant Stacking Strategies", desc: "Foundry IQ · layering federal, state & local funding", source: "foundry-iq" },
];

const FABRIC_IQ_DOCS: AttachDoc[] = [
  { id: "fab-semantic", label: "Grant Semantic Model", desc: "Fabric IQ \u00b7 semantic layer for grant eligibility & scoring logic", source: "fabric-iq" },
  { id: "fab-ontology", label: "City Ontology Context", desc: "Fabric IQ \u00b7 entities, relationships & business rules for Buffalo Grove", source: "fabric-iq" },
  { id: "fab-ops", label: "Operations Agent Signals", desc: "Fabric IQ \u00b7 real-time operational telemetry & compliance status", source: "fabric-iq" },
  { id: "fab-graph", label: "Grant Graph Relationships", desc: "Fabric IQ \u00b7 GQL-powered relationship map across programs & agencies", source: "fabric-iq" },
];

export function ChatInterface({ onSwitchToScan, onSwitchToAdmin, tourButton, autoScan, onScanTriggered }: { onSwitchToScan?: () => void; onSwitchToAdmin?: (grantId?: string) => void; tourButton?: ReactNode; autoScan?: boolean; onScanTriggered?: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [threadId, setThreadId] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const isSendingRef = useRef(false); // StrictMode-safe guard against double sends
  const [copied, setCopied] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<ReportPayload | null>(null);
  const [agentDrawer, setAgentDrawer] = useState<DrawerView>(null);
  const [heroAmt, setHeroAmt] = useState(0);
  const [heroGrants, setHeroGrants] = useState<HeroGrantResult[] | null>(null);
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
  const [attachedDocs, setAttachedDocs] = useState<AttachDoc[]>([]);
  const [showAttachPicker, setShowAttachPicker] = useState(false);
  const [attachPickerTab, setAttachPickerTab] = useState<"all" | "sharepoint" | "meetings" | "emails" | "teams" | "foundry-iq" | "fabric-iq">("all");
  const [spDocs, setSpDocs] = useState<AttachDoc[]>([]);
  const [m365Signals, setM365Signals] = useState<AttachDoc[]>([]);
  const [wsInputs, setWsInputs] = useState<AttachDoc[]>([]);
  const [attachSearch, setAttachSearch] = useState("");
  const [isWorkspaceVisible, setIsWorkspaceVisible] = useState(true);
  const [fabricContext, setFabricContext] = useState<FabricIqContext | null>(null);
  const [fabricLoading, setFabricLoading] = useState(false);
  const [backendStatus, setBackendStatus] = useState<"checking" | "ready" | "unreachable">("checking");
  const [workIqLoaded, setWorkIqLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const attachBtnRef = useRef<HTMLButtonElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const hasAutoScannedRef = useRef(false);

  // Detect if the input looks like a URL
  const detectedUrl = /^https?:\/\/\S{10,}/.test(input.trim()) ? input.trim() : null;

  // Poll /api/health until the backend is awake, then dismiss the cold-start banner
  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 8;
    const poll = () => {
      fetch("/api/health", { signal: AbortSignal.timeout(5000) })
        .then((r) => {
          if (cancelled) return;
          if (r.ok) {
            setBackendStatus("ready");
          } else {
            scheduleRetry();
          }
        })
        .catch(() => {
          if (!cancelled) scheduleRetry();
        });
    };
    const scheduleRetry = () => {
      attempts++;
      if (attempts >= maxAttempts) {
        setBackendStatus("unreachable");
        return;
      }
      setTimeout(poll, 3000);
    };
    poll();
    return () => { cancelled = true; };
  }, []);

  // Fetch live grant data for hero cards once on mount
  useEffect(() => {
    fetchHeroGrants()
      .then((data) => {
        if (!data) { setHeroGrants(HERO_GRANTS_DEFAULT); return; }
        setHeroGrants(data.grants);
        setHeroTotal(data.totalMillion);
        if (typeof data.programCount === "number") setHeroProgramCount(data.programCount);
      })
      .catch(() => setHeroGrants(HERO_GRANTS_DEFAULT));
  }, []);

  // Load live SharePoint files for the Work IQ attach picker
  useEffect(() => {
    import("../api").then(({ fetchCityContext }) =>
      fetchCityContext()
        .then((ctx) => {
          if (ctx.source === "sharepoint" && ctx.filesRead.length > 0) {
            setSpDocs(ctx.filesRead.map((name) => ({
              id: `sp-${name}`,
              label: name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "),
              desc: `SharePoint · ${ctx.libraryName ?? "City Grant Intelligence"}`,
              source: "work-iq" as const,
              kind: "doc" as const,
            })));
          }
          // Populate live M365 signals
          const signals: AttachDoc[] = [];
          (ctx.calendarEvents ?? []).forEach((e, i) => signals.push({
            id: `cal-${i}`,
            label: e,
            desc: "Outlook Calendar",
            source: "work-iq" as const,
            kind: "calendar" as const,
            content: `Calendar event: ${e}`,
          }));
          (ctx.mailSignals ?? []).forEach((e, i) => signals.push({
            id: `mail-${i}`,
            label: e,
            desc: "Outlook Mail",
            source: "work-iq" as const,
            kind: "email" as const,
            content: `Email signal: ${e}`,
          }));
          (ctx.teamsInsights ?? []).forEach((e, i) => signals.push({
            id: `teams-${i}`,
            label: e.length > 60 ? e.slice(0, 60) + "…" : e,
            desc: "Microsoft Teams",
            source: "work-iq" as const,
            kind: "teams" as const,
            content: `Teams message: ${e}`,
          }));
          if (signals.length > 0) setM365Signals(signals);
        })
        .then(() => { setWorkIqLoaded(true); })
        .catch(() => { setWorkIqLoaded(true); /* fallback to LOCAL_WORK_IQ_DOCS */ })
    );
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

  // Close attachment picker on outside click
  useEffect(() => {
    if (!showAttachPicker) return;
    function handleOutside(e: MouseEvent) {
      if (
        pickerRef.current && !pickerRef.current.contains(e.target as Node) &&
        attachBtnRef.current && !attachBtnRef.current.contains(e.target as Node)
      ) {
        setShowAttachPicker(false);
        setAttachSearch("");
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [showAttachPicker]);

  const toggleAttachment = useCallback((doc: AttachDoc) => {
    setAttachedDocs((prev) => {
      const exists = prev.some((d) => d.id === doc.id);
      return exists ? prev.filter((d) => d.id !== doc.id) : [...prev, doc];
    });
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachedDocs((prev) => prev.filter((d) => d.id !== id));
  }, []);

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
  const wsTierInfo = latestAssistant?.tierInfo;

  // ─── City Portfolio Scan — Phase 1: show inline setup form ────────────────
  const handleTriggerScanSetup = () => {
    if (isLoading) return;
    isAtBottomRef.current = true;
    const userMsgId = crypto.randomUUID();
    const setupMsgId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev.filter((m) => !m.streaming),
      { id: userMsgId, role: "user", content: "Scan my city — full portfolio analysis" } as Message,
      { id: setupMsgId, role: "assistant", content: "", isScanSetup: true, scanSetupConfirmed: false } as Message,
    ]);
  };

  // ─── City Portfolio Scan — Phase 2: run scan with confirmed profile ─────────
  const handleRunScan = async (profile: CityProfile, setupMsgId?: string) => {
    if (isSendingRef.current) return;
    isSendingRef.current = true;
    isAtBottomRef.current = true;

    // Mark the setup card as confirmed so it collapses
    if (setupMsgId) {
      setMessages((prev) =>
        prev.map((m) => m.id === setupMsgId ? { ...m, scanSetupConfirmed: true } : m)
      );
    }

    const assistantId = crypto.randomUUID();
    const initData: CityProfileScanData = {
      cityName: `${profile.cityName}, ${profile.state}`,
      status: "Launching 5 parallel grant analyses…",
      completedCount: 0,
      totalCount: 8,
      grants: [],
      totalOpportunity: 0,
      done: false,
    };

    setMessages((prev) => [
      ...prev,
      {
        id: assistantId,
        role: "assistant",
        content: "",
        streaming: true,
        statusLog: [],
        startedAt: Date.now(),
        widget: { type: "city_scan" as const, data: initData },
      } as Message,
    ]);
    setIsLoading(true);

    try {
      await streamScan(profile, {
        onStatus: (msg) => {
          const m = msg.match(/launching\s+(\d+)\s*parallel|(\d+)\s*\/\s*(\d+)/i);
          const newTotal = m ? parseInt(m[1] ?? m[3], 10) : 0;
          setMessages((prev) =>
            prev.map((msg2) => {
              if (msg2.id !== assistantId || msg2.widget?.type !== "city_scan") return msg2;
              return {
                ...msg2,
                widget: {
                  type: "city_scan" as const,
                  data: {
                    ...msg2.widget.data,
                    status: msg,
                    ...(newTotal > 3 ? { totalCount: newTotal } : {}),
                  },
                },
              };
            })
          );
        },
        onPortfolioItem: (item) => {
          setMessages((prev) =>
            prev.map((msg2) => {
              if (msg2.id !== assistantId || msg2.widget?.type !== "city_scan") return msg2;
              const cur = msg2.widget.data;
              const newGrant: PipelineGrant = {
                rank: cur.grants.length + 1,
                name: item.grantName,
                agency: item.agency,
                amount: item.fundingAmount,
                matchScore: item.matchScore,
                deadline: item.deadline,
                focusArea: item.focusArea,
                grantsGovUrl: item.grantsGovUrl,
                fundingVerified: item.fundingVerified,
              };
              const sorted = [...cur.grants, newGrant]
                .sort((a, b) => b.matchScore - a.matchScore)
                .map((g, i) => ({ ...g, rank: i + 1 }));
              return {
                ...msg2,
                widget: {
                  type: "city_scan" as const,
                  data: {
                    ...cur,
                    completedCount: cur.completedCount + 1,
                    grants: sorted,
                    totalOpportunity: cur.totalOpportunity + item.fundingAmount,
                    status: `${cur.completedCount + 1} / ${cur.totalCount} grants analyzed`,
                  },
                },
              };
            })
          );
        },
        onPortfolioComplete: ({ grants, totalOpportunity }) => {
          setMessages((prev) =>
            prev.map((msg2) => {
              if (msg2.id !== assistantId || msg2.widget?.type !== "city_scan") return msg2;
              const pipeline: PipelineGrant[] = [...grants]
                .sort((a, b) => b.matchScore - a.matchScore)
                .map((g, i) => ({
                  rank: i + 1,
                  name: g.grantName,
                  agency: g.agency,
                  amount: g.fundingAmount,
                  matchScore: g.matchScore,
                  deadline: g.deadline,
                  focusArea: g.focusArea,
                  grantsGovUrl: g.grantsGovUrl,
                  fundingVerified: g.fundingVerified,
                }));
              return {
                ...msg2,
                widget: {
                  type: "city_scan" as const,
                  data: {
                    ...msg2.widget.data,
                    grants: pipeline,
                    totalOpportunity,
                    completedCount: grants.length,
                    totalCount: grants.length,
                    status: `${grants.length} grants analyzed`,
                  },
                },
              };
            })
          );
        },
        onDone: () => {
          setMessages((prev) =>
            prev.map((msg2) => {
              if (msg2.id !== assistantId) return msg2;
              const w = msg2.widget?.type === "city_scan" ? msg2.widget.data : null;
              return {
                ...msg2,
                streaming: false,
                completedAt: Date.now(),
                widget: w ? { type: "city_scan" as const, data: { ...w, done: true } } : msg2.widget,
              };
            })
          );
          setIsLoading(false);
          isSendingRef.current = false;
        },
        onError: (err) => {
          setMessages((prev) =>
            prev.map((msg2) =>
              msg2.id === assistantId ? { ...msg2, content: `Scan error: ${err}`, streaming: false } : msg2
            )
          );
          setIsLoading(false);
          isSendingRef.current = false;
        },
      });
    } catch {
      setMessages((prev) =>
        prev.map((msg2) =>
          msg2.id === assistantId ? { ...msg2, content: "Connection error — please try again.", streaming: false } : msg2
        )
      );
    } finally {
      setIsLoading(false);
      isSendingRef.current = false;
    }
  };

  // Auto-trigger scan when the parent mounts with autoScan=true (nav tab click)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!autoScan || hasAutoScannedRef.current) return;
    hasAutoScannedRef.current = true;
    onScanTriggered?.();
    const t = setTimeout(() => handleTriggerScanSetup(), 200);
    return () => clearTimeout(t);
  }, []); // run once on mount

  const handleSend = async (text?: string) => {
    const baseMessage = text ?? input.trim();
    if (!baseMessage || isLoading || isSendingRef.current) return;

    // Detect "scan my city" intent — route to inline portfolio scanner
    if (/scan\s+(my\s+)?(city|buffalo|portfolio)|portfolio\s+scan|run\s+.*scan/i.test(baseMessage)) {
      setInput("");
      handleTriggerScanSetup();
      return;
    }
    isSendingRef.current = true;
    setInput("");
    // Prepend pinned doc context for user-typed messages (not hero card prompts)
    const fabricDocs = attachedDocs.filter((d) => d.source === "fabric-iq");
    const fabricPrefix = fabricDocs.length > 0 && fabricContext
      ? `[Fabric IQ Live Context — source:${fabricContext.source} workspace:${fabricContext.workspaceId}\n` +
        `Items: ${fabricContext.items.map((i) => `${i.name}(${i.type})`).join(", ")}\n` +
        (fabricContext.semanticModelName ? `SemanticModel: ${fabricContext.semanticModelName}\n` : "") +
        (fabricContext.tables.length ? `Tables: ${fabricContext.tables.join(", ")}\n` : "") +
        (fabricContext.grantRows.length
          ? `LiveGrantData(${fabricContext.grantRows.length} rows): ${fabricContext.grantRows.slice(0, 6).map((r) => JSON.stringify(r)).join(" | ")}\n`
          : "") +
        `]\n\n`
      : "";
    const docPrefix = attachedDocs.length > 0 && !text
      ? fabricPrefix + `[Pinned Work IQ context:\n${attachedDocs.filter((d) => d.source !== "fabric-iq").map((d) => d.content ?? d.label).join("\n")}]\n\n`
      : fabricPrefix;
    const message = docPrefix + baseMessage;
    if (attachedDocs.length > 0) setWsInputs(attachedDocs);
    setAttachedDocs([]);
    setShowAttachPicker(false);
    // User initiated a new message — always scroll to show the response
    isAtBottomRef.current = true;

    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: baseMessage };
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
        onRoutingDecision: ({ intent, sources, widgetType }) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, routingDecision: { intent, sources, widgetType }, concurrencyLog: [`📍 ROUTING: ${intent} | Sources: ${sources.join(", ")} | Widget: ${widgetType}`] }
                : m
            )
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
              
              // Track concurrency markers
              const concurrencyMarkers = step.content.match(/\[(Competitive Intel|Red Team|Refinement|All agents|awaiting).*?\]/gi) ?? [];
              const newConcurrencyLog = concurrencyMarkers.length > 0
                ? [...(m.concurrencyLog ?? []), ...concurrencyMarkers]
                : m.concurrencyLog;

              return { ...m, reasoningSteps: updated, concurrencyLog: newConcurrencyLog };
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
        onAgentHandoff: (handoff) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, agentHandoffs: [...(m.agentHandoffs ?? []), handoff] }
                : m
            )
          );
        },
        onToolCall: (tc) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, toolCalls: [...(m.toolCalls ?? []), tc] }
                : m
            )
          );
        },
        onGuardrailsSummary: (summary) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, guardrailsSummary: summary } : m
            )
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
          // Replace accumulated chunks with the final clean version.
          // If the final content is empty (widget-only response), keep whatever
          // was already streamed via onChunk rather than blanking the message.
          const cleanContent = content.replace(/```widget[\s\S]*?```/g, "").trim();
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) return m;
              // NEVER overwrite m.widget here — onWidget already set it
              // Keep existing streamed content if the final answer would be blank
              const finalContent = cleanContent || m.content || "";
              return { ...m, content: finalContent, streaming: false };
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
  const latestCityScanMsg = [...messages].reverse().find(
    (m) => m.widget?.type === "city_scan" && Boolean((m.widget.data as CityProfileScanData).cityName)
  );
  const activeCityContext = latestCityScanMsg?.widget?.type === "city_scan"
    ? (latestCityScanMsg.widget.data as CityProfileScanData).cityName
    : "Buffalo Grove, IL";
  const usingDefaultCityContext = !latestCityScanMsg;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "B" || e.key === "b")) {
        e.preventDefault();
        if (hasMessages) {
          setIsWorkspaceVisible((prev) => !prev);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hasMessages]);

  return (
    <div className="chat-interface chat-interface--col">
      <a href="#main-content" className="skip-nav">Skip to main content</a>
      <AppHeader
        active="chat"
        onNavigate={(t) => { if (t === "scan") onSwitchToScan?.(); else if (t === "admin") onSwitchToAdmin?.(); }}
        actions={
          <>
            {tourButton}
            {hasMessages && (
              <button
                className={`cowork-header-icon-btn${isWorkspaceVisible ? " cowork-header-icon-btn--active" : ""}`}
                onClick={() => setIsWorkspaceVisible(v => !v)}
                title={`${isWorkspaceVisible ? "Hide" : "Show"} details panel (Ctrl+Shift+B)`}
                aria-label={`${isWorkspaceVisible ? "Hide" : "Show"} details panel`}
                aria-pressed={isWorkspaceVisible}
                type="button"
              >
                <IconPanelRight size={16} />
              </button>
            )}
            <button className="cowork-header-icon-btn" title="New chat" aria-label="Start new chat" onClick={handleNewChat}><IconNewChat size={16} /></button>
            <button
              className={`cowork-header-icon-btn${showSettings ? " cowork-header-icon-btn--active" : ""}`}
              title="Intelligence Hub"
              aria-label="Open Intelligence Hub"
              aria-expanded={showSettings}
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
        <main id="main-content" className="chat-main">
          <div
            className="chat-messages"
            ref={messagesContainerRef}
            role="log"
            aria-label="Conversation messages"
            aria-live="polite"
            aria-atomic="false"
            onScroll={() => {
              const el = messagesContainerRef.current;
              if (!el) return;
              isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
            }}
          >
            {messages.length === 0 ? (
              <div className="chat-empty">
                {/* Animated hero */}
                <section className="hero-section" aria-label="Live federal grant intelligence for Buffalo Grove, IL">
                  <div className="hero-top-row">
                    <div className="hero-live-badge" aria-hidden="true">
                      <span className="hero-live-dot" />
                      Live Grant Intelligence
                    </div>
                    {/* Backend status pill — elevated next to live badge */}
                    {backendStatus !== "ready" || !workIqLoaded ? (
                      <div
                        className={`hero-status-pill hero-status-pill--${backendStatus === "unreachable" ? "unreachable" : "checking"}`}
                        role="status"
                        aria-live="polite"
                      >
                        {backendStatus === "unreachable" ? (
                          <><span>⚠️</span><span>Backend unreachable — refresh</span></>
                        ) : backendStatus === "ready" && !workIqLoaded ? (
                          <><span className="hero-coldstart-spinner" aria-hidden="true" /><span>Loading Work IQ…</span></>
                        ) : (
                          <><span className="hero-coldstart-spinner" aria-hidden="true" /><span>Waking backend…</span></>
                        )}
                      </div>
                    ) : (
                      <div className="hero-status-pill hero-status-pill--ready" role="status" aria-live="polite">
                        <span>✓</span><span>Ready</span>
                      </div>
                    )}
                  </div>
                  <div className="hero-pipeline">
                    <h1 className="hero-pipeline-amount" aria-label={`${formatHeroAmount(heroAmt)} in live federal grant funding`}>{formatHeroAmount(heroAmt)}</h1>
                    <p className="hero-pipeline-sub">
                      in live federal grant funding open right now, across {heroProgramCount} program{heroProgramCount === 1 ? "" : "s"} your projects qualify for
                    </p>
                  </div>
                  <div className="hero-grant-cards">
                    {heroGrants === null ? (
                      Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="hero-grant-card hero-grant-card--skeleton">
                          <div className="hero-skeleton-line hero-skeleton-line--title" />
                          <div className="hero-skeleton-line hero-skeleton-line--sub" />
                          <div className="hero-skeleton-bar" />
                          <div className="hero-skeleton-line hero-skeleton-line--meta" />
                        </div>
                      ))
                    ) : heroGrants.map((g) => (
                      <button key={g.name} className="hero-grant-card" onClick={() => handleSend(g.prompt)}
                        aria-label={`Analyze ${g.name} by ${g.agency}: ${g.match}% ${g.live ? "relevance" : "match"}, ${g.funding ?? "funding varies"}${g.daysLeft !== null ? `, ${g.daysLeft} days to deadline` : ""}`}>
                        {g.live && (
                          <div className="hero-grant-live" aria-hidden="true">
                            <span className="hero-grant-live-dot" />LIVE · Grants.gov
                          </div>
                        )}
                        <div className="hero-grant-name">{g.name}</div>
                        <div className="hero-grant-agency">{g.agency}</div>
                        <div className="hero-grant-bar-outer" role="presentation" aria-hidden="true">
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
                            aria-label={`Verify ${g.name} on Grants.gov (opens in new tab)`}
                            onClick={(e) => { e.stopPropagation(); window.open(g.url!, "_blank", "noopener,noreferrer"); }}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); window.open(g.url!, "_blank", "noopener,noreferrer"); } }}
                          >
                            Verify on Grants.gov ↗
                          </span>
                        )}
                      </button>
                    ))}
                    {/* Full CIP scan card — triggers inline portfolio scanner */}
                    <button className="hero-grant-card hero-grant-card--scan" onClick={() => handleTriggerScanSetup()}
                      aria-label={`Run full Capital Improvement Plan scan — ${formatHeroAmount(heroTotal)} total opportunity across multiple federal agencies`}>
                      <div className="hero-grant-scan-badge" aria-hidden="true">
                        <span className="hero-grant-live-dot" />SCAN MY CITY
                      </div>
                      <div className="hero-grant-name">{FULL_CIP_CARD.name}</div>
                      <div className="hero-grant-agency">{FULL_CIP_CARD.agency}</div>
                      <div className="hero-grant-meta hero-grant-meta--scan">
                        <span>5 parallel agents</span>
                        <span>{formatHeroAmount(heroTotal)}</span>
                      </div>
                      <div className="hero-grant-scan-sub">Surface every matching grant in ~60s</div>
                    </button>
                  </div>
                  <div className="hero-trust-strip" aria-label="System trust indicators">
                    <span className="hero-trust-item"><IconSparkle size={13} aria-hidden="true" /> 5 specialist agents</span>
                    <span className="hero-trust-dot" aria-hidden="true" />
                    <span className="hero-trust-item"><IconBuilding size={13} aria-hidden="true" /> Work IQ: meetings, emails, Teams, SharePoint</span>
                    <span className="hero-trust-dot" aria-hidden="true" />
                    <span className="hero-trust-item"><IconSearch size={13} aria-hidden="true" /> Grounded in Foundry IQ</span>
                    <span className="hero-trust-dot" aria-hidden="true" />
                    <span className="hero-trust-item"><IconSearch size={13} aria-hidden="true" /> Grounded in Fabric IQ</span>
                    <span className="hero-trust-dot" aria-hidden="true" />
                    <span className="hero-trust-item"><IconCheck size={13} aria-hidden="true" /> Every claim cited to source</span>
                    <span className="hero-trust-dot" aria-hidden="true" />
                    <span className="hero-trust-item"><IconScales size={13} aria-hidden="true" /> Self-critique loop</span>
                  </div>
                </section>
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

                        {/* ── Process Pill — collapses all agent trace into expandable summary ── */}
                        <ProcessPill
                          streaming={msg.streaming}
                          statusLog={msg.statusLog}
                          reasoningSteps={msg.reasoningSteps}
                          decisions={msg.decisions}
                          redTeamReview={msg.redTeamReview}
                          competitorIntel={msg.competitorIntel}
                          refinedNarrative={msg.refinedNarrative}
                          reviewStreaming={msg.reviewStreaming}
                          competitorStreaming={msg.competitorStreaming}
                          refinementStreaming={msg.refinementStreaming}
                          agentHandoffs={msg.agentHandoffs}
                          tierInfo={msg.tierInfo}
                          toolCalls={msg.toolCalls}
                          guardrailsSummary={msg.guardrailsSummary}
                          startedAt={msg.startedAt}
                          completedAt={msg.completedAt}
                          processContent={
                            (msg.reasoningSteps?.length ?? 0) > 0
                              ? <ThoughtProcess steps={msg.reasoningSteps!} isStreaming={msg.streaming ?? false} forceOpen />
                              : undefined
                          }
                        />

                        {/* GraphRAG paths: accessible via References sidebar */}

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
                            onViewAdmin={(grant) => {
                              onSwitchToAdmin?.(grant.grantId);
                            }}
                          />
                        )}

                        {/* ── Inline Scan Setup Card (Phase 1 — form before scan runs) ── */}
                        {msg.isScanSetup && (
                          <InlineScanSetupCard
                            disabled={msg.scanSetupConfirmed}
                            onConfirm={(profile) => {
                              setMessages((prev) =>
                                prev.map((m) => m.id === msg.id ? { ...m, scanSetupConfirmed: true } : m)
                              );
                              void handleRunScan(profile, msg.id);
                            }}
                          />
                        )}

                        {/* ── City Portfolio Scan widget (Phase 2 — streaming results) ── */}
                        {msg.widget?.type === "city_scan" && (
                          <CityProfileScanWidget
                            data={msg.widget.data as CityProfileScanData}
                            onAnalyze={(grant) =>
                              handleSend(
                                `Deep dive: Analyze ${grant.name} for ${(msg.widget!.data as CityProfileScanData).cityName} — full eligibility assessment, gap analysis, and winning strategy with citations`
                              )
                            }
                          />
                        )}

                        {/* Follow-up chips after city scan */}
                        {msg.widget?.type === "city_scan" && !msg.streaming && (msg.widget.data as CityProfileScanData).done && (
                          <div className="followup-chips">
                            <span className="followup-chips-label">Explore your portfolio</span>
                            {(msg.widget.data as CityProfileScanData).grants[0] && (
                              <button
                                className="followup-chip"
                                onClick={() => {
                                  const top = (msg.widget!.data as CityProfileScanData).grants[0];
                                  const city = (msg.widget!.data as CityProfileScanData).cityName;
                                  handleSend(`Deep dive: Analyze ${top.name} for ${city} — full eligibility, gaps, and winning narrative`);
                                }}
                              >
                                Deep dive: #{1} Grant →
                              </button>
                            )}
                            <button className="followup-chip" onClick={() => handleSend("Which 3 grants in this portfolio have the best win odds AND can be stacked together for maximum funding?")}>
                              Best stacking combo
                            </button>
                            <button className="followup-chip" onClick={() => handleSend("Build a 90-day application action plan for the top 3 grants in this portfolio — include responsible departments and milestones")}>
                              90-day action plan
                            </button>
                            <button className="followup-chip" onClick={() => handleSend("Which grants in this portfolio have deadlines in the next 60 days? Prioritize by match score.")}>
                              Upcoming deadlines
                            </button>
                          </div>
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

                        {/* ── Grant Detail Card — structured view for single_grant_detail queries */}
                        {msg.widget?.type === "grant_detail" && !msg.streaming && (
                          <GrantDetailCard data={msg.widget.data} />
                        )}

                        {/* Any text-only response (no widget, OR widget has no inline renderer) */}
                        {/* grant_detail uses GrantDetailCard above so exclude it here when not streaming */}
                        {/* grant_match uses GrantMatchWidget above which already shows full narrative */}
                        {msg.content && (!msg.widget || (msg.widget.type === "grant_detail" && msg.streaming) || msg.widget.type === "portfolio_health" || msg.widget.type === "compliance_board") && (
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

            {/* Attachment picker popover — floats above the input wrapper */}
            {showAttachPicker && (() => {
              type PickerTab = "all" | "sharepoint" | "meetings" | "emails" | "teams" | "foundry-iq" | "fabric-iq";
              const spItems = (spDocs.length > 0 ? spDocs : LOCAL_WORK_IQ_DOCS);
              const calItems = m365Signals.filter((d) => d.kind === "calendar");
              const mailItems = m365Signals.filter((d) => d.kind === "email");
              const teamsItems = m365Signals.filter((d) => d.kind === "teams");

              const TABS: { id: PickerTab; label: string; count?: number }[] = [
                { id: "all", label: "All" },
                { id: "sharepoint", label: "SharePoint", count: spItems.length },
                { id: "meetings", label: "Meetings", count: calItems.length },
                { id: "emails", label: "Emails", count: mailItems.length },
                ...(teamsItems.length > 0 ? [{ id: "teams" as PickerTab, label: "Teams", count: teamsItems.length }] : []),
                { id: "foundry-iq", label: "Foundry IQ", count: FOUNDRY_IQ_DOCS.length },
                { id: "fabric-iq", label: "Fabric IQ", count: FABRIC_IQ_DOCS.length },
              ];

              const q = attachSearch.toLowerCase();
              const filt = (items: AttachDoc[]) =>
                !q ? items : items.filter((d) => d.label.toLowerCase().includes(q) || d.desc.toLowerCase().includes(q));

              const renderItem = (doc: AttachDoc) => {
                const isSelected = attachedDocs.some((d) => d.id === doc.id);
                const ItemIcon = doc.kind === "calendar" ? IconClock
                  : doc.kind === "email" ? IconFileText
                  : doc.kind === "teams" ? IconChat
                  : doc.source === "foundry-iq" ? IconDatabase
                  : doc.source === "fabric-iq" ? IconFabricIQ
                  : IconFileText;
                return (
                  <button
                    key={doc.id}
                    className={`attach-picker-item${isSelected ? " attach-picker-item--selected" : ""}`}
                    onClick={() => toggleAttachment(doc)}
                  >
                    <span className="picker-item-icon">
                      <ItemIcon size={15} />
                    </span>
                    <span className="picker-item-body">
                      <span className="picker-item-label">{doc.label}</span>
                      <span className="picker-item-desc">{doc.desc}</span>
                    </span>
                    {isSelected && <span className="picker-item-check"><IconCheck size={13} /></span>}
                  </button>
                );
              };

              const renderSection = (label: string, items: AttachDoc[], groupClass?: string) =>
                items.length > 0 ? (
                  <>
                    <div className={`picker-group-label${groupClass ? ` ${groupClass}` : ""}`}>{label}</div>
                    {items.map(renderItem)}
                  </>
                ) : null;

              let listContent: React.ReactNode;
              if (attachPickerTab === "sharepoint") {
                listContent = filt(spItems).map(renderItem);
              } else if (attachPickerTab === "meetings") {
                listContent = filt(calItems).length > 0
                  ? filt(calItems).map(renderItem)
                  : <div className="picker-empty">No upcoming grant-related meetings found</div>;
              } else if (attachPickerTab === "emails") {
                listContent = filt(mailItems).length > 0
                  ? filt(mailItems).map(renderItem)
                  : <div className="picker-empty">No grant-related emails found</div>;
              } else if (attachPickerTab === "teams") {
                listContent = filt(teamsItems).length > 0
                  ? filt(teamsItems).map(renderItem)
                  : <div className="picker-empty">No Teams messages found</div>;
              } else if (attachPickerTab === "foundry-iq") {
                listContent = filt(FOUNDRY_IQ_DOCS).map(renderItem);
              } else if (attachPickerTab === "fabric-iq") {
                listContent = filt(FABRIC_IQ_DOCS).map(renderItem);
              } else {
                // "all" — grouped
                listContent = (<>
                  {renderSection("SharePoint", filt(spItems))}
                  {renderSection("Meetings", filt(calItems), "picker-group-label--meetings")}
                  {renderSection("Emails", filt(mailItems), "picker-group-label--emails")}
                  {teamsItems.length > 0 && renderSection("Teams", filt(teamsItems), "picker-group-label--teams")}
                  {renderSection("Foundry IQ", filt(FOUNDRY_IQ_DOCS), "picker-group-label--foundry")}
                  {renderSection("Fabric IQ", filt(FABRIC_IQ_DOCS), "picker-group-label--fabric")}
                </>);
              }

              return (
                <div className="attach-picker-popover" ref={pickerRef}>
                  <div className="attach-picker-search-row">
                    <span className="attach-picker-search-icon">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                      </svg>
                    </span>
                    <input
                      className="attach-picker-search"
                      placeholder="Search…"
                      value={attachSearch}
                      onChange={(e) => setAttachSearch(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="attach-picker-tabs-row">
                    {TABS.map((t) => (
                      <button
                        key={t.id}
                        className={`attach-picker-tab${attachPickerTab === t.id ? " attach-picker-tab--active" : ""}`}
                        onClick={() => setAttachPickerTab(t.id)}
                      >
                        {t.label}
                        {t.count !== undefined && t.count > 0 && (
                          <span className="attach-picker-tab-count">{t.count}</span>
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="attach-picker-list">
                    {listContent}
                  </div>
                </div>
              );
            })()}

            <div className="input-wrapper">
              <div className={`city-context-indicator${usingDefaultCityContext ? " city-context-indicator--default" : ""}`}>
                <span className="city-context-label">
                  {usingDefaultCityContext ? "Using default city:" : "City context:"}
                </span>
                <strong className="city-context-value">{activeCityContext}</strong>
                <button
                  className="city-context-change-btn"
                  onClick={() => handleTriggerScanSetup()}
                  type="button"
                  aria-label="Change city context with Scan My City"
                >
                  Change city
                </button>
              </div>

              {attachedDocs.length > 0 && (
                <div className="attached-docs-bar">
                  {attachedDocs.map((d) => (
                    <span
                      key={d.id}
                      className={`attached-doc-pill${d.source === "foundry-iq" ? " attached-doc-pill--foundry" : ""}${d.kind && d.kind !== "doc" ? " attached-doc-pill--signal" : ""}`}
                    >
                      {d.kind === "calendar" ? <span className="pill-emoji">📅</span>
                        : d.kind === "email" ? <span className="pill-emoji">✉️</span>
                        : d.kind === "teams" ? <span className="pill-emoji">💬</span>
                        : <span className="pill-dot" />}
                      <span className="pill-label">{d.label}</span>
                      <button className="pill-remove" onClick={() => removeAttachment(d.id)} aria-label={`Remove ${d.label}`}>×</button>
                    </span>
                  ))}
                </div>
              )}
              <div className="input-row">
                <textarea
                  ref={inputRef}
                  id="chat-input"
                  className="chat-input"
                  value={input}
                  onChange={(e) => { setInput(e.target.value); if (!e.target.value.trim()) setFetchedUrl(null); }}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about a grant, or ask to use meetings/emails/Teams + Foundry docs to prioritize your next applications"
                  aria-label="Grant analysis prompt. Press Enter to send, Shift+Enter for newline."
                  rows={1}
                  disabled={isLoading}
                />
                <div className="input-actions">
                  <button
                    className="send-btn"
                    onClick={() => handleSend()}
                    disabled={isLoading || !input.trim()}
                    aria-label={isLoading ? "Sending…" : "Send message"}
                  >
                    {isLoading ? <span className="send-spinner" aria-hidden="true" /> : <span aria-hidden="true">&#x2191;</span>}
                  </button>
                </div>
              </div>
              <div className="input-toolbar">
                <button
                  ref={attachBtnRef}
                  className={`attach-btn${showAttachPicker ? " attach-btn--active" : ""}`}
                  onClick={() => { setShowAttachPicker((prev) => !prev); setAttachSearch(""); }}
                  title="Attach documents as context"
                  aria-label="Attach documents as context"
                  aria-expanded={showAttachPicker}
                  aria-haspopup="listbox"
                >
                  <IconPaperclip size={13} />
                  <span>Attach</span>
                </button>
                {(() => {
                  const wiqCount = attachedDocs.filter((d) => d.source === "work-iq").length;
                  const fiqCount = attachedDocs.filter((d) => d.source === "foundry-iq").length;
                  const fabCount = attachedDocs.filter((d) => d.source === "fabric-iq").length;
                  return (<>
                <button
                  className={`source-chip source-chip--work-iq${wiqCount > 0 ? " source-chip--on" : ""}`}
                  aria-label="Attach Work IQ files from SharePoint"
                  onClick={() => { setAttachPickerTab("all"); setShowAttachPicker(true); setAttachSearch(""); }}
                >
                  <IconBolt size={11} />
                  Work IQ Signals{wiqCount > 0 && <span className="source-chip-count">{wiqCount}</span>}
                </button>
                <button
                  className={`source-chip source-chip--foundry${fiqCount > 0 ? " source-chip--on" : ""}`}
                  aria-label="Attach Foundry IQ knowledge base documents"
                  onClick={() => { setAttachPickerTab("foundry-iq"); setShowAttachPicker(true); setAttachSearch(""); }}
                >
                  <IconDatabase size={11} />
                  Foundry IQ{fiqCount > 0 && <span className="source-chip-count">{fiqCount}</span>}
                </button>
                <button
                  className={`source-chip source-chip--fabric${fabCount > 0 ? " source-chip--on" : ""}`}
                  aria-label="Attach Fabric IQ semantic models and ontology context"
                  onClick={async () => {
                    setAttachPickerTab("fabric-iq");
                    setShowAttachPicker(true);
                    setAttachSearch("");
                    if (!fabricContext && !fabricLoading) {
                      setFabricLoading(true);
                      try {
                        const ctx = await fetchFabricContext();
                        setFabricContext(ctx);
                      } catch { /* fallback to static docs */ }
                      finally { setFabricLoading(false); }
                    }
                  }}
                >
                  <IconFabricIQ size={11} />
                  {fabricLoading ? "Loading…" : fabricContext?.source === "fabric-live" ? "Fabric IQ ●" : "Fabric IQ"}{fabCount > 0 && <span className="source-chip-count">{fabCount}</span>}
                </button>
                  </>);
                })()}
              </div>
            </div>
            <div className="input-hint">
              Work IQ context + Foundry IQ grounding · Sources cited · Paste any grant URL to auto-fetch · Press Enter to send
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
        inputs={wsInputs}
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
        tierInfo={wsTierInfo}
        isVisible={isWorkspaceVisible}
        onToggleVisibility={() => setIsWorkspaceVisible((prev) => !prev)}
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

