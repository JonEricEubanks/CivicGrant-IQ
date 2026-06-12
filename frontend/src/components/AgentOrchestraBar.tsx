import { useEffect, useState } from "react";
import type { ReasoningStep, RedTeamResult, CompetitorIntelResult, RefinedNarrativeResult } from "../types";
import { IconBolt, IconCheck, IconScales, IconTarget, IconSearch, IconSparkle } from "./Icons";
import "./AgentOrchestraBar.css";

type AgentState = "pending" | "active" | "done" | "skipped";

interface AgentChip {
  key: string;
  label: string;
  icon: React.ReactNode;
  state: AgentState;
  badge?: string;
}

export interface AgentOrchestraBarProps {
  steps: ReasoningStep[];
  citationCount: number;
  redTeamReview?: RedTeamResult;
  redTeamSkipped?: boolean;
  competitorIntel?: CompetitorIntelResult;
  refinedNarrative?: RefinedNarrativeResult;
  reviewStreaming?: boolean;
  competitorStreaming?: boolean;
  refinementStreaming?: boolean;
  streaming?: boolean;
  startedAt?: number;
  completedAt?: number;
  refinementDelta?: number;
  /** Score badges shown on done chips for judge visibility */
  redTeamScore?: number;
  winProbability?: number;
  competitionLevel?: string;
}

/**
 * AgentOrchestraBar — a "mission control" strip that makes CivicGrant IQ's
 * multi-agent system VISIBLE: it shows each specialist agent lighting up as it
 * works, a live elapsed-time clock, and a final performance summary
 * ("5 agents · N sources verified · X.Xs · self-critique applied").
 *
 * This is the single proof point that ties together Foundry IQ retrieval, the
 * reasoning engine, the Red Team reviewer, the competitive-intel agent and the
 * self-critique refinement loop into one orchestrated trace.
 */
export function AgentOrchestraBar({
  steps,
  citationCount,
  redTeamReview,
  redTeamSkipped,
  competitorIntel,
  refinedNarrative,
  reviewStreaming,
  competitorStreaming,
  refinementStreaming,
  streaming,
  startedAt,
  completedAt,
  refinementDelta,
  redTeamScore,
  winProbability,
  competitionLevel,
}: AgentOrchestraBarProps) {
  const [now, setNow] = useState(() => Date.now());

  // Live clock while streaming
  useEffect(() => {
    if (!streaming || !startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [streaming, startedAt]);

  const completedSteps = steps.filter((s) => s.completed).length;
  const reasoningActive = streaming && completedSteps < 6;
  const retrievalDone = citationCount > 0 || completedSteps >= 6;

  const agents: AgentChip[] = [
    {
      key: "retrieval",
      label: "Foundry IQ Retrieval",
      icon: <IconSearch size={13} />,
      state: retrievalDone ? "done" : streaming ? "active" : "pending",
    },
    {
      key: "reasoning",
      label: "Reasoning Engine",
      icon: <IconSparkle size={13} />,
      state: !streaming && completedSteps > 0 ? "done" : reasoningActive ? "active" : completedSteps >= 6 ? "done" : "pending",
    },
    {
      key: "redteam",
      label: redTeamSkipped ? "Red Team — skipped" : "Red Team Reviewer",
      icon: <IconScales size={13} />,
      state: redTeamReview ? "done" : redTeamSkipped ? "skipped" : reviewStreaming ? "active" : "pending",
      badge: redTeamReview && typeof redTeamScore === "number" ? `${redTeamScore}/100` : undefined,
    },
    {
      key: "competitor",
      label: "Competitive Intel",
      icon: <IconTarget size={13} />,
      state: competitorIntel ? "done" : competitorStreaming ? "active" : "pending",
      badge: competitorIntel && typeof winProbability === "number" ? `${winProbability}% win` : competitorIntel && competitionLevel ? competitionLevel.toUpperCase() : undefined,
    },
    {
      key: "refiner",
      label: "Self-Critique Refiner",
      icon: <IconBolt size={13} />,
      state: refinedNarrative ? "done" : refinementStreaming ? "active" : "pending",
      badge: refinedNarrative && typeof refinementDelta === "number" && refinementDelta > 0 ? `+${refinementDelta} pts` : undefined,
    },
  ];

  const doneCount = agents.filter((a) => a.state === "done").length;
  const skippedCount = agents.filter((a) => a.state === "skipped").length;
  const totalAgents = agents.length - skippedCount;
  const allDone = !streaming && doneCount >= 1;

  const elapsedMs = startedAt
    ? (completedAt ?? (streaming ? now : completedAt ?? now)) - startedAt
    : 0;
  const elapsedSec = Math.max(0, elapsedMs / 1000);
  const elapsedLabel = elapsedSec >= 10 ? elapsedSec.toFixed(0) : elapsedSec.toFixed(1);

  return (
    <div className={`orchestra-bar ${allDone ? "orchestra-bar--done" : "orchestra-bar--live"}`}>
      <div className="orchestra-head">
        <span className="orchestra-pulse" aria-hidden="true" />
        <span className="orchestra-title">Multi-Agent Orchestration</span>
        <span className="orchestra-count">{doneCount}/{totalAgents} agents</span>
        {startedAt && (
          <span className="orchestra-clock">
            <IconBolt size={11} /> {elapsedLabel}s
          </span>
        )}
      </div>

      <div className="orchestra-track">
        {agents.map((a, i) => (
          <div key={a.key} className="orchestra-node-wrap">
            <div className={`orchestra-node orchestra-node--${a.state}`} title={a.label}>
              <span className="orchestra-node-icon">
                {a.state === "done" ? <IconCheck size={12} /> : a.icon}
              </span>
              <span className="orchestra-node-label">{a.label}</span>
              {a.state === "active" && <span className="orchestra-node-dots"><span /><span /><span /></span>}
              {a.state === "done" && a.badge && <span className="orchestra-node-badge">{a.badge}</span>}
            </div>
            {i < agents.length - 1 && (
              <span className={`orchestra-link ${a.state === "done" ? "orchestra-link--done" : ""}`} />
            )}
          </div>
        ))}
      </div>

      {allDone && (
        <div className="orchestra-summary">
          <span className="orchestra-summary-chip orchestra-summary-chip--primary">
            <IconBolt size={11} /> {doneCount} agents · {elapsedLabel}s
          </span>
          {citationCount > 0 && (
            <span className="orchestra-summary-chip">
              <IconCheck size={11} /> {citationCount} source{citationCount === 1 ? "" : "s"} verified
            </span>
          )}
          {refinedNarrative && (
            <span className="orchestra-summary-chip orchestra-summary-chip--refine">
              <IconSparkle size={11} /> Self-critique applied
              {typeof refinementDelta === "number" && refinementDelta > 0 ? ` (+${refinementDelta} pts)` : ""}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
