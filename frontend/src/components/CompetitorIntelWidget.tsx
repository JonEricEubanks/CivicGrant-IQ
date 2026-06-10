import { useEffect, useState } from "react";
import type { CompetitorIntelResult, CompetitorProfile } from "../types";
import { IconTarget } from "./Icons";
import "./CompetitorIntelWidget.css";

interface Props {
  data: CompetitorIntelResult;
  isStreaming?: boolean;
}

function WinGauge({ probability }: { probability: number }) {
  const [animated, setAnimated] = useState(0);
  const r = 44;
  const circ = 2 * Math.PI * r;
  const offset = circ - (animated / 100) * circ;
  const color = probability >= 65 ? "#3b82f6" : probability >= 45 ? "#8b5cf6" : "#6366f1";

  useEffect(() => {
    const t = setTimeout(() => setAnimated(probability), 150);
    return () => clearTimeout(t);
  }, [probability]);

  return (
    <div className="ci-gauge-wrapper">
      <svg width="106" height="106" viewBox="0 0 106 106">
        <circle cx="53" cy="53" r={r} fill="none" stroke="#1e293b" strokeWidth="9" />
        <circle
          cx="53" cy="53" r={r}
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 53 53)"
          style={{
            transition: "stroke-dashoffset 1.3s cubic-bezier(0.34,1.56,0.64,1)",
            filter: `drop-shadow(0 2px 8px ${color}66)`,
          }}
        />
      </svg>
      <div className="ci-gauge-center">
        <span className="ci-gauge-score" style={{ color }}>{animated}%</span>
        <span className="ci-gauge-label">Win Prob.</span>
      </div>
    </div>
  );
}

const THREAT_COLORS = { high: "#ef4444", medium: "#f59e0b", low: "#22c55e" } as const;
const THREAT_LABELS = { high: "High Threat", medium: "Med Threat", low: "Low Threat" } as const;
const LEVEL_COLORS = { high: "#ef4444", medium: "#f59e0b", low: "#22c55e" } as const;

function CompetitorCard({ c, index }: { c: CompetitorProfile; index: number }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), index * 120 + 200);
    return () => clearTimeout(t);
  }, [index]);
  return (
    <div className={`ci-competitor ${visible ? "ci-competitor--visible" : ""}`}>
      <div className="ci-competitor-header">
        <span className="ci-competitor-type">{c.type}</span>
        <span
          className="ci-threat-badge"
          style={{
            color: THREAT_COLORS[c.threat],
            background: `${THREAT_COLORS[c.threat]}18`,
            border: `1px solid ${THREAT_COLORS[c.threat]}33`,
          }}
        >
          {THREAT_LABELS[c.threat]}
        </span>
      </div>
      <p className="ci-competitor-desc">{c.description}</p>
    </div>
  );
}

export function CompetitorIntelWidget({ data, isStreaming = false }: Props) {
  // Honest unavailable state — no fabricated intel shown
  if (data.unavailable) {
    return (
      <div className="ci-widget">
        <div className="ci-header">
          <div className="ci-badge">
            <span className="ci-badge-icon"><IconTarget size={14} /></span>
            Competitive Intelligence
          </div>
        </div>
        <div style={{ padding: "24px 16px", textAlign: "center", color: "#6b7280" }}>
          <div style={{ fontSize: "2rem", marginBottom: "8px" }}>⚠️</div>
          <strong style={{ display: "block", color: "#374151", marginBottom: "4px" }}>Competitive Intel Agent Unavailable</strong>
          <span style={{ fontSize: "0.85rem" }}>LLM service unreachable — no fabricated competitive analysis shown.<br />Re-run when service recovers.</span>
        </div>
      </div>
    );
  }

  const levelColor = LEVEL_COLORS[data.competitionLevel];

  return (
    <div className={`ci-widget${isStreaming ? " ci-widget--loading" : ""}`}>
      <div className="ci-header">
        <div className="ci-badge">
          <span className="ci-badge-icon"><IconTarget size={14} /></span>
          Competitive Intelligence
        </div>
        <div className="ci-header-right">
          <div className="ci-confidence">
            <span className="ci-conf-label">Intel confidence</span>
            <span className="ci-conf-val">{data.confidence}%</span>
          </div>
        </div>
      </div>

      {/* Win probability + competition level */}
      <div className="ci-score-row">
        <WinGauge probability={data.winProbability} />
        <div className="ci-score-meta">
          <div className="ci-competition-level" style={{ color: levelColor, borderColor: `${levelColor}33`, background: `${levelColor}10` }}>
            <span className="ci-level-label">Competition</span>
            <span className="ci-level-value" style={{ color: levelColor }}>
              {data.competitionLevel.charAt(0).toUpperCase() + data.competitionLevel.slice(1)}
            </span>
          </div>
          <div className="ci-applicants">
            <span className="ci-applicants-num">~{data.estimatedApplicants.toLocaleString()}</span>
            <span className="ci-applicants-label">expected applicants</span>
          </div>
        </div>
      </div>

      {/* Competitor profiles */}
      <div className="ci-section">
        <div className="ci-section-title">
          <span className="ci-section-icon">👥</span>
          Key Competitor Profiles
        </div>
        <div className="ci-competitors-list">
          {data.keyCompetitors.map((c, i) => (
            <CompetitorCard key={i} c={c} index={i} />
          ))}
        </div>
      </div>

      {/* Differentiators */}
      <div className="ci-section">
        <div className="ci-section-title">
          <span className="ci-section-icon">⚡</span>
          Buffalo Grove Differentiators
        </div>
        <ul className="ci-diff-list">
          {data.differentiators.map((d, i) => (
            <li key={i} className="ci-diff-item">{d}</li>
          ))}
        </ul>
      </div>

      {/* Strategy tip */}
      {data.strategyTip && (
        <div className="ci-strategy-tip">
          <span className="ci-strategy-icon">💡</span>
          <span className="ci-strategy-text">{data.strategyTip}</span>
        </div>
      )}

      {isStreaming && (
        <div className="ci-streaming-bar">
          <span className="ci-streaming-dots"><span /><span /><span /></span>
          Scanning competitive landscape…
        </div>
      )}
    </div>
  );
}
