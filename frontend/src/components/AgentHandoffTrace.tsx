import { useState } from "react";
import type { AgentHandoff } from "../types";
import "./AgentHandoffTrace.css";

interface AgentHandoffTraceProps {
  handoffs: AgentHandoff[];
}

/**
 * AgentHandoffTrace — renders the live A2A (agent-to-agent) data flow that
 * CivicGrant IQ's multi-agent orchestrator produces during a grant analysis.
 *
 * Each "handoff" is the typed payload that one agent passes to the next —
 * concrete proof that agents communicate structured data, not just text.
 * This makes the reasoning pipeline VISIBLE to hackathon judges.
 */
export function AgentHandoffTrace({ handoffs }: AgentHandoffTraceProps) {
  const [expanded, setExpanded] = useState<number | null>(null);

  if (!handoffs.length) return null;

  return (
    <div className="handoff-trace">
      <div className="handoff-trace__header">
        <span className="handoff-trace__icon">⇌</span>
        <span className="handoff-trace__title">Agent-to-Agent Handoffs</span>
        <span className="handoff-trace__badge">{handoffs.length} A2A</span>
      </div>
      <div className="handoff-trace__list">
        {handoffs.map((h, i) => (
          <div key={i} className="handoff-node">
            <div
              className="handoff-node__header"
              onClick={() => setExpanded(expanded === i ? null : i)}
            >
              <span className="handoff-node__arrow">→</span>
              <span className="handoff-node__from">{h.from}</span>
              <span className="handoff-node__sep">⟶</span>
              <span className="handoff-node__to">{h.to}</span>
              <span className="handoff-node__toggle">{expanded === i ? "▲" : "▼"}</span>
            </div>

            {expanded === i && (
              <div className="handoff-node__payload">
                <PayloadView handoff={h} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PayloadView({ handoff }: { handoff: AgentHandoff }) {
  const p = handoff.payload;
  const rows: Array<{ label: string; value: string; highlight?: boolean }> = [];

  if (p.grantName) rows.push({ label: "Grant", value: p.grantName });
  if (p.matchScore != null) rows.push({ label: "Match Score", value: `${p.matchScore}%`, highlight: true });
  if (p.redTeamScore != null) rows.push({ label: "Red Team Score", value: `${p.redTeamScore}/100`, highlight: true });
  if (p.redTeamVerdict) rows.push({ label: "Verdict", value: p.redTeamVerdict, highlight: p.redTeamVerdict.toLowerCase().includes("approve") });
  if (p.winProbability != null) rows.push({ label: "Win Probability", value: `${p.winProbability}%` });
  if (p.competitionLevel) rows.push({ label: "Competition", value: p.competitionLevel.toUpperCase() });
  if (p.gapCount != null) rows.push({ label: "Gaps Identified", value: String(p.gapCount) });
  if (p.narrativeLength != null) rows.push({ label: "Narrative Length", value: `${p.narrativeLength} chars` });
  if (p.trigger) rows.push({ label: "Trigger", value: p.trigger });

  return (
    <div className="payload-view">
      <div className="payload-view__meta">
        <span className="payload-view__type">TypeScript payload · {new Date(handoff.timestampMs).toLocaleTimeString()}</span>
      </div>

      <div className="payload-view__kv">
        {rows.map((r, i) => (
          <div key={i} className={`payload-kv ${r.highlight ? "payload-kv--highlight" : ""}`}>
            <span className="payload-kv__label">{r.label}</span>
            <span className="payload-kv__value">{r.value}</span>
          </div>
        ))}
      </div>

      {p.quickFixes && p.quickFixes.length > 0 && (
        <div className="payload-view__list">
          <div className="payload-view__list-title">Red Team Quick Fixes passed to Refinement Agent:</div>
          {p.quickFixes.map((f, i) => (
            <div key={i} className="payload-view__list-item">
              <span className="payload-view__list-dot">•</span> {f}
            </div>
          ))}
        </div>
      )}

      {p.differentiators && p.differentiators.length > 0 && (
        <div className="payload-view__list">
          <div className="payload-view__list-title">Competitive differentiators passed to Refinement Agent:</div>
          {p.differentiators.map((d, i) => (
            <div key={i} className="payload-view__list-item">
              <span className="payload-view__list-dot">✓</span> {d}
            </div>
          ))}
        </div>
      )}

      {p.topRisks && p.topRisks.length > 0 && (
        <div className="payload-view__list">
          <div className="payload-view__list-title">Top risks flagged by Red Team:</div>
          {p.topRisks.map((r, i) => (
            <div key={i} className="payload-view__list-item">
              <span className="payload-view__list-dot">⚠</span> {r}
            </div>
          ))}
        </div>
      )}

      {p.strategyTip && (
        <div className="payload-view__tip">
          <span className="payload-view__tip-label">Strategy tip:</span> {p.strategyTip}
        </div>
      )}
    </div>
  );
}
