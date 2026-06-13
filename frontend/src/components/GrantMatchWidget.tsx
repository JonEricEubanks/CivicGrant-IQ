import { useEffect, useState } from "react";
import { IconChart, IconAlert, IconCheck, IconDocument, IconCopy } from "./Icons";
import { WorkIqPanel } from "./WorkIqPanel";
import type { WorkIqCityContext } from "../types";
import "./GrantMatchWidget.css";

export interface GrantMatchData {
  grantName: string;
  agency: string;
  fundingAmount: number;
  awardRange: string;
  deadline: string;
  matchScore: number;
  grantsGovUrl?: string;
  eligibleApplicants?: string[];
  awardCeiling?: number;
  gaps: Array<{ title: string; severity: "critical" | "moderate" | "minor"; suggestion: string }>;
  strengths: string[];
  narrativeDraft: string;
  strategy?: {
    actionItems?: string[];
    winningDifferentiator?: string;
    competitionLevel?: string;
    weeklyMilestones?: Array<{ week: number; task: string; owner?: string }>;
  };
}

interface Props {
  data: GrantMatchData;
  isRefined?: boolean;
  refinementImprovements?: string[];
  refinementDelta?: number;
  cityContext?: WorkIqCityContext;
}

function AnimatedNumber({ target, prefix = "", suffix = "" }: { target: number; prefix?: string; suffix?: string }) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let start = 0;
    const duration = 1200;
    const step = (timestamp: number) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target]);
  return <>{prefix}{value.toLocaleString()}{suffix}</>;
}

function MatchGauge({ score }: { score: number }) {
  const [animated, setAnimated] = useState(0);
  const r = 54;
  const circ = 2 * Math.PI * r;
  const offset = circ - (animated / 100) * circ;
  const color = score >= 70 ? "#22c55e" : score >= 45 ? "#f59e0b" : "#ef4444";

  useEffect(() => {
    const timer = setTimeout(() => setAnimated(score), 100);
    return () => clearTimeout(timer);
  }, [score]);

  const scoreLabel = score >= 70 ? "Strong match" : score >= 45 ? "Moderate match" : "Low match";
  const gaugeId = `gauge-title-${score}`;

  return (
    <div className="gauge-wrapper">
      <svg width="130" height="130" viewBox="0 0 130 130"
        role="img"
        aria-labelledby={gaugeId}>
        <title id={gaugeId}>{score}% match score — {scoreLabel}</title>
        <defs>
          <linearGradient id={`gaugeGrad-${score}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.75" />
            <stop offset="100%" stopColor={color} stopOpacity="1" />
          </linearGradient>
        </defs>
        <circle cx="65" cy="65" r={r} fill="none" stroke="#eef2f7" strokeWidth="11" aria-hidden="true" />
        <circle
          cx="65" cy="65" r={r}
          fill="none"
          stroke={`url(#gaugeGrad-${score})`}
          strokeWidth="11"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 65 65)"
          style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(0.34,1.56,0.64,1)", filter: `drop-shadow(0 2px 6px ${color}55)` }}
          aria-hidden="true"
        />
      </svg>
      <div className="gauge-center" aria-hidden="true">
        <span className="gauge-score" style={{ color }}>{animated}%</span>
        <span className="gauge-label">Match</span>
      </div>
    </div>
  );
}

const SEVERITY_COLORS = { critical: "#ef4444", moderate: "#f59e0b", minor: "#3b82f6" };

export function GrantMatchWidget({ data, isRefined, refinementImprovements, refinementDelta, cityContext }: Props) {
  const deadlineTime = new Date(data.deadline).getTime();
  const hasDeadline = !Number.isNaN(deadlineTime);
  const daysLeft = hasDeadline
    ? Math.max(0, Math.ceil((deadlineTime - Date.now()) / 86400000))
    : null;
  const urgency = daysLeft === null ? "good" : daysLeft <= 7 ? "critical" : daysLeft <= 21 ? "moderate" : "good";
  const urgencyColors = { critical: "#ef4444", moderate: "#f59e0b", good: "#22c55e" };

  return (
    <div className="grant-match-widget" role="region" aria-label={`Grant match analysis for ${data.grantName}`}>
      {/* Header */}
      <div className="widget-header">
        <div className="widget-badge"><IconChart size={13} color="#3b82f6" style={{ verticalAlign: "middle", marginRight: 4 }} />Grant Analysis</div>
        <h2 className="widget-title">{data.grantName}</h2>
        <div className="widget-agency">
          {data.agency}
          {data.grantsGovUrl && (
            <a
              href={data.grantsGovUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="widget-grants-gov-link"
              aria-label={`View ${data.grantName} on Grants.gov (opens in new tab)`}
            >
              View on Grants.gov ↗
            </a>
          )}
        </div>
      </div>

      {/* Hero Stats Row */}
      <div className="hero-stats">
        <div className="stat-hero stat-hero--gauge">
          <MatchGauge score={data.matchScore} />
          <div className={`confidence-badge confidence-badge--${data.matchScore >= 70 ? "confirmed" : data.matchScore >= 45 ? "likely" : "possible"}`}>
            {data.matchScore >= 70 ? "✦ CONFIRMED" : data.matchScore >= 45 ? "◈ LIKELY" : "◌ POSSIBLE"}
          </div>
        </div>

        <div className="stat-hero stat-hero--money">
          <div className="stat-amount">
            {data.fundingAmount <= 0
              ? <span style={{ background: "none", WebkitTextFillColor: "#64748b", fontSize: "1.9rem", fontWeight: 800 }}>Varies</span>
              : data.fundingAmount >= 1_000_000_000
              ? <>${(data.fundingAmount / 1_000_000_000).toFixed(1)}B</>
              : data.fundingAmount >= 1_000_000
              ? <>$<AnimatedNumber target={Math.round(data.fundingAmount / 1_000_000)} suffix="M" /></>
              : <>$<AnimatedNumber target={Math.round(data.fundingAmount / 1000)} suffix="K" /></>
            }
          </div>
          <div className="stat-sublabel">Available Funding</div>
          <div className="stat-range">{data.awardRange}</div>
        </div>

        <div className="stat-hero stat-hero--deadline">
          <div className="stat-days" style={{ color: urgencyColors[urgency] }}>
            {daysLeft === null
              ? <span style={{ fontSize: "1.9rem", fontWeight: 800 }}>TBD</span>
              : <AnimatedNumber target={daysLeft} />}
          </div>
          <div className="stat-sublabel">{daysLeft === null ? "Deadline" : "Days to Deadline"}</div>
          <div className="stat-date">
            {hasDeadline
              ? new Date(deadlineTime).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
              : "Not yet announced"}
          </div>
        </div>
      </div>

      {/* Evidence Quality Bar — shows KB grounding level */}
      {(() => {
        const tier = data.matchScore >= 70 ? "confirmed" : data.matchScore >= 45 ? "likely" : "possible";
        const srcLabel = tier === "confirmed" ? "≥2 KB sources corroborated" : tier === "likely" ? "1 KB source found" : "No direct KB match";
        const qualLabel = tier === "confirmed" ? "Strong" : tier === "likely" ? "Moderate" : "Tentative";
        const qualColor = tier === "confirmed" ? "#16a34a" : tier === "likely" ? "#b45309" : "#64748b";
        const barPct = tier === "confirmed" ? 100 : tier === "likely" ? 60 : 30;
        return (
          <div className="evidence-quality-row">
            <span className="eq-label">Evidence Quality</span>
            <div className="eq-bar-track">
              <div className="eq-bar-fill" style={{ width: `${barPct}%`, background: qualColor }} />
            </div>
            <span className="eq-tier" style={{ color: qualColor }}>{qualLabel}</span>
            <span className="eq-src">{srcLabel}</span>
          </div>
        );
      })()}

      {/* Eligibility row — shown only when parsed from pasted NOFO */}
      {data.eligibleApplicants && data.eligibleApplicants.length > 0 && (
        <div className="eligibility-row">
          <span className="eligibility-label">Eligible Applicants</span>
          <div className="eligibility-tags">
            {data.eligibleApplicants.map((type, i) => {
              const isCityMatch = /city|township|local|municipal/i.test(type);
              return (
                <span key={i} className={`eligibility-tag${isCityMatch ? " eligibility-tag--match" : ""}`}>
                  {isCityMatch && <span className="eligibility-check">✓</span>}{type}
                </span>
              );
            })}
            {data.awardCeiling && data.awardCeiling > 0 && (
              <span className="eligibility-tag eligibility-tag--ceiling">
                Award ceiling: ${data.awardCeiling >= 1_000_000 ? `${(data.awardCeiling / 1_000_000).toFixed(0)}M` : data.awardCeiling.toLocaleString()}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Gaps */}
      {data.gaps.length > 0 && (
        <div className="widget-section">
          <h4 className="section-title"><IconAlert size={13} color="#f59e0b" style={{ verticalAlign: "middle", marginRight: 4 }} />Eligibility Gaps ({data.gaps.length})</h4>
          <div className="gaps-list">
            {data.gaps.map((g, i) => (
              <div key={i} className="gap-card" style={{ borderLeftColor: SEVERITY_COLORS[g.severity] }}
                role="listitem"
                aria-label={`${g.severity} severity gap: ${g.title}`}>
                <div className="gap-header">
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: SEVERITY_COLORS[g.severity], display: "inline-block", flexShrink: 0 }} aria-hidden="true" />
                  <strong>{g.title}</strong>
                  <span className="gap-badge" style={{ background: SEVERITY_COLORS[g.severity] + "22", color: SEVERITY_COLORS[g.severity] }}
                    aria-label={`${g.severity} severity`}>
                    {g.severity}
                  </span>
                </div>
                <p className="gap-suggestion"><span style={{ color: "#3b82f6" }} aria-hidden="true">&#x25B8;</span> {g.suggestion}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Strengths */}
      {data.strengths.length > 0 && (
        <div className="widget-section">
          <h4 className="section-title"><IconCheck size={13} color="#22c55e" style={{ verticalAlign: "middle", marginRight: 4 }} />City Strengths</h4>
          <div className="strengths-list">
            {data.strengths.map((s, i) => (
              <div key={i} className="strength-tag">✓ {s.replace(/\*\*/g, "")}</div>
            ))}
          </div>
        </div>
      )}

      {/* Draft Narrative */}
      {data.narrativeDraft && (
        <div className={`widget-section narrative-section${isRefined ? " narrative-section--refined" : ""}`}>
          <div className="narrative-header-row">
            <h4 className="section-title narrative-section-title">
              <IconDocument size={13} color={isRefined ? "#16a34a" : "#94a3b8"} style={{ verticalAlign: "middle", marginRight: 5 }} />
              Draft Project Narrative
            </h4>
            {isRefined && (
              <span className="narrative-refined-badge">✦ AI-Refined{refinementDelta ? ` +${refinementDelta}pts` : ""}</span>
            )}
          </div>
          {isRefined && refinementImprovements && refinementImprovements.length > 0 && (
            <div className="narrative-refinement-log">
              {refinementImprovements.map((imp, i) => (
                <div key={i} className="refinement-log-item">✓ {imp.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1")}</div>
              ))}
            </div>
          )}
          <div className="narrative-body">
            <div className="narrative-doc">
              {data.narrativeDraft
                .replace(/\*\*([^*]+)\*\*/g, "$1")
                .replace(/\*([^*]+)\*/g, "$1")
                .split(/\n{2,}/)
                .map((para, i) => para.trim() ? <p key={i} className="narrative-para">{para.trim()}</p> : null)}
            </div>
            <button className="copy-btn" onClick={() => navigator.clipboard.writeText(data.narrativeDraft)}>
              <IconCopy size={12} style={{ verticalAlign: "middle", marginRight: 4 }} />Copy to Clipboard
            </button>
          </div>
        </div>
      )}

      {/* What's Next — Application Strategy */}
      {data.strategy && (data.strategy.actionItems?.length || data.strategy.winningDifferentiator) && (
        <div className="widget-section whats-next-section">
          <h4 className="section-title whats-next-title">Application Strategy</h4>
          {data.strategy.winningDifferentiator && (
            <div className="winning-edge-pill">
              <span className="we-label">Winning Edge</span>
              <span className="we-text">{data.strategy.winningDifferentiator}</span>
            </div>
          )}
          {data.strategy.competitionLevel && (
            <div className={`comp-level comp-level--${data.strategy.competitionLevel}`}>
              {data.strategy.competitionLevel.charAt(0).toUpperCase() + data.strategy.competitionLevel.slice(1)} competition field
            </div>
          )}
          {data.strategy.actionItems && data.strategy.actionItems.length > 0 && (
            <ol className="action-items-list">
              {data.strategy.actionItems.slice(0, 4).map((item, i) => (
                <li key={i} className="action-item">
                  <span className="action-num">{i + 1}</span>
                  <span className="action-text">{item.replace(/\*\*/g, "").replace(/\*/g, "")}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* Work IQ — turn deadline + milestones into a synced action plan */}
      <WorkIqPanel
        grantName={data.grantName}
        agency={data.agency}
        deadline={data.deadline}
        milestones={data.strategy?.weeklyMilestones}
        actionItems={data.strategy?.actionItems}
        cityContext={cityContext}
      />
    </div>
  );
}
