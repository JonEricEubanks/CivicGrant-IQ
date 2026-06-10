import { useEffect, useState } from "react";
import type { PipelineGrant } from "./GrantPipelineWidget";
import "./CityProfileScanWidget.css";

export interface CityProfileScanData {
  cityName: string;
  status: string;
  completedCount: number;
  totalCount: number;
  grants: PipelineGrant[];
  totalOpportunity: number;
  done: boolean;
}

function fmtMoney(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 100_000_000) return `$${Math.round(n / 1_000_000)}M`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n.toLocaleString()}`;
}

// Animated counter — smoothly counts up to `to` on each change
function AnimCounter({ to, prefix = "", isMoney = false }: { to: number; prefix?: string; isMoney?: boolean }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (to === 0) { setVal(0); return; }
    const duration = 950;
    const start = performance.now();
    const from = 0;
    function tick(ts: number) {
      const p = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(from + (to - from) * eased);
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [to]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isMoney) {
    return <>{fmtMoney(val)}</>;
  }
  return <>{prefix}{Math.round(val)}</>;
}

function ScanBarRow({ score, delay }: { score: number; delay: number }) {
  const [width, setWidth] = useState(0);
  const color = score >= 70 ? "#34d399" : score >= 45 ? "#fbbf24" : "#f87171";
  useEffect(() => {
    const t = setTimeout(() => setWidth(score), delay + 120);
    return () => clearTimeout(t);
  }, [score, delay]);
  return (
    <div className="csw-bar-wrap">
      <div className="csw-bar-track">
        <div
          className="csw-bar-fill"
          style={{
            width: `${width}%`,
            background: `linear-gradient(90deg, ${color}cc, ${color})`,
            boxShadow: `0 0 10px ${color}44`,
            transition: `width 0.95s cubic-bezier(0.34, 1.56, 0.64, 1) ${delay}ms`,
          }}
        />
      </div>
      <span className="csw-bar-score" style={{ color }}>{score}%</span>
    </div>
  );
}

interface Props {
  data: CityProfileScanData;
  onAnalyze?: (grant: PipelineGrant) => void;
}

export function CityProfileScanWidget({ data, onAnalyze }: Props) {
  const { cityName, status, completedCount, totalCount, grants, totalOpportunity, done } = data;
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const avgMatch = grants.length > 0
    ? Math.round(grants.reduce((s, g) => s + g.matchScore, 0) / grants.length)
    : 0;
  const topGrant = grants[0];

  return (
    <div className={`csw-root${done ? " csw-root--done" : " csw-root--scanning"}`}>

      {/* ── Header ── */}
      <div className="csw-header">
        <div className="csw-header-pattern" aria-hidden="true" />
        <div className="csw-header-left">
          <div className="csw-badge">
            {!done && <span className="csw-live-dot" />}
            <span className="csw-badge-text">{done ? "✓  SCAN COMPLETE" : "● SCANNING"}</span>
          </div>
          <div className="csw-city">{cityName}</div>
          <div className="csw-subtitle">AI Grant Portfolio Analysis</div>
        </div>
        <div className="csw-header-right">
          <div className="csw-agents-pill">
            <span className="csw-agents-dot" />
            5 parallel agents
          </div>
          {done && (
            <div className="csw-done-pill">
              <span>◉</span> {grants.length} grants found
            </div>
          )}
        </div>
      </div>

      {/* ── Stats row ── */}
      <div className="csw-stats-row">
        <div className="csw-stat">
          <div className="csw-stat-val csw-stat-val--green">
            <AnimCounter to={totalOpportunity} isMoney />
          </div>
          <div className="csw-stat-label">Total Opportunity</div>
        </div>
        <div className="csw-stat csw-stat--center">
          <div className="csw-stat-val csw-stat-val--blue">
            <AnimCounter to={completedCount} />
          </div>
          <div className="csw-stat-label">Grants Analyzed</div>
        </div>
        <div className="csw-stat">
          <div className="csw-stat-val csw-stat-val--purple">
            {avgMatch > 0 ? <><AnimCounter to={avgMatch} />%</> : "—"}
          </div>
          <div className="csw-stat-label">Avg Match Score</div>
        </div>
      </div>

      {/* ── Progress bar (visible while scanning) ── */}
      {!done && (
        <div className="csw-progress-section">
          <div className="csw-progress-track">
            <div className="csw-progress-fill" style={{ width: `${progress}%` }} />
            {progress > 0 && progress < 100 && (
              <div className="csw-progress-glow" style={{ left: `${progress}%` }} />
            )}
          </div>
          <div className="csw-progress-meta">
            <span className="csw-status-text">{status}</span>
            <span className="csw-progress-count">{completedCount} / {totalCount || "…"}</span>
          </div>
        </div>
      )}

      {/* ── Grant list ── */}
      {grants.length > 0 && (
        <div className="csw-grant-list">
          <div className="csw-list-header">
            <span className="csw-list-label">RANKED GRANT OPPORTUNITIES</span>
            <span className="csw-list-count">{grants.length} program{grants.length !== 1 ? "s" : ""}</span>
          </div>
          {grants.map((g, i) => (
            <div key={g.name + i} className="csw-grant-row" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="csw-grant-rank">#{g.rank}</div>
              <div className="csw-grant-body">
                <div className="csw-grant-name">{g.name}</div>
                <div className="csw-grant-meta">
                  <span className="csw-grant-agency">{g.agency}</span>
                  {g.focusArea && <span className="csw-grant-focus">{g.focusArea}</span>}
                  {g.fundingVerified && <span className="csw-verified-badge">✓ verified</span>}
                  {g.grantsGovUrl && (
                    <a
                      className="csw-live-badge"
                      href={g.grantsGovUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                    >🟢 grants.gov ↗</a>
                  )}
                </div>
                <ScanBarRow score={g.matchScore} delay={i * 90} />
              </div>
              <div className="csw-grant-right">
                <div className="csw-grant-amount">{fmtMoney(g.amount)}</div>
                {onAnalyze && (
                  <button className="csw-analyze-btn" onClick={() => onAnalyze(g)}>
                    Analyze →
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Skeleton placeholder while no grants have arrived yet ── */}
      {!done && grants.length === 0 && (
        <div className="csw-skeleton-list">
          {[0, 1, 2].map((i) => (
            <div key={i} className="csw-skeleton-row" style={{ animationDelay: `${i * 0.15}s` }}>
              <div className="csw-sk csw-sk--rank" />
              <div className="csw-skeleton-body">
                <div className="csw-sk csw-sk--title" />
                <div className="csw-sk csw-sk--meta" />
                <div className="csw-sk csw-sk--bar" />
              </div>
              <div className="csw-sk csw-sk--amount" />
            </div>
          ))}
        </div>
      )}

      {/* ── Done CTA ── */}
      {done && topGrant && (
        <div className="csw-done-section">
          <div className="csw-done-divider" />
          <div className="csw-done-actions">
            {onAnalyze && (
              <button className="csw-cta-btn csw-cta-btn--primary" onClick={() => onAnalyze(topGrant)}>
                <span className="csw-cta-icon">◉</span>
                <span>Deep Dive: {topGrant.name.length > 34 ? topGrant.name.slice(0, 34) + "…" : topGrant.name}</span>
              </button>
            )}
            <div className="csw-done-note">
              Ask a follow-up — compare grants, stack funding, or draft an application
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
