import type { ReasoningStep } from "../types";
import "./ReasoningSteps.css";
import { IconSearch, IconMap, IconDollar, IconAlert, IconPencil, IconBrain, IconCheckCircle, IconLoader } from "./Icons";

const STEP_ICONS = [
  <IconSearch size={14} />,
  <IconMap size={14} />,
  <IconDollar size={14} />,
  <IconAlert size={14} />,
  <IconPencil size={14} />,
];

interface Props {
  steps: ReasoningStep[];
  isLoading: boolean;
}

export function ReasoningSteps({ steps, isLoading }: Props) {
  const allStepLabels = [
    "Parse the Grant",
    "Match City Projects",
    "Verify Financial Capacity",
    "Gap Analysis",
    "Draft Project Narrative",
  ];

  return (
    <div className="reasoning-steps">
      <h3 className="reasoning-title">
        <IconBrain size={14} /> Agent Reasoning
      </h3>
      <div className="steps-list">
        {allStepLabels.map((label, i) => {
          const stepNum = i + 1;
          const found = steps.find((s) => s.step === stepNum);
          const status = found?.completed
            ? "completed"
            : isLoading && steps.length === i
            ? "active"
            : "pending";

          return (
            <div key={stepNum} className={`step step--${status}`}>
              <div className="step-header">
                <span className="step-icon">
                  {status === "completed" ? <IconCheckCircle size={14} /> : status === "active" ? <IconLoader size={14} /> : STEP_ICONS[i]}
                </span>
                <span className="step-label">
                  Step {stepNum}: {label}
                </span>
              </div>
              {found?.content && (
                <div className="step-content">
                  <p>{found.content.slice(0, 200)}{found.content.length > 200 ? "…" : ""}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
