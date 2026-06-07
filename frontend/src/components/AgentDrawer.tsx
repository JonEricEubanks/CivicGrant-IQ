import type { CSSProperties } from "react";
import type { RedTeamResult, CompetitorIntelResult } from "../types";
import { RedTeamWidget } from "./RedTeamWidget";
import { CompetitorIntelWidget } from "./CompetitorIntelWidget";
import { IconScales, IconTarget, IconX } from "./Icons";
import "./AgentDrawer.css";

type DrawerView =
  | { agent: "review"; data: RedTeamResult }
  | { agent: "competitor"; data: CompetitorIntelResult }
  | null;

interface Props {
  view: DrawerView;
  onClose: () => void;
}

const AGENT_META = {
  review: {
    label: "Red Team Review",
    icon: <IconScales size={18} />,
    accent: "#1a6fba",
    sub: "Federal reviewer simulation",
  },
  competitor: {
    label: "Competitive Intel",
    icon: <IconTarget size={18} />,
    accent: "#0e3a6e",
    sub: "Grant competition landscape",
  },
} as const;

export function AgentDrawer({ view, onClose }: Props) {
  if (!view) return null;
  const meta = AGENT_META[view.agent];

  return (
    <>
      {/* Backdrop — dims chat but workspace stays visible */}
      <div
        className="ad-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        className="ad-drawer"
        role="dialog"
        aria-label={meta.label}
        style={{ "--ad-accent": meta.accent } as CSSProperties}
      >
        {/* Header bar */}
        <div className="ad-header">
          <div className="ad-header-left">
            <span className="ad-header-emoji">{meta.icon}</span>
            <div className="ad-header-text">
              <span className="ad-header-title">{meta.label}</span>
              <span className="ad-header-sub">{meta.sub}</span>
            </div>
          </div>
          <button className="ad-close-btn" onClick={onClose} aria-label="Close">
            <IconX size={14} />
          </button>
        </div>

        {/* Accent line */}
        <div className="ad-accent-line" />

        {/* Content */}
        <div className="ad-content">
          {view.agent === "review" && <RedTeamWidget data={view.data} />}
          {view.agent === "competitor" && <CompetitorIntelWidget data={view.data} />}
        </div>
      </div>
    </>
  );
}

export type { DrawerView };
