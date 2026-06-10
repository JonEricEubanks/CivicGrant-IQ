import { useState } from "react";
import type { GraphPath } from "../types";
import "./GraphPathsPanel.css";

interface Props {
  paths: GraphPath[];
  defaultOpen?: boolean;
}

const REL_LABELS: Record<string, string> = {
  qualifies_for: "Qualifies for",
  has_project:   "Has project",
  has_metric:    "Has metric",
  matches_focus: "Matches focus",
  closes_gap:    "Closes gap",
  requires:      "Requires",
  applied_for:   "Applied for",
  awarded:       "Awarded",
};

const CONF_META: Record<string, { dot: string; badge: string; bar: string }> = {
  CONFIRMED: { dot: "#22c55e", badge: "gpp-badge--confirmed", bar: "#16a34a" },
  LIKELY:    { dot: "#3b82f6", badge: "gpp-badge--likely",    bar: "#2563eb" },
  POSSIBLE:  { dot: "#f59e0b", badge: "gpp-badge--possible",  bar: "#d97706" },
};

function NodePill({ label, kind }: { label: string; kind: "city" | "project" | "grant" | "metric" }) {
  return (
    <span className={`gpp-node gpp-node--${kind}`}>
      <span className="gpp-node-pip" />
      {label}
    </span>
  );
}

function nodeKind(label: string, grantLabel: string): "city" | "project" | "grant" | "metric" {
  if (label === grantLabel || /grant|raise|nofo|fhwa|usdot|fema|epa|hud|cdbg|tiger|infra/i.test(label)) return "grant";
  if (/^\$|fund.?balance|unreserved|capital.?fund|\bmillion\b|\bbillion\b/i.test(label)) return "metric";
  if (/,\s*[A-Z]{2}$|\bgrove\b|\bvillage\b|\bcity of\b|\bcounty\b|\btownship\b|\bmunicip/i.test(label)) return "city";
  return "project";
}

export function GraphPathsPanel({ paths, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [expandedPath, setExpandedPath] = useState<string | null>(paths[0]?.grantId ?? null);
  const [expandedHops, setExpandedHops] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);

  if (paths.length === 0) return null;

  const toggleHop = (key: string) =>
    setExpandedHops(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });

  return (
    <div className={`gpp${defaultOpen ? " gpp--embedded" : ""}`}>
      {/* ── Collapsed toggle bar — hidden when embedded in popout ── */}
      {!defaultOpen && (
      <button className="gpp-toggle" onClick={() => setOpen(v => !v)} aria-expanded={open}>
        <span className="gpp-toggle-icon">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <circle cx="5" cy="12" r="3" /><circle cx="19" cy="5" r="3" /><circle cx="19" cy="19" r="3" />
            <line x1="8" y1="11" x2="16" y2="7" /><line x1="8" y1="13" x2="16" y2="17" />
          </svg>
        </span>
        <span className="gpp-toggle-label">
          GraphRAG — {paths.length} reasoning path{paths.length !== 1 ? "s" : ""} traversed
        </span>
        <span className="gpp-toggle-badges">
          {paths.map(p => {
            const sc = p.totalScore <= 1 ? Math.round(p.totalScore * 100) : Math.round(p.totalScore);
            const m = CONF_META[p.confidence] ?? CONF_META["POSSIBLE"];
            return <span key={p.grantId} className={`gpp-badge ${m.badge}`}>{sc}%</span>;
          })}
        </span>
        <span className={`gpp-chevron ${open ? "gpp-chevron--open" : ""}`}>›</span>
      </button>
      )}

      {/* ── Expanded body ── */}
      {(open || defaultOpen) && (
        <div className={`gpp-body${defaultOpen ? " gpp-body--embedded" : ""}`}>
          <p className="gpp-subtitle">
            How the AI connected your city's profile to this grant — click any hop to reveal supporting evidence.
          </p>

          {paths.map(path => {
            const scorePct = path.totalScore <= 1 ? Math.round(path.totalScore * 100) : Math.round(path.totalScore);
            const meta = CONF_META[path.confidence] ?? CONF_META["POSSIBLE"];
            const isOpen = expandedPath === path.grantId;
            const hopsToShow = showAll ? path.hops : path.hops.slice(0, 5);

            return (
              <div key={path.grantId} className="gpp-path">
                {/* Path header */}
                <button
                  className="gpp-path-header"
                  onClick={() => setExpandedPath(v => v === path.grantId ? null : path.grantId)}
                >
                  <span className="gpp-path-dot" style={{ background: meta.dot }} />
                  <span className={`gpp-badge ${meta.badge}`}>{path.confidence}</span>
                  <span className="gpp-path-name" title={path.grantLabel}>{path.grantLabel}</span>
                  <span className="gpp-path-score" style={{ color: meta.bar }}>{scorePct}%</span>
                  <span className="gpp-path-hops">{path.hops.length} hops</span>
                  <span className={`gpp-chevron ${isOpen ? "gpp-chevron--open" : ""}`}>›</span>
                </button>

                {/* Score bar — always visible under header */}
                <div className="gpp-path-bar-row">
                  <div className="gpp-path-bar-track">
                    <div className="gpp-path-bar-fill" style={{ width: `${scorePct}%`, background: meta.bar }} />
                  </div>
                </div>

                {/* Hop rows — expandable */}
                {isOpen && (
                  <div className="gpp-hops">
                    {hopsToShow.map((hop, i) => {
                      const hopKey = `${path.grantId}-${i}`;
                      const evidenceOpen = expandedHops.has(hopKey);
                      const fromKind = nodeKind(hop.fromLabel, path.grantLabel);
                      const toKind   = nodeKind(hop.toLabel,   path.grantLabel);
                      const relLabel = REL_LABELS[hop.rel] ?? hop.rel.replace(/_/g, " ");
                      return (
                        <div key={hopKey} className={`gpp-hop${evidenceOpen ? " gpp-hop--open" : ""}`}>
                          <button className="gpp-hop-row" onClick={() => toggleHop(hopKey)}>
                            <span className="gpp-hop-num">{i + 1}</span>
                            <NodePill label={hop.fromLabel} kind={fromKind} />
                            <span className="gpp-hop-rel">{relLabel}</span>
                            <span className="gpp-hop-arrow">→</span>
                            <NodePill label={hop.toLabel} kind={toKind} />
                            <span className="gpp-hop-source">{hop.source.replace(/^BG-/, "").replace(/-/g, "\u00a0").replace(/\.[a-z]+$/i, "")}</span>
                            <span className="gpp-hop-toggle">{evidenceOpen ? "▲" : "▼"}</span>
                          </button>
                          {evidenceOpen && (
                            <div className="gpp-hop-evidence">
                              <span className="gpp-hop-evidence-quote">{hop.evidence}</span>
                              <span className="gpp-hop-evidence-src">📄 {hop.source}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {!showAll && path.hops.length > 5 && (
                      <button className="gpp-show-more" onClick={(e) => { e.stopPropagation(); setShowAll(true); }}>
                        + {path.hops.length - 5} more evidence hops
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Node type legend */}
          <div className="gpp-legend">
            <span className="gpp-node gpp-node--city"><span className="gpp-node-pip" />City</span>
            <span className="gpp-node gpp-node--project"><span className="gpp-node-pip" />Project</span>
            <span className="gpp-node gpp-node--grant"><span className="gpp-node-pip" />Grant</span>
            <span className="gpp-node gpp-node--metric"><span className="gpp-node-pip" />Metric</span>
          </div>
        </div>
      )}
    </div>
  );
}
