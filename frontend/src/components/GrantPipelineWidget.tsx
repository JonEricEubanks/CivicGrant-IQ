import { useEffect, useState } from "react";
import "./GrantPipelineWidget.css";

export interface PipelineGrant {
  rank: number;
  name: string;
  agency: string;
  amount: number;
  matchScore: number;
  deadline: string;
  focusArea: string;
}

interface Props {
  grants: PipelineGrant[];
  cityName: string;
  totalOpportunity: number;
  onAnalyze?: (grant: PipelineGrant) => void;
}

function BarProgress({ score, delay }: { score: number; delay: number }) {
  const [width, setWidth] = useState(0);
  const color = score >= 70 ? "#22c55e" : score >= 45 ? "#f59e0b" : "#ef4444";
  useEffect(() => {
    const t = setTimeout(() => setWidth(score), delay);
    return () => clearTimeout(t);
  }, [score, delay]);
  return (
    <div className="bar-track">
      <div
        className="bar-fill"
        style={{ width: `${width}%`, background: color, boxShadow: `0 0 8px ${color}66`, transition: `width 0.8s cubic-bezier(0.34,1.56,0.64,1) ${delay}ms` }}
      />
      <span className="bar-score" style={{ color }}>{score}%</span>
    </div>
  );
}

export function GrantPipelineWidget({ grants, cityName, totalOpportunity, onAnalyze }: Props) {
  return (
    <div className="pipeline-widget">
      <div className="pipeline-header">
        <div className="pipeline-badge">📊 Grant Pipeline</div>
        <div className="pipeline-city">{cityName}</div>
        <div className="pipeline-total">
          <span className="pipeline-total-label">Total Opportunity</span>
          <span className="pipeline-total-amount">${(totalOpportunity / 1_000_000).toFixed(1)}M</span>
        </div>
      </div>

      <div className="pipeline-list">
        {grants.map((g, i) => {
          const daysLeft = Math.max(0, Math.ceil((new Date(g.deadline).getTime() - Date.now()) / 86400000));
          const urgent = daysLeft <= 14;
          return (
            <div key={i} className={`pipeline-row ${urgent ? "pipeline-row--urgent" : ""}`}>
              <div className="pipeline-rank">#{g.rank}</div>
              <div className="pipeline-info">
                <div className="pipeline-name">{g.name}</div>
                <div className="pipeline-meta">
                  <span className="pipeline-agency">{g.agency}</span>
                  <span className="pipeline-focus">{g.focusArea}</span>
                  {urgent && <span className="pipeline-urgent-badge">⏰ {daysLeft}d left</span>}
                </div>
                <BarProgress score={g.matchScore} delay={i * 120} />
              </div>
              <div className="pipeline-right">
                <div className="pipeline-amount">${(g.amount / 1_000_000).toFixed(1)}M</div>
                {onAnalyze && (
                  <button className="analyze-btn" onClick={() => onAnalyze(g)}>
                    Analyze →
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
