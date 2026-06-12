import { useState } from "react";
import type { ReactNode } from "react";
import "./GuardrailsStrip.css";
import { IconCheck, IconAlert, IconInfo, IconX, IconChevronDown } from "./Icons";

export interface GuardrailRule {
  id: string;
  label: string;
  layer: "input" | "output";
  status: "PASS" | "WARN" | "INFO" | "BLOCK";
  message?: string;
}

export interface GuardrailsSummaryData {
  rulesActive: number;
  rules: GuardrailRule[];
  passCount: number;
  violationCount: number;
}

interface GuardrailsStripProps {
  data: GuardrailsSummaryData;
}

/**
 * GuardrailsStrip — shows CivicGrant IQ's 17-rule safety pipeline status.
 * Every analysis runs all 17 rules (9 input + 8 output) before and after
 * the LLM call. This makes the reliability & safety story visible to judges.
 */
export function GuardrailsStrip({ data }: GuardrailsStripProps) {
  const [expanded, setExpanded] = useState(false);

  const hasViolations = data.violationCount > 0;
  const inputRules  = data.rules.filter(r => r.layer === "input");
  const outputRules = data.rules.filter(r => r.layer === "output");

  return (
    <div className={`guardrails-strip ${hasViolations ? "guardrails-strip--warn" : "guardrails-strip--pass"}`}>
      <div className="guardrails-header" onClick={() => setExpanded(!expanded)}>
        <span className="guardrails-icon"><IconCheck size={14} /></span>
        <span className="guardrails-title">{data.rulesActive} Safety Guardrails</span>
        <span className={`guardrails-count ${hasViolations ? "guardrails-count--warn" : "guardrails-count--pass"}`}>
          {data.passCount} passed
          {data.violationCount > 0 && <> · {data.violationCount} warn</>}
        </span>
        <span className="guardrails-layers">
          <span className="guardrails-layer-chip">9 input</span>
          <span className="guardrails-layer-chip">8 output</span>
        </span>
        <span className={`guardrails-toggle${expanded ? " guardrails-toggle--open" : ""}`}><IconChevronDown size={14} /></span>
      </div>

      {expanded && (
        <div className="guardrails-body">
          <div className="guardrails-section">
            <div className="guardrails-section-label">Input Guards — User → Agent boundary</div>
            <div className="guardrails-rules">
              {inputRules.map(r => <RuleRow key={r.id} rule={r} />)}
            </div>
          </div>
          <div className="guardrails-section">
            <div className="guardrails-section-label">Output Guards — Agent → Frontend boundary</div>
            <div className="guardrails-rules">
              {outputRules.map(r => <RuleRow key={r.id} rule={r} />)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RuleRow({ rule }: { rule: GuardrailRule }) {
  const IconMap: Record<string, ReactNode> = {
    PASS: <IconCheck size={12} />, WARN: <IconAlert size={12} />, INFO: <IconInfo size={12} />, BLOCK: <IconX size={12} />
  };
  return (
    <div className={`guardrail-rule guardrail-rule--${rule.status.toLowerCase()}`} title={rule.message ?? rule.label}>
      <span className="guardrail-rule__icon">{IconMap[rule.status]}</span>
      <span className="guardrail-rule__id">{rule.id.split("_")[0]}</span>
      <span className="guardrail-rule__label">{rule.label}</span>
      {rule.message && rule.status !== "PASS" && (
        <span className="guardrail-rule__msg">{rule.message.slice(0, 80)}</span>
      )}
    </div>
  );
}
