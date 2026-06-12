import { useState, useEffect, useRef } from "react";
import type { JSX } from "react";
import type { AdminGrant, AdminMilestone, AdminComplianceItem, AdminPortfolioStats, AdminChatMessage, AdminWidgetData } from "../types";
import { fetchAdminPortfolio, streamAdminChat, streamGenerateReport } from "../api";
import type { ReportType } from "../api";
import "./GrantAdminDashboard.css";

// ─── Status badge helpers ────────────────────────────────────────────────────
function milestoneIcon(status: AdminGrant["milestones"][number]["status"]): string {
  if (status === "complete") return "✓";
  if (status === "in-progress") return "◉";
  if (status === "at-risk") return "⚠";
  return "○";
}

function complianceDot(status: AdminGrant["compliance"][number]["status"]): string {
  if (status === "complete" || status === "current") return "compliance-dot green";
  if (status === "due-soon") return "compliance-dot yellow";
  if (status === "overdue") return "compliance-dot red";
  return "compliance-dot grey";
}

function statusLabel(status: AdminGrant["status"]): string {
  if (status === "active") return "Active";
  if (status === "applied") return "Applied";
  if (status === "closed") return "Closed";
  if (status === "declined") return "Declined";
  return "Closeout";
}

// Grants in an execution/post-award phase show the budget chips + tabbed detail.
function isExecutingStatus(status: AdminGrant["status"]): boolean {
  return status === "active" || status === "closeout" || status === "closed";
}

function fmt$(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
}

function daysUntil(iso: string): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / 86_400_000);
}

// ─── Starter prompts per grant status ───────────────────────────────────────
const ACTIVE_PROMPTS = [
  "What's the current budget status and how much remains?",
  "Which compliance tasks are coming due in the next 30 days?",
  "Draft the Q2 2026 quarterly progress report.",
  "What is the current risk profile for this grant?",
  "Summarize milestone progress to date.",
];

const APPLIED_PROMPTS = [
  "What's the expected award timeline for this grant?",
  "What should we do to prepare if we receive the award?",
  "Are there any follow-up actions needed with the agency?",
];

const PORTFOLIO_PROMPTS = [
  "Summarize the full portfolio status.",
  "Which grants have upcoming compliance deadlines?",
  "How much total funding is disbursed vs. remaining?",
  "What are the highest-risk items across all active grants?",
];

// ─── Inline Admin Widget ─────────────────────────────────────────────────────
function AdminWidget({ data }: { data: AdminWidgetData }): JSX.Element {
  const pct = Math.min(100, Math.max(0, data.pctDisbursed));
  const days = daysUntil(data.nextDeadline?.date ?? "");
  const urgencyClass =
    data.nextDeadline?.urgency === "critical"
      ? "urgent-red"
      : data.nextDeadline?.urgency === "warning"
      ? "urgent-yellow"
      : "urgent-green";

  return (
    <div className="admin-widget-card">
      <div className="admin-widget-title">{data.grantName}</div>
      <div className="admin-widget-stats">
        <div className="admin-widget-stat">
          <span className="aw-label">Disbursed</span>
          <span className="aw-value">{fmt$(data.disbursedAmount)}</span>
        </div>
        <div className="admin-widget-stat">
          <span className="aw-label">Remaining</span>
          <span className="aw-value">{fmt$(data.remainingAmount)}</span>
        </div>
        <div className="admin-widget-stat">
          <span className="aw-label">Progress</span>
          <span className="aw-value">{pct}%</span>
        </div>
      </div>
      <div className="aw-progress-bar">
        <div className="aw-progress-fill" style={{ width: `${pct}%` }} />
      </div>
      {data.nextDeadline && (
        <div className={`aw-deadline ${urgencyClass}`}>
          Next: <strong>{data.nextDeadline.label}</strong>
          {days !== null && <span> — {days <= 0 ? "OVERDUE" : `${days}d`}</span>}
        </div>
      )}
      {data.complianceAlerts?.length > 0 && (
        <ul className="aw-alerts">
          {data.complianceAlerts.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Chat Panel ───────────────────────────────────────────────────────────────
function AdminChatPanel({
  grant,
  onClose,
}: {
  grant: AdminGrant | null;
  onClose: () => void;
}): JSX.Element {
  const [messages, setMessages] = useState<AdminChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamText, setStreamText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const prompts = grant
    ? grant.status === "active"
      ? ACTIVE_PROMPTS
      : APPLIED_PROMPTS
    : PORTFOLIO_PROMPTS;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamText]);

  async function handleSend(msg: string): Promise<void> {
    if (!msg.trim() || isLoading) return;
    const userMsg: AdminChatMessage = {
      role: "user",
      content: msg.trim(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);
    setStreamText("");

    const history = messages.map((m) => ({ role: m.role, content: m.content }));

    let fullAnswer = "";
    let widgetData: AdminWidgetData | undefined;

    try {
      await streamAdminChat(msg.trim(), grant?.id, history, {
        onAnswerChunk: (chunk) => {
          fullAnswer += chunk;
          // Strip widget block from live display
          setStreamText(fullAnswer.replace(/```widget[\s\S]*?```/g, "").trim());
        },
        onWidget: (w) => {
          widgetData = w.data;
        },
        onDone: () => {
          const assistantMsg: AdminChatMessage = {
            role: "assistant",
            content: fullAnswer.replace(/```widget[\s\S]*?```/g, "").trim(),
            timestamp: new Date(),
            widget: widgetData,
          };
          setMessages((prev) => [...prev, assistantMsg]);
          setStreamText("");
          setIsLoading(false);
        },
        onError: (err) => {
          const errMsg: AdminChatMessage = {
            role: "assistant",
            content: `Error: ${err}`,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, errMsg]);
          setStreamText("");
          setIsLoading(false);
        },
      });
    } catch (err) {
      const errMsg: AdminChatMessage = {
        role: "assistant",
        content: `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errMsg]);
      setStreamText("");
      setIsLoading(false);
    }
  }

  return (
    <div className="admin-chat-panel">
      <div className="admin-chat-header">
        <div>
          <div className="admin-chat-title">
            {grant ? grant.name : "Portfolio-Wide Assistant"}
          </div>
          <div className="admin-chat-subtitle">
            {grant ? grant.agency : "All active grants — Buffalo Grove, IL"}
          </div>
        </div>
        <button className="admin-chat-close" onClick={onClose}>✕</button>
      </div>

      <div className="admin-chat-body">
        {messages.length === 0 && (
          <div className="admin-starter-prompts">
            <p className="admin-starter-label">Ask the grant agent anything:</p>
            {prompts.map((p, i) => (
              <button
                key={i}
                className="admin-starter-btn"
                onClick={() => void handleSend(p)}
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`admin-msg admin-msg-${m.role}`}>
            {m.role === "assistant" && (
              <div className="admin-msg-label">CivicGrant IQ</div>
            )}
            <div className="admin-msg-content">{m.content}</div>
            {m.widget && <AdminWidget data={m.widget} />}
          </div>
        ))}

        {isLoading && streamText && (
          <div className="admin-msg admin-msg-assistant">
            <div className="admin-msg-label">CivicGrant IQ</div>
            <div className="admin-msg-content">{streamText}</div>
          </div>
        )}
        {isLoading && !streamText && (
          <div className="admin-msg admin-msg-assistant">
            <div className="admin-typing">
              <span /><span /><span />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="admin-chat-input-row">
        <input
          className="admin-chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(input); } }}
          placeholder="Ask about deadlines, budgets, reports…"
          disabled={isLoading}
        />
        <button
          className="admin-chat-send"
          onClick={() => void handleSend(input)}
          disabled={isLoading || !input.trim()}
        >
          {isLoading ? "…" : "→"}
        </button>
      </div>
    </div>
  );
}

// ─── Proactive Insights Bar (client-side computed, zero latency) ─────────────
interface Insight {
  level: "critical" | "warning" | "info";
  label: string;
  action?: string;
  onAction?: () => void;
}

function computeInsights(grant: AdminGrant, onGenerateReport: (t: ReportType) => void): Insight[] {
  const insights: Insight[] = [];
  const now = Date.now();

  // Compliance — overdue first, then due-soon
  for (const c of grant.compliance) {
    if (c.status === "overdue") {
      insights.push({ level: "critical", label: `${c.title} is OVERDUE${c.dueDate ? ` (was due ${c.dueDate})` : ""}` });
    }
    if (c.status === "due-soon" && c.dueDate) {
      const days = Math.ceil((new Date(c.dueDate).getTime() - now) / 86_400_000);
      const tag = c.title.toLowerCase().includes("sf-425") ? "sf425"
        : c.title.toLowerCase().includes("quarterly") ? "quarterly"
        : null;
      insights.push({
        level: "warning",
        label: `${c.title} due in ${days} day${days !== 1 ? "s" : ""} (${c.dueDate})`,
        action: tag ? `Generate ${tag === "sf425" ? "SF-425" : "Q2 Report"}` : undefined,
        onAction: tag ? () => onGenerateReport(tag as ReportType) : undefined,
      });
    }
  }

  // Milestones at-risk
  for (const m of grant.milestones) {
    if (m.status === "at-risk") {
      insights.push({ level: "critical", label: `Milestone at risk: ${m.title} (due ${m.dueDate})` });
    }
  }

  // Disbursement request opportunity — phase in-progress but no pending disbursement
  const inProgressMilestone = grant.milestones.find((m) => m.status === "in-progress");
  const hasPendingDisbursement = grant.disbursements.some((d) => d.status === "pending");
  if (inProgressMilestone && !hasPendingDisbursement) {
    const paid = grant.disbursements.filter((d) => d.status === "paid").reduce((s, d) => s + d.amount, 0);
    const pct = grant.awardAmount > 0 ? Math.round((paid / grant.awardAmount) * 100) : 0;
    if (pct < 60) {
      insights.push({
        level: "info",
        label: `Reimbursement opportunity: ${inProgressMilestone.title} is ${inProgressMilestone.progress ?? 0}% complete — initiate drawdown request`,
      });
    }
  }

  // Grant period expiry check
  if (grant.endDate) {
    const daysLeft = Math.ceil((new Date(grant.endDate).getTime() - now) / 86_400_000);
    if (daysLeft < 180) {
      insights.push({ level: daysLeft < 60 ? "critical" : "warning", label: `Grant period ends in ${daysLeft} days (${grant.endDate}) — ensure all work is complete` });
    }
  }

  return insights.slice(0, 4); // cap at 4 insights
}

function InsightsBar({ grant, onGenerateReport }: { grant: AdminGrant; onGenerateReport: (t: ReportType) => void }): JSX.Element {
  const insights = computeInsights(grant, onGenerateReport);
  if (insights.length === 0) return <></>;
  const top = insights[0];
  return (
    <div className={`insights-strip insights-strip--${top.level}`}>
      <span className={`insight-dot ins-${top.level}`} />
      <span className="insights-strip-text">{top.label}</span>
      {top.action && top.onAction && (
        <button className="insight-action-btn" onClick={top.onAction}>{top.action} →</button>
      )}
      {insights.length > 1 && (
        <span className="insights-strip-more">+{insights.length - 1} more</span>
      )}
    </div>
  );
}

// ─── Report Generation Modal ──────────────────────────────────────────────────
function ReportModal({
  grantId,
  grantName,
  reportType,
  onClose,
}: {
  grantId: string;
  grantName: string;
  reportType: ReportType;
  onClose: () => void;
}): JSX.Element {
  const [status, setStatus] = useState("Initializing…");
  const [streamedHtml, setStreamedHtml] = useState("");
  const [finalHtml, setFinalHtml] = useState("");
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasStarted = useRef(false);

  const reportTitle = reportType === "quarterly" ? "Q2 2026 Quarterly Progress Report"
    : reportType === "sf425" ? "SF-425 Federal Financial Report"
    : "Final Closeout Report";

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    void streamGenerateReport(grantId, reportType, {
      onStatus: (msg) => setStatus(msg),
      onHtmlChunk: (chunk) => setStreamedHtml((prev) => prev + chunk),
      onHtmlDone: ({ html }) => { setFinalHtml(html); setIsDone(true); },
      onDone: () => setIsDone(true),
      onError: (msg) => setError(msg),
    });
  }, [grantId, reportType]);

  function handlePrint(): void {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(finalHtml);
    win.document.close();
    win.print();
  }

  return (
    <div className="report-modal-overlay">
      <div className="report-modal">
        <div className="report-modal-header">
          <div>
            <div className="report-modal-title">{reportTitle}</div>
            <div className="report-modal-subtitle">{grantName}</div>
          </div>
          <div className="report-modal-actions">
            {isDone && (
              <button className="report-print-btn" onClick={handlePrint}>
                Print / Export PDF
              </button>
            )}
            <button className="report-close-btn" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="report-modal-body">
          {error ? (
            <div className="report-error">{error}</div>
          ) : !isDone ? (
            <div className="report-generating">
              <div className="report-spinner" />
              <div className="report-status">{status}</div>
              {streamedHtml && (
                <div className="report-stream-preview">
                  <div className="report-stream-label">Agent is writing…</div>
                  <div className="report-stream-text">
                    {streamedHtml.replace(/<[^>]+>/g, " ").slice(-400)}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <iframe
              className="report-iframe"
              srcDoc={finalHtml}
              title={reportTitle}
              sandbox="allow-same-origin"
            />
          )}
        </div>

        {!isDone && !error && (
          <div className="report-modal-footer">
            <div className="report-progress-dots">
              <span /><span /><span />
            </div>
            <span className="report-progress-text">Agent is generating your report using live grant data…</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Grant Detail Panel ───────────────────────────────────────────────────────
function GrantDetail({
  grant,
  milestoneOverrides,
  complianceOverrides,
  onAsk,
  onMilestoneComplete,
  onComplianceMarkDone,
}: {
  grant: AdminGrant;
  milestoneOverrides: Record<string, Partial<AdminMilestone>>;
  complianceOverrides: Record<string, Partial<AdminComplianceItem>>;
  onAsk: () => void;
  onMilestoneComplete: (id: string) => void;
  onComplianceMarkDone: (id: string) => void;
}): JSX.Element {
  const [reportModal, setReportModal] = useState<ReportType | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "milestones" | "compliance">("overview");
  const [expandedDisbId, setExpandedDisbId] = useState<string | null>(null);

  const milestones = grant.milestones.map((m) => ({ ...m, ...(milestoneOverrides[m.id] ?? {}) }));
  const compliance = grant.compliance.map((c) => ({ ...c, ...(complianceOverrides[c.id] ?? {}) }));

  const paid = grant.disbursements.filter((d) => d.status === "paid").reduce((s, d) => s + d.amount, 0);
  const pendingDisb = grant.disbursements.filter((d) => d.status === "pending").reduce((s, d) => s + d.amount, 0);
  const pct = grant.awardAmount > 0 ? Math.round((paid / grant.awardAmount) * 100) : 0;
  const remaining = grant.awardAmount - paid;
  const alertCount = compliance.filter((c) => c.status === "overdue" || c.status === "due-soon").length;
  const inProgressCount = milestones.filter((m) => m.status === "in-progress").length;
  const completeCount = milestones.filter((m) => m.status === "complete").length;

  return (
    <div className="grant-detail">
      {/* ── Header ── */}
      <div className="grant-detail-header">
        <div className="gdh-left">
          <h2 className="grant-detail-name">{grant.name}</h2>
          <div className="grant-detail-meta">
            <span className={`grant-status-badge gst-${grant.status}`}>{statusLabel(grant.status)}</span>
            <span className="gdh-meta-text">{grant.agency} · {grant.program}</span>
          </div>
        </div>
        <div className="detail-header-actions">
          {grant.status === "active" && (
            <div className="generate-report-group">
              <button className="generate-report-btn" onClick={() => setReportModal("quarterly")}>Q2 Report</button>
              <button className="generate-report-btn generate-report-btn--secondary" onClick={() => setReportModal("sf425")}>SF-425</button>
            </div>
          )}
          <button className="ask-agent-btn" onClick={onAsk}>Ask Agent</button>
        </div>
      </div>

      {/* ── Proactive insights — single-line strip ── */}
      {grant.status === "active" && (
        <InsightsBar grant={{ ...grant, milestones, compliance }} onGenerateReport={(t) => setReportModal(t)} />
      )}

      {/* ── Budget summary chips ── */}
      {isExecutingStatus(grant.status) && (
        <div className="budget-chips">
          <div className="budget-chip bc-blue">
            <span className="bc-val">{fmt$(grant.awardAmount)}</span>
            <span className="bc-lbl">Total Award</span>
          </div>
          <div className="budget-chip bc-green">
            <span className="bc-val">{fmt$(paid)}</span>
            <span className="bc-lbl">Disbursed · {pct}%</span>
          </div>
          <div className="budget-chip bc-orange">
            <span className="bc-val">{fmt$(remaining)}</span>
            <span className="bc-lbl">Remaining</span>
          </div>
          {pendingDisb > 0 && (
            <div className="budget-chip bc-yellow">
              <span className="bc-val">{fmt$(pendingDisb)}</span>
              <span className="bc-lbl">Pending draw</span>
            </div>
          )}
          <div className="budget-chips-bar">
            <div className="budget-chips-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {/* ── Tabs (active / closeout / closed grants) ── */}
      {isExecutingStatus(grant.status) && (
        <>
          <div className="detail-tabs">
            <button
              className={`detail-tab-btn${activeTab === "overview" ? " dtb-active" : ""}`}
              onClick={() => setActiveTab("overview")}
            >
              Disbursements
            </button>
            <button
              className={`detail-tab-btn${activeTab === "milestones" ? " dtb-active" : ""}`}
              onClick={() => setActiveTab("milestones")}
            >
              Milestones
              <span className="tab-badge">
                {inProgressCount > 0 ? `${inProgressCount} active` : `${completeCount}/${milestones.length}`}
              </span>
            </button>
            <button
              className={`detail-tab-btn${activeTab === "compliance" ? " dtb-active" : ""}`}
              onClick={() => setActiveTab("compliance")}
            >
              Compliance
              {alertCount > 0 && <span className="tab-badge tab-badge--alert">{alertCount}</span>}
            </button>
          </div>

          {activeTab === "overview" && (
            <div className="tab-content">
              <div className="disbursement-list">
                {grant.disbursements.map((d) => {
                  const isOpen = expandedDisbId === d.id;
                  const hasDetail = !!(d.invoiceNumber || d.vendor || d.description || d.notes);
                  return (
                    <div key={d.id} className={`disbursement-row dis-${d.status}${isOpen ? " dis-open" : ""}`}>
                      <button
                        className="dis-summary"
                        onClick={() => setExpandedDisbId(isOpen ? null : d.id)}
                        aria-expanded={isOpen}
                      >
                        <div className="dis-dot" />
                        <div className="dis-info">
                          <span className="dis-label">{d.label}</span>
                          <span className="dis-phase">{d.phase}</span>
                        </div>
                        <div className="dis-right">
                          <span className="dis-amount">{fmt$(d.amount)}</span>
                          <span className="dis-date">{d.date}</span>
                          <span className={`dis-badge dis-b-${d.status}`}>{d.status}</span>
                          {hasDetail && (
                            <span className="dis-chevron">{isOpen ? "▲" : "▼"}</span>
                          )}
                        </div>
                      </button>
                      {isOpen && (
                        <div className="dis-detail">
                          {d.description && (
                            <div className="dis-detail-row">
                              <span className="dis-detail-label">Scope</span>
                              <span className="dis-detail-val">{d.description}</span>
                            </div>
                          )}
                          {d.vendor && (
                            <div className="dis-detail-row">
                              <span className="dis-detail-label">Payee / Vendor</span>
                              <span className="dis-detail-val">{d.vendor}</span>
                            </div>
                          )}
                          {d.invoiceNumber && (
                            <div className="dis-detail-row">
                              <span className="dis-detail-label">Drawdown Request #</span>
                              <span className="dis-detail-val dis-detail-mono">{d.invoiceNumber}</span>
                            </div>
                          )}
                          {d.checkNumber && (
                            <div className="dis-detail-row">
                              <span className="dis-detail-label">EFT / Check Ref</span>
                              <span className="dis-detail-val dis-detail-mono">{d.checkNumber}</span>
                            </div>
                          )}
                          {d.federalSharePct !== undefined && (
                            <div className="dis-detail-row">
                              <span className="dis-detail-label">Federal share</span>
                              <span className="dis-detail-val">{d.federalSharePct}% federal · {100 - d.federalSharePct}% city match</span>
                            </div>
                          )}
                          {d.notes && (
                            <div className="dis-detail-row dis-detail-note">
                              <span className="dis-detail-label">Notes</span>
                              <span className="dis-detail-val">{d.notes}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === "milestones" && (
            <div className="tab-content">
              <div className="milestone-list">
                {milestones.map((m) => (
                  <div key={m.id} className={`milestone-row ms-${m.status}`}>
                    <div className={`ms-icon ms-icon-${m.status}`}>{milestoneIcon(m.status)}</div>
                    <div className="ms-body">
                      <div className="ms-title">{m.title}</div>
                      <div className="ms-meta">
                        {m.completedDate ? `Completed ${m.completedDate}` : `Due ${m.dueDate}`}
                        &nbsp;·&nbsp; {m.owner}
                      </div>
                      {m.status === "in-progress" && m.progress !== undefined && (
                        <div className="ms-progress-bar">
                          <div className="ms-progress-fill" style={{ width: `${m.progress}%` }} />
                          <span className="ms-progress-label">{m.progress}% complete — in progress</span>
                        </div>
                      )}
                    </div>
                    {/* Mark Done only on upcoming — in-progress milestones have a live % and aren't done yet */}
                    {m.status === "upcoming" && (
                      <button
                        className="milestone-mark-btn"
                        title="Mark this milestone as complete"
                        onClick={() => onMilestoneComplete(m.id)}
                      >
                        Mark Done ✓
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "compliance" && (
            <div className="tab-content">
              <div className="compliance-list">
                {compliance.map((c) => (
                  <div key={c.id} className="compliance-row">
                    <div className={complianceDot(c.status)} />
                    <div className="cr-body">
                      <div className="cr-title">{c.title}</div>
                      {c.notes && <div className="cr-notes">{c.notes}</div>}
                    </div>
                    <div className="cr-right">
                      <div className={`cr-badge cr-${c.status}`}>{c.status.replace("-", " ")}</div>
                      {(c.status === "due-soon" || c.status === "overdue") && (
                        <button className="compliance-mark-btn" onClick={() => onComplianceMarkDone(c.id)}>
                          Mark Submitted
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Applied / declined grants: read-only milestone timeline ── */}
      {(grant.status === "applied" || grant.status === "declined") && (
        <div className="tab-content">
          <p className="grant-summary">{grant.summary}</p>
          <div className="milestone-list">
            {grant.milestones.map((m) => (
              <div key={m.id} className={`milestone-row ms-${m.status}`}>
                <div className={`ms-icon ms-icon-${m.status}`}>{milestoneIcon(m.status)}</div>
                <div className="ms-body">
                  <div className="ms-title">{m.title}</div>
                  <div className="ms-meta">
                    {m.completedDate ? `Completed ${m.completedDate}` : `Expected ${m.dueDate}`}
                    &nbsp;·&nbsp; {m.owner}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="applied-note">
            {grant.status === "declined"
              ? `Not selected${grant.declinedDate ? ` (${grant.declinedDate})` : ""}.${grant.keyRisk ? ` ${grant.keyRisk}` : ""}`
              : "Award announcement pending. No compliance requirements active yet."}
          </div>
        </div>
      )}

      {reportModal && (
        <ReportModal grantId={grant.id} grantName={grant.name} reportType={reportModal} onClose={() => setReportModal(null)} />
      )}
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export function GrantAdminDashboard(): JSX.Element {
  const [grants, setGrants] = useState<AdminGrant[]>([]);
  const [stats, setStats] = useState<AdminPortfolioStats | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [chatGrant, setChatGrant] = useState<AdminGrant | null | "portfolio">(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fabricLive, setFabricLive] = useState(false);
  const [fabricPulledAt, setFabricPulledAt] = useState<string | null>(null);

  // Agent-driven state overrides — milestone/compliance status updates
  const [milestoneOverrides, setMilestoneOverrides] = useState<Record<string, Partial<AdminGrant["milestones"][number]>>>({});
  const [complianceOverrides, setComplianceOverrides] = useState<Record<string, Partial<AdminGrant["compliance"][number]>>>({});

  function handleMilestoneComplete(id: string): void {
    setMilestoneOverrides((prev) => ({
      ...prev,
      [id]: { status: "complete", completedDate: new Date().toISOString().slice(0, 10) },
    }));
  }

  function handleComplianceMarkDone(id: string): void {
    setComplianceOverrides((prev) => ({
      ...prev,
      [id]: { status: "complete", lastCompletedDate: new Date().toISOString().slice(0, 10) },
    }));
  }

  useEffect(() => {
    fetchAdminPortfolio()
      .then(({ grants: g, stats: s, fabricLive: fl, fabricPulledAt: fp }) => {
        setGrants(g);
        setStats(s);
        if (fl) setFabricLive(true);
        if (fp) setFabricPulledAt(fp);
        if (g.length > 0) setSelectedId(g[0].id);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const selected = grants.find((g) => g.id === selectedId) ?? null;

  if (loading) {
    return (
      <div className="admin-loading">
        <div className="admin-spinner" />
        Loading grant portfolio…
      </div>
    );
  }

  if (error) {
    return <div className="admin-error">Failed to load portfolio: {error}</div>;
  }

  return (
    <div className="grant-admin-root">
      {/* ─── Sidebar ──────────────────────────────────── */}
      <aside className="admin-sidebar">
        <div className="admin-sidebar-header">
          <div className="admin-sidebar-title">Grant Portfolio</div>
          <div className="admin-sidebar-city">Buffalo Grove, IL</div>
          {fabricLive && (
            <div className="admin-fabric-badge" title={fabricPulledAt ? `Last synced: ${new Date(fabricPulledAt).toLocaleTimeString()}` : "Live from Fabric"}>
              <span className="fabric-dot" />Fabric IQ Live
            </div>
          )}
        </div>

        {stats && (
          <div className="portfolio-stats">
            <div className="ps-stat">
              <span className="ps-label">Awarded</span>
              <span className="ps-value blue">{fmt$(stats.totalAwarded)}</span>
            </div>
            <div className="ps-stat">
              <span className="ps-label">Applied</span>
              <span className="ps-value purple">{fmt$(stats.totalApplied)}</span>
            </div>
            <div className="ps-stat">
              <span className="ps-label">Disbursed</span>
              <span className="ps-value green">{fmt$(stats.totalDisbursed)}</span>
            </div>
            {stats.dueSoonTasks > 0 && (
              <div className="ps-alert">
                {stats.dueSoonTasks} compliance task{stats.dueSoonTasks > 1 ? "s" : ""} due soon
              </div>
            )}
          </div>
        )}

        <button
          className="portfolio-ask-btn"
          onClick={() => setChatGrant("portfolio")}
        >
          Ask About Entire Portfolio
        </button>

        <nav className="admin-grant-list">
          {grants.map((g) => {
            const paid = g.disbursements
              .filter((d) => d.status === "paid")
              .reduce((s, d) => s + d.amount, 0);
            const pct = g.awardAmount > 0 ? Math.round((paid / g.awardAmount) * 100) : 0;
            const hasAlert = g.compliance.some(
              (c) => c.status === "overdue" || c.status === "due-soon"
            );
            return (
              <button
                key={g.id}
                className={`admin-grant-item ${selectedId === g.id ? "selected" : ""}`}
                onClick={() => setSelectedId(g.id)}
              >
                <div className="agi-top">
                  <span className="agi-name">{g.name}</span>
                  {hasAlert && <span className="agi-alert-dot" title="Compliance alert" />}
                </div>
                <div className="agi-bottom">
                  <span className={`grant-status-badge gst-${g.status}`}>{statusLabel(g.status)}</span>
                  <span className="agi-amount">{fmt$(g.awardAmount)}</span>
                  {g.status === "active" && (
                    <span className="agi-pct">{pct}% disbursed</span>
                  )}
                </div>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* ─── Main content ─────────────────────────────── */}
      <main className="admin-main">
        {selected ? (
          <GrantDetail
            grant={selected}
            milestoneOverrides={milestoneOverrides}
            complianceOverrides={complianceOverrides}
            onAsk={() => setChatGrant(selected)}
            onMilestoneComplete={handleMilestoneComplete}
            onComplianceMarkDone={handleComplianceMarkDone}
          />
        ) : (
          <div className="admin-empty">Select a grant to view details.</div>
        )}
      </main>

      {/* ─── Chat overlay ─────────────────────────────── */}
      {chatGrant !== null && (
        <div className="admin-chat-overlay">
          <AdminChatPanel
            grant={chatGrant === "portfolio" ? null : chatGrant}
            onClose={() => setChatGrant(null)}
          />
        </div>
      )}
    </div>
  );
}
