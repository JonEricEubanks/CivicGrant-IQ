import "./TierBadge.css";

interface TierBadgeProps {
  tier: 1 | 2 | 3;
  label: string;
  guardrailsPassed: boolean;
  violations: number;
}

const TIER_SHORT: Record<number, string> = {
  1: "Tier 1 — Foundry SDK",
  2: "Tier 2 — Azure OpenAI",
  3: "Tier 3 — Mock Engine",
};

export function TierBadge({ tier, guardrailsPassed, violations }: TierBadgeProps) {
  return (
    <span className={`tier-badge tier-badge--${tier}`} title={`LLM Fallback Chain: Tier ${tier} active`}>
      <span className="tier-badge__dot" />
      {TIER_SHORT[tier] ?? `Tier ${tier}`}
      <span className={`tier-badge__guardrails ${guardrailsPassed ? "tier-badge__guardrails--pass" : "tier-badge__guardrails--warn"}`}>
        {guardrailsPassed ? `17 rules passed` : `${violations} flag${violations === 1 ? "" : "s"}`}
      </span>
    </span>
  );
}
