import { useEffect, useState } from "react";
import type { RedTeamResult, ReviewCriterion } from "../types";
import "./RedTeamWidget.css";

interface Props {
  data: RedTeamResult;
  isStreaming?: boolean;
}

function ScoreBar({ score, delay }: { score: number; delay: number }) {
  const [width, setWidth] = useState(0);
  const pct = (score / 5) * 100;
  const color = score >= 4 ? "#16a34a" : score >= 3 ? "#c27a0e" : "#dc2626";
  useEffect(() => {
    const t = setTimeout(() => setWidth(pct), delay);
    return () => clearTimeout(t);
  }, [pct, delay]);
  return (
    <div className="rt-bar-track">
      <div
        className="rt-bar-fill"
        style={{
          width: `${width}%`,
          background: color,
          boxShadow: `0 0 6px ${color}55`,
          transition: `width 0.7s cubic-bezier(0.34,1.56,0.64,1) ${delay}ms`,
        }}
      />
      <span className="rt-bar-score" style={{ color }}>{score}/5</span>
    </div>
  );
}

function CriterionRow({ c, index }: { c: ReviewCriterion; index: number }) {
  const icons = { pass: "✓", warn: "△", fail: "✕" } as const;
  const colors = { pass: "#16a34a", warn: "#c27a0e", fail: "#dc2626" };
  return (
    <div className={`rt-criterion rt-criterion--${c.status}`}>
      <div className="rt-criterion-header">
        <span className="rt-criterion-icon" style={{ color: colors[c.status] }}>{icons[c.status]}</span>
        <span className="rt-criterion-name">{c.name}</span>
        <span className="rt-criterion-score" style={{ color: colors[c.status] }}>{c.score}/5</span>
      </div>
      <ScoreBar score={c.score} delay={120 + index * 80} />
      <p className="rt-criterion-feedback">{c.feedback}</p>
    </div>
  );
}

function ScoreGauge({ score }: { score: number }) {
  const [animated, setAnimated] = useState(0);
  const r = 48;
  const circ = 2 * Math.PI * r;
  const offset = circ - (animated / 100) * circ;
  const color = score >= 70 ? "#16a34a" : score >= 50 ? "#c27a0e" : "#dc2626";

  useEffect(() => {
    const t = setTimeout(() => setAnimated(score), 120);
    return () => clearTimeout(t);
  }, [score]);

  return (
    <div className="rt-gauge-wrapper">
      <svg width="116" height="116" viewBox="0 0 116 116">
        <circle cx="58" cy="58" r={r} fill="none" stroke="#1e293b" strokeWidth="10" />
        <circle
          cx="58" cy="58" r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 58 58)"
          style={{
            transition: "stroke-dashoffset 1.3s cubic-bezier(0.34,1.56,0.64,1)",
            filter: `drop-shadow(0 2px 8px ${color}66)`,
          }}
        />
      </svg>
      <div className="rt-gauge-center">
        <span className="rt-gauge-score" style={{ color }}>{animated}</span>
        <span className="rt-gauge-label">/ 100</span>
      </div>
    </div>
  );
}

export function RedTeamWidget({ data, isStreaming = false }: Props) {
  const verdictClass =
    data.reviewerVerdict.toLowerCase().startsWith("approve") && !data.reviewerVerdict.toLowerCase().includes("condition")
      ? "verdict--approve"
      : data.reviewerVerdict.toLowerCase().startsWith("reject")
      ? "verdict--reject"
      : "verdict--conditions";

  return (
    <div className={`redteam-widget${isStreaming ? " redteam-widget--loading" : ""}`}>
      <div className="rt-header">
        <div className="rt-badge">
          <span className="rt-badge-icon">⚖</span>
          Red Team Review
        </div>
        <div className="rt-header-right">
          <div className="rt-confidence">
            <span className="rt-conf-label">Reviewer confidence</span>
            <span className="rt-conf-val">{data.confidence}%</span>
          </div>
        </div>
      </div>

      {/* Score + Verdict row */}
      <div className="rt-score-row">
        <ScoreGauge score={data.overallScore} />
        <div className="rt-score-meta">
          <div className={`rt-verdict ${verdictClass}`}>
            {data.reviewerVerdict}
          </div>
          <div className="rt-criteria-summary">
            {data.criteria.map((c) => (
              <span key={c.name} className={`rt-dot rt-dot--${c.status}`} title={`${c.name}: ${c.score}/5`} />
            ))}
          </div>
        </div>
      </div>

      {/* Criteria breakdown */}
      <div className="rt-criteria-grid">
        {data.criteria.map((c, i) => (
          <CriterionRow key={c.name} c={c} index={i} />
        ))}
      </div>

      {/* Risks + Fixes */}
      <div className="rt-two-col">
        <div className="rt-section rt-section--risks">
          <div className="rt-section-title">
            <span className="rt-section-icon rt-section-icon--red">⚠</span>
            Top Disqualification Risks
          </div>
          <ul className="rt-list">
            {data.topRisks.map((r, i) => (
              <li key={i} className="rt-list-item rt-list-item--risk">{r}</li>
            ))}
          </ul>
        </div>
        <div className="rt-section rt-section--fixes">
          <div className="rt-section-title">
            <span className="rt-section-icon rt-section-icon--green">✓</span>
            Quick Fixes Before Submission
          </div>
          <ul className="rt-list">
            {data.quickFixes.map((f, i) => (
              <li key={i} className="rt-list-item rt-list-item--fix">{f}</li>
            ))}
          </ul>
        </div>
      </div>

      {isStreaming && (
        <div className="rt-streaming-overlay">
          <span className="rt-streaming-dots"><span /><span /><span /></span>
          Reviewing draft narrative…
        </div>
      )}
    </div>
  );
}
