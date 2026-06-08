import { useState, useRef, useEffect, useCallback } from "react";
import { streamChat, generatePackage, draftApplication, fetchGrantUrl, fetchMonitor, fetchHeroGrants } from "../api";
import type { FetchedUrl, MonitorData, HeroGrantResult } from "../api";
import type { ReasoningStep, Citation, RedTeamResult, CompetitorIntelResult, RefinedNarrativeResult } from "../types";
import { GrantMatchWidget } from "./GrantMatchWidget";
import type { GrantMatchData } from "./GrantMatchWidget";
import { GrantPipelineWidget } from "./GrantPipelineWidget";
import type { PipelineGrant } from "./GrantPipelineWidget";
import type { DrawerView } from "./AgentDrawer";
import { AgentDrawer } from "./AgentDrawer";
import { ReportPreviewModal } from "./ReportPreviewModal";
import type { ReportPayload } from "./ReportPreviewModal";
import { GrantRadarSkeleton } from "./GrantRadarSkeleton";
import {
  IconBuilding, IconChat, IconSearch, IconSettings, IconNewChat,
  IconCopy, IconCheck,
  IconChart, IconFilePdf, IconFileText, IconGlobe,
  IconLink, IconScales, IconTarget,
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
  redTeamReview?: RedTeamResult;
  competitorIntel?: CompetitorIntelResult;
  refinedNarrative?: RefinedNarrativeResult;
  reviewStreaming?: boolean;
  competitorStreaming?: boolean;
  refinementStreaming?: boolean;
  streaming?: boolean;
  statusLog?: string[];
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

const STEP_LABELS = [
  "Parse the Grant",
  "Match City Projects",
  "Verify Financial Capacity",
  "Gap Analysis",
  "Draft Project Narrative",
  "Application Strategy",
];

// ─── Simple markdown renderer ─────────────────────────────────────────────
function renderMarkdown(text: string) {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (/^(?:#{1,4}\s*|\*\*)?\s*Step\s+\d+\s*[\u2014\-]/i.test(trimmed)) {
      // Reasoning step heading — e.g. "Step 1 — Parse the Grant", "## Step 1 — …", "**Step 1 — …**"
      const clean = trimmed
        .replace(/^#{1,4}\s*/, "")
        .replace(/^\*\*|\*\*$/g, "")
        .trim();
      out.push(<p key={i} className="md-step-heading">{clean}</p>);
    } else if (line.startsWith("### ")) {
      out.push(<h4 key={i} className="md-h4">{line.slice(4)}</h4>);
    } else if (line.startsWith("## ")) {
      out.push(<h3 key={i} className="md-h3">{line.slice(3)}</h3>);
    } else if (line.startsWith("# ")) {
      out.push(<h2 key={i} className="md-h2">{line.slice(2)}</h2>);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      out.push(<li key={i} className="md-li">{renderInline(line.slice(2))}</li>);
    } else if (/^\d+\.\s/.test(line)) {
      out.push(<li key={i} className="md-li md-oli">{renderInline(line.replace(/^\d+\.\s/, ""))}</li>);
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

// ─── Answer peek — collapsible fixed-height scrollable window ───────────────
function AnswerPeek({ children, streaming }: { children: React.ReactNode; streaming: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="answer-peek-wrap">
      <button className="answer-peek-toggle" onClick={() => setOpen(o => !o)}>
        <span className="answer-peek-toggle-label">
          {streaming ? "Agent reasoning…" : "View agent reasoning"}
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

// ─── Thought Process — vertical timeline ────────────────────────────────────
function ThoughtProcess({ steps, isStreaming }: { steps: ReasoningStep[]; isStreaming: boolean }) {
  const [open, setOpen] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  // Auto-open when the agent starts producing steps
  useEffect(() => {
    if (isStreaming && steps.length > 0) setOpen(true);
  }, [isStreaming, steps.length]);

  if (!steps.length) return null;
  const completedCount = steps.filter(s => s.completed).length;
  const progress = Math.round((completedCount / 6) * 100);
  const allDone = !isStreaming && completedCount >= 6;

  const toggleStep = (stepNum: number) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(stepNum)) next.delete(stepNum); else next.add(stepNum);
      return next;
    });
  };

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
        <span className="thought-step-counter">{completedCount}/6</span>
        <span className="thought-chevron">{open ? "▲" : "▼"}</span>
      </button>

      {/* ── Step list — each completed step expands to show what it did ── */}
      {open && (
        <div className="tp-accordion">
          {STEP_LABELS.map((label, i) => {
            const stepNum = i + 1;
            const step = steps.find(s => s.step === stepNum);
            const done = step?.completed ?? false;
            // Keep the last completed step spinning while answer is still streaming
            const isLastCompleted = done && isStreaming && stepNum === completedCount;
            const active = isLastCompleted || (isStreaming && !done && completedCount === i);
            const state = (done && !isLastCompleted) ? "done" : active ? "active" : "pending";
            const isStepOpen = expandedSteps.has(stepNum);
            const hasContent = Boolean(step?.content);

            return (
              <div key={i} className={`tp-acc-item tp-acc-item--${state}`}>
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

interface WorkspacePanelProps {
  steps: ReasoningStep[];
  citations: Citation[];
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

function WorkspacePanel({ steps, citations, widget, analysisText, isLoading, hasMessages, redTeamReview, competitorIntel, refinement, reviewStreaming, competitorStreaming, refinementStreaming, onOpenPreview, onOpenDrawer }: WorkspacePanelProps) {
  const [planOpen, setPlanOpen] = useState(true);
  const [outputOpen, setOutputOpen] = useState(true);
  const [intelOpen, setIntelOpen] = useState(true);
  const [refsOpen, setRefsOpen] = useState(true);
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
              <span className="ws-badge ws-badge--count">{visibleSteps}/{STEP_LABELS.length}</span>
            )}
            <span className={`ws-chevron ${planOpen ? "ws-chevron--open" : ""}`}>›</span>
          </div>
        </button>
        {planOpen && (
          <div className="ws-section-body">
            {STEP_LABELS.map((label, i) => {
              const step = steps.find((s) => s.step === i + 1);
              const done = (step?.completed ?? false) && visibleSteps > i;
              const active = isLoading && (steps.length === i || (!done && steps.some(s => s.completed)));
              return (
                <div key={i} className={`ws-plan-item ws-plan-item--${done ? "done" : active ? "active" : "pending"}`}>
                  <span className="ws-plan-check">
                    {done ? "✓" : active ? <span className="ws-plan-spinner" /> : "○"}
                  </span>
                  <span className="ws-plan-label">{label}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Output */}
      <div className="ws-section">
        <button className="ws-section-header" onClick={() => setOutputOpen(!outputOpen)}>
          <span className="ws-section-name">Output</span>
          <div className="ws-section-meta">
            {(widget ? 1 : 0) > 0 && (
              <span className="ws-badge ws-badge--count">{widget ? 1 : 0}</span>
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
            {!widget && hasMessages && (
              <p className="ws-empty">No outputs yet</p>
            )}
          </div>
        )}
      </div>

      {/* Agent Intelligence — live score cards for secondary agents */}
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

              {/* Red Team Review card */}
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

export function ChatInterface({ onSwitchToScan }: { onSwitchToScan?: () => void }) {
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
  const [generatingPackage, setGeneratingPackage] = useState<string | null>(null);
  const [draftingApp, setDraftingApp] = useState<string | null>(null);
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
            prev.map((m) => m.id === assistantId ? { ...m, streaming: false, reviewStreaming: false, competitorStreaming: false, refinementStreaming: false } : m)
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
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank");
      if (!win) {
        // Fallback if popup blocked — download as HTML
        const a = document.createElement("a");
        a.href = url;
        a.download = `${grantName.replace(/[^a-z0-9 ]/gi, "_").replace(/\s+/g, "_")}_Package.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      setTimeout(() => URL.revokeObjectURL(url), 30000);
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
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, "_blank");
      if (!win) {
        const a = document.createElement("a");
        a.href = url;
        a.download = `${grantName.replace(/[^a-z0-9 ]/gi, "_").replace(/\s+/g, "_")}_Draft_Application.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (e) {
      console.error("Draft application failed:", e);
    } finally {
      setDraftingApp(null);
    }
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="chat-interface">
      {/* Icon-only left nav */}
      <nav className="cowork-leftnav">
        <div className="leftnav-logo"><IconBuilding size={20} color="#3b82f6" /></div>
        <button className="leftnav-icon leftnav-icon--active" title="Chat"><IconChat size={18} /></button>
        <button className="leftnav-icon" title="Scan" onClick={onSwitchToScan}><IconSearch size={18} /></button>
        <div className="leftnav-spacer" />
        <button className={`leftnav-icon${showSettings ? " leftnav-icon--active" : ""}`} title="Settings" onClick={() => setShowSettings(s => !s)}><IconSettings size={18} /></button>
      </nav>

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
        {/* Cowork-style header */}
        <header className="cowork-header">
          <div className="cowork-breadcrumb">
            <span className="cowork-app-name">CivicGrant IQ</span>
            {hasMessages && (
              <>
                <span className="cowork-breadcrumb-sep">›</span>
                <span className="cowork-thread-name">Grant Analysis</span>
              </>
            )}
          </div>
          <div className="cowork-header-actions">
            <button className="cowork-header-icon-btn" title="New chat" onClick={handleNewChat}>
              <IconNewChat size={16} />
            </button>
          </div>
        </header>

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
                    <div className="hero-pipeline-amount">${heroAmt.toFixed(1)}M+</div>
                    <div className="hero-pipeline-sub">in federal grants available for cities like yours this month</div>
                  </div>
                  <div className="hero-grant-cards">
                    {heroGrants.map((g) => (
                      <button key={g.name} className="hero-grant-card" onClick={() => handleSend(g.prompt)}>
                        <div className="hero-grant-name">{g.name}</div>
                        <div className="hero-grant-agency">{g.agency}</div>
                        <div className="hero-grant-bar-outer">
                          <div className="hero-grant-bar-inner" style={{ width: `${g.match}%` }} />
                        </div>
                        <div className="hero-grant-meta">
                          <span>{g.match}% match</span>
                          <span>{g.funding ?? "—"}</span>
                        </div>
                        {g.daysLeft !== null && (
                          <div className="hero-grant-urgency" style={{ color: g.daysLeft < 50 ? "#f59e0b" : "#475569" }}>
                            {g.daysLeft}d to deadline
                          </div>
                        )}
                      </button>
                    ))}
                    {/* Full CIP scan card — always uses computed total */}
                    <button className="hero-grant-card" onClick={() => handleSend(FULL_CIP_CARD.prompt)}>
                      <div className="hero-grant-name">{FULL_CIP_CARD.name}</div>
                      <div className="hero-grant-agency">{FULL_CIP_CARD.agency}</div>
                      <div className="hero-grant-meta hero-grant-meta--scan">
                        <span>Full CIP scan</span>
                        <span>${heroTotal.toFixed(1)}M+</span>
                      </div>
                    </button>
                  </div>
                  <p className="hero-desc">
                    Analyzes your eligibility in 6 steps, scores the match, closes gaps, and generates a complete application package — powered by Microsoft Azure Foundry.
                  </p>
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

                        {/* Thought process — auto-open when steps arrive, auto-collapse when done */}
                        {(msg.reasoningSteps?.length ?? 0) > 0 && (
                          <ThoughtProcess
                            steps={msg.reasoningSteps ?? []}
                            isStreaming={msg.streaming ?? false}
                          />
                        )}

                        {/* Inline Widget */}
                        {msg.widget?.type === "grant_match" && (
                          <GrantMatchWidget
                            data={msg.widget.data as import("./GrantMatchWidget").GrantMatchData}
                            isRefined={!!msg.refinedNarrative}
                            refinementImprovements={msg.refinedNarrative?.improvements}
                            refinementDelta={msg.refinedNarrative?.estimatedScoreDelta}
                          />
                        )}
                        {msg.widget?.type === "grant_pipeline" && (
                          <GrantPipelineWidget
                            grants={msg.widget.data.grants}
                            cityName={msg.widget.data.cityName}
                            totalOpportunity={msg.widget.data.totalOpportunity}
                          />
                        )}

                        {/* Quick Actions bar — appears after widget when done */}
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
                          </div>
                        )}

                        {/* Answer text — scrollable peek window while streaming and after; hidden once widget renders */}
                        {msg.content && !msg.widget && (
                          <AnswerPeek streaming={msg.streaming ?? false}>
                            {renderMarkdown(cleanAnswerText(msg.content))}
                            {msg.streaming && <span className="streaming-cursor" />}
                          </AnswerPeek>
                        )}
                        {/* If widget failed to parse but content exists, always show it */}
                        {msg.content && !msg.streaming && msg.widget && !msg.widget.type && (
                          <div className="assistant-text">
                            {renderMarkdown(cleanAnswerText(msg.content))}
                          </div>
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

