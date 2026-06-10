import { useState } from "react";
import type { GraphPath } from "../types";
import "./GraphPathsPanel.css";

interface Props {
  paths: GraphPath[];
}

const CONFIDENCE_COLORS: Record<string, string> = {
  CONFIRMED: "graph-path--confirmed",
  LIKELY:    "graph-path--likely",
  POSSIBLE:  "graph-path--possible",
};

const REL_LABELS: Record<string, string> = {
  qualifies_for:  "qualifies for",
  has_project:    "has project",
  has_metric:     "has metric",
  matches_focus:  "matches focus",
  closes_gap:     "closes gap",
  requires:       "requires",
  applied_for:    "applied for",
  awarded:        "awarded",
};

export function GraphPathsPanel({ paths }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [expandedPath, setExpandedPath] = useState<string | null>(null);
  const [expandedHops, setExpandedHops] = useState<Set<string>>(new Set());
  const [showAllHops, setShowAllHops] = useState(false);

  const toggleHop = (key: string) => {
    setExpandedHops(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  if (paths.length === 0) return null;

  return (
    <div className="graph-paths-panel">
      <button
        className="graph-paths-panel__toggle"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded ? "true" : "false"}
      >
        <span className="graph-paths-panel__icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="5" cy="12" r="3" />
            <circle cx="19" cy="6" r="3" />
            <circle cx="19" cy="18" r="3" />
            <line x1="8" y1="11" x2="16" y2="7.5" />
            <line x1="8" y1="13" x2="16" y2="16.5" />
          </svg>
        </span>
        <span>GraphRAG — {paths.length} reasoning path{paths.length > 1 ? "s" : ""} traversed</span>
        <span className="graph-paths-panel__badges">
          {paths.map(p => (
            <span
              key={p.grantId}
              className={`graph-path-badge ${CONFIDENCE_COLORS[p.confidence] ?? ""}`}
              title={`${p.confidence} — ${Math.round(p.totalScore * 100)}%`}
            >
              {Math.round(p.totalScore * 100)}%
            </span>
          ))}
        </span>
        <span className={`graph-paths-panel__chevron ${expanded ? "graph-paths-panel__chevron--open" : ""}`}>
          ›
        </span>
      </button>

      {expanded && (
        <div className="graph-paths-panel__body">
          <p className="graph-paths-panel__desc">
            How the AI connected your city's profile to this grant — click any step to reveal the supporting evidence.
          </p>
          {paths.map(path => (
            <div
              key={path.grantId}
              className={`graph-path ${CONFIDENCE_COLORS[path.confidence] ?? ""}`}
            >
              <button
                className="graph-path__header"
                onClick={() => setExpandedPath(v => v === path.grantId ? null : path.grantId)}
              >
                <span className={`graph-path__confidence-badge graph-path__confidence-badge--${path.confidence.toLowerCase()}`}>
                  {path.confidence}
                </span>
                <span className="graph-path__grant-label">{path.grantLabel}</span>
                <span className="graph-path__score">{Math.round(path.totalScore * 100)}%</span>
                <span className="graph-path__hop-count">{path.hops.length} hop{path.hops.length !== 1 ? "s" : ""}</span>
                <span className={`graph-path__chevron ${expandedPath === path.grantId ? "graph-path__chevron--open" : ""}`}>›</span>
              </button>

              {expandedPath === path.grantId && (
                <div className="graph-path__hops">
                  {(showAllHops ? path.hops : path.hops.slice(0, 4)).map((hop, i) => {
                    const hopKey = `${path.grantId}-${i}`;
                    const isHopOpen = expandedHops.has(hopKey);
                    return (
                      <div
                        key={hopKey}
                        className={`graph-hop graph-hop--clickable${isHopOpen ? " graph-hop--open" : ""}`}
                        onClick={() => toggleHop(hopKey)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") toggleHop(hopKey); }}
                      >
                        <div className="graph-hop__connector">
                          <span className="graph-hop__from">{hop.fromLabel}</span>
                          <span className="graph-hop__arrow">
                            <span className="graph-hop__rel">{REL_LABELS[hop.rel] ?? hop.rel.replace(/_/g, " ")}</span>
                            <svg className="graph-hop__arrow-svg" width="20" height="12" viewBox="0 0 20 12">
                              <path d="M0 6 L14 6 M10 2 L18 6 L10 10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </span>
                          <span className="graph-hop__to">{hop.toLabel}</span>
                          <span className="graph-hop__source-pill">{hop.source.replace(/^BG-/, "")}</span>
                        </div>
                        {isHopOpen && (
                          <div className="graph-hop__evidence">
                            <span className="graph-hop__evidence-text">{hop.evidence}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {!showAllHops && path.hops.length > 4 && (
                    <button
                      className="graph-hops-show-more"
                      onClick={(e) => { e.stopPropagation(); setShowAllHops(true); }}
                    >
                      +{path.hops.length - 4} more step{path.hops.length - 4 !== 1 ? "s" : ""}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
