import { useState } from "react";
import type { ReactNode } from "react";
import type { ReasoningStep, OrchestrationDecision, AgentHandoff, ToolCallEvent } from "../types";
import type { GuardrailsSummaryData } from "./GuardrailsStrip";
import type { RedTeamResult, CompetitorIntelResult, RefinedNarrativeResult } from "../types";
import { GrantRadarSkeleton } from "./GrantRadarSkeleton";
import { AgentOrchestraBar } from "./AgentOrchestraBar";
import { AgentHandoffTrace } from "./AgentHandoffTrace";
import { GuardrailsStrip } from "./GuardrailsStrip";
import { TierBadge } from "./TierBadge";
import { IconBolt, IconCheck } from "./Icons";
import "./ProcessPill.css";

// ── ToolCallLine (inline copy to avoid circular imports) ──────────────────
function ToolCallLine({ status, done }: { status: string; done: boolean }) {
  const isComplete = done || status.startsWith("[COMPLETE]");
  const isRedTeam = status.startsWith("[RED TEAM]");
  const isRefinement = status.startsWith("[REFINEMENT]");
  return (
    <div className={`tc-line${isComplete ? " tc-line--done" : ""}${isRedTeam ? " tc-line--redteam" : ""}${isRefinement ? " tc-line--refine" : ""}`}>
      <span className="tc-line__dot" />
      <span className="tc-line__text">{status}</span>
    </div>
  );
}

export interface ProcessPillProps {
  // Streaming state
  streaming?: boolean;
  statusLog?: string[];
  // Steps
  reasoningSteps?: ReasoningStep[];
  // Routing
  decisions?: OrchestrationDecision[];
  // Agent results
  redTeamReview?: RedTeamResult;
  competitorIntel?: CompetitorIntelResult;
  refinedNarrative?: RefinedNarrativeResult;
  reviewStreaming?: boolean;
  competitorStreaming?: boolean;
  refinementStreaming?: boolean;
  // A2A
  agentHandoffs?: AgentHandoff[];
  // Tier / guardrails
  tierInfo?: { tier: 1 | 2 | 3; label: string; guardrailsPassed: boolean; violations: number };
  toolCalls?: ToolCallEvent[];
  guardrailsSummary?: GuardrailsSummaryData;
  // Timing
  startedAt?: number;
  completedAt?: number;
  /** Rendered ThoughtProcess node — pass the real <ThoughtProcess> from parent so we get full step content */
  processContent?: ReactNode;
}

export function ProcessPill({
  streaming,
  statusLog,
  reasoningSteps,
  decisions,
  redTeamReview,
  competitorIntel,
  refinedNarrative,
  reviewStreaming,
  competitorStreaming,
  refinementStreaming,
  agentHandoffs,
  tierInfo,
  toolCalls,
  guardrailsSummary,
  startedAt,
  completedAt,
  processContent,
}: ProcessPillProps) {
  const [expanded, setExpanded] = useState(false);

  const completedSteps = (reasoningSteps ?? []).filter(s => s.completed);
  const hasProcess = (reasoningSteps?.length ?? 0) > 0 || (statusLog?.length ?? 0) > 0;

  // ── Live streaming view ─────────────────────────────────────────────────
  if (streaming) {
    return (
      <div className="pp-live">
        {/* Skeleton only before any steps arrive */}
        {!(reasoningSteps?.length) && (
          <GrantRadarSkeleton
            statusLog={statusLog ?? []}
            completedSteps={0}
          />
        )}
        {/* ThoughtProcess while steps stream in */}
        {(reasoningSteps?.length ?? 0) > 0 && processContent}
        {/* AgentOrchestraBar live */}
        {(reasoningSteps?.length ?? 0) > 0 && (
          <AgentOrchestraBar
            steps={reasoningSteps!}
            citationCount={0}
            redTeamReview={redTeamReview}
            redTeamSkipped={decisions?.some(d => d.branch === "red_team:skip") ?? false}
            competitorIntel={competitorIntel}
            refinedNarrative={refinedNarrative}
            reviewStreaming={reviewStreaming}
            competitorStreaming={competitorStreaming}
            refinementStreaming={refinementStreaming}
            streaming={true}
            startedAt={startedAt}
            completedAt={completedAt}
            refinementDelta={refinedNarrative?.estimatedScoreDelta}
            redTeamScore={redTeamReview?.overallScore}
            winProbability={competitorIntel?.winProbability}
            competitionLevel={competitorIntel?.competitionLevel}
          />
        )}
      </div>
    );
  }

  // ── Nothing to show ─────────────────────────────────────────────────────
  if (!hasProcess) return null;

  // ── Build summary metrics ────────────────────────────────────────────────
  const elapsed = startedAt && completedAt ? Math.round((completedAt - startedAt) / 1000) : null;

  const agentCount = [
    completedSteps.length > 0,
    completedSteps.length > 0,
    !!redTeamReview,
    !!competitorIntel,
    !!refinedNarrative,
  ].filter(Boolean).length;

  const guardrailsOk = tierInfo?.guardrailsPassed ?? true;
  const guardrailsCount = guardrailsSummary?.rulesActive ?? (tierInfo ? 17 : null);
  const routingLabel = decisions?.find(d => d.kind === "route")?.label ?? null;
  const routingDetail = decisions?.find(d => d.kind === "route")?.detail ?? null;

  // ── Collapsed pill ───────────────────────────────────────────────────────
  return (
    <div className="pp-pill">
      {/* ── Summary bar ── */}
      <button className="pp-pill__summary" onClick={() => setExpanded(v => !v)} aria-expanded={expanded ? "true" : "false"}>
        <span className="pp-pill__left">
          <span className="pp-pill__icon"><IconBolt size={12} /></span>

          <span className="pp-pill__chip pp-pill__chip--steps">
            {completedSteps.length} steps
          </span>

          {agentCount > 0 && (
            <span className="pp-pill__chip pp-pill__chip--agents">
              {agentCount} agents
            </span>
          )}

          {elapsed !== null && (
            <span className="pp-pill__chip pp-pill__chip--time">
              {elapsed}s
            </span>
          )}

          {guardrailsCount !== null && (
            <span className={`pp-pill__chip ${guardrailsOk ? "pp-pill__chip--guardrails-ok" : "pp-pill__chip--guardrails-warn"}`}>
              <IconCheck size={10} />
              {guardrailsCount} guardrails
            </span>
          )}

          {redTeamReview && (
            <span className="pp-pill__chip pp-pill__chip--redteam">
              Red Team {redTeamReview.overallScore}/100
            </span>
          )}

          {competitorIntel && (
            <span className="pp-pill__chip pp-pill__chip--win">
              {competitorIntel.winProbability}% win
            </span>
          )}

          {refinedNarrative && (
            <span className="pp-pill__chip pp-pill__chip--refinement">
              +{refinedNarrative.estimatedScoreDelta} pts
            </span>
          )}
        </span>

        <span className="pp-pill__right">
          {expanded ? "Hide" : "View process"}
          <span className={`pp-pill__chevron${expanded ? " pp-pill__chevron--open" : ""}`}>›</span>
        </span>
      </button>

      {/* Route badge — always visible */}
      {routingLabel && (
        <div className="pp-pill__route-badge">
          <span className="pp-pill__route-chip">ROUTE</span>
          <span className="pp-pill__route-label">{routingLabel}{routingDetail ? ` — ${routingDetail}` : ""}</span>
        </div>
      )}

      {/* ── Expanded body ── */}
      {expanded && (
        <div className="pp-pill__body">

          {/* Pipeline log */}
          {(statusLog?.length ?? 0) > 0 && (
            <>
              <div className="pp-section-label">Pipeline Log<span className="pp-section-label__line" /></div>
              <div className="pp-section-content">
                <div className="pp-status-log">
                  {statusLog!.map((s, i) => (
                    <ToolCallLine key={i} status={s} done={true} />
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Agent Tasks */}
          {processContent && (
            <>
              <div className="pp-section-label">Agent Tasks<span className="pp-section-label__line" /></div>
              <div className="pp-section-content">
                {processContent}
              </div>
            </>
          )}

          {/* Routing decisions */}
          {(decisions?.length ?? 0) > 0 && (
            <>
              <div className="pp-section-label">Routing<span className="pp-section-label__line" /></div>
              <div className="pp-section-content">
                <div className="decision-trail">
                  <div className="decision-trail-head">
                    <IconBolt size={13} />
                    Adaptive routing — {decisions!.length} path{decisions!.length === 1 ? "" : "s"} taken
                  </div>
                  {decisions!.map((d) => (
                    <div
                      key={d.id}
                      className={`decision-row decision-row--${d.kind}${d.branch === "red_team:skip" ? " decision-row--skip" : ""}`}
                    >
                      <span className="decision-badge">{d.kind === "requery" ? "RE-QUERY" : "ROUTE"}</span>
                      <div className="decision-body">
                        <span className="decision-label">{d.label}</span>
                        <span className="decision-detail">{d.detail}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Multi-Agent Orchestration */}
          {completedSteps.length > 0 && (
            <>
              <div className="pp-section-label">Multi-Agent Orchestration<span className="pp-section-label__line" /></div>
              <div className="pp-section-content">
                <AgentOrchestraBar
                  steps={reasoningSteps!}
                  citationCount={0}
                  redTeamReview={redTeamReview}
                  redTeamSkipped={decisions?.some(d => d.branch === "red_team:skip") ?? false}
                  competitorIntel={competitorIntel}
                  refinedNarrative={refinedNarrative}
                  reviewStreaming={false}
                  competitorStreaming={false}
                  refinementStreaming={false}
                  streaming={false}
                  startedAt={startedAt}
                  completedAt={completedAt}
                  refinementDelta={refinedNarrative?.estimatedScoreDelta}
                  redTeamScore={redTeamReview?.overallScore}
                  winProbability={competitorIntel?.winProbability}
                  competitionLevel={competitorIntel?.competitionLevel}
                />
              </div>
            </>
          )}

          {/* A2A handoffs */}
          {(agentHandoffs?.length ?? 0) > 0 && (
            <>
              <div className="pp-section-label">Agent-to-Agent Handoffs<span className="pp-section-label__line" /></div>
              <div className="pp-section-content">
                <AgentHandoffTrace handoffs={agentHandoffs!} />
              </div>
            </>
          )}

          {/* Tool calls */}
          {(toolCalls?.length ?? 0) > 0 && (
            <>
              <div className="pp-section-label">Tool Calls<span className="pp-section-label__line" /></div>
              <div className="pp-section-content">
                <div className="tool-calls-strip">
                  {toolCalls!.map((tc, i) => (
                    <div key={i} className="tool-call-chip" title={`Source: ${tc.source}`}>
                      <span className="tool-call-chip__icon">⚙</span>
                      <span className="tool-call-chip__name">{tc.tool}</span>
                      <span className="tool-call-chip__query">"{tc.query}"</span>
                      <span className="tool-call-chip__tier">Tier {tc.tier}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Tier + Guardrails */}
          {(tierInfo || guardrailsSummary) && (
            <>
              <div className="pp-section-label">Safety &amp; Provenance<span className="pp-section-label__line" /></div>
              <div className="pp-section-content">
                {tierInfo && (
                  <TierBadge
                    tier={tierInfo.tier}
                    label={tierInfo.label}
                    guardrailsPassed={tierInfo.guardrailsPassed}
                    violations={tierInfo.violations}
                  />
                )}
                {guardrailsSummary && (
                  <GuardrailsStrip data={guardrailsSummary} />
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
