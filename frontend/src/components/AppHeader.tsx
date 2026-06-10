import type { ReactNode } from "react";
import { IconBuilding, IconChat, IconMicrosoft } from "./Icons";
import mgpLogo from "../assets/mgp-logo.png";

export type AppTab = "chat" | "scan" | "admin";

/**
 * AppHeader — unified top navigation.
 * Left: MGP shield logo + product name + tagline
 * Center: nav tabs
 * Right: Microsoft Foundry badge + actions
 */
export function AppHeader({
  active,
  onNavigate,
  actions,
}: {
  active: AppTab;
  onNavigate: (tab: AppTab) => void;
  actions?: ReactNode;
}) {
  return (
    <header className="app-header">
      {/* ── Brand ── */}
      <div
        className="header-brand header-brand--link"
        role="button"
        tabIndex={0}
        onClick={() => onNavigate("chat")}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onNavigate("chat"); }}
      >
        <span className="header-icon"><img src={mgpLogo} alt="MGP logo" className="header-mgp-logo" /></span>
        <div className="header-brand-text">
          <span className="header-name">CivicGrant <span className="header-name-iq">IQ</span></span>
          <span className="header-tag">Municipal Grant Portfolio</span>
        </div>
      </div>

      {/* ── Nav tabs ── */}
      <nav className="header-tabs" aria-label="Primary">
        <button
          className={`tab-btn${active === "chat" ? " tab-btn--active" : ""}`}
          aria-current={active === "chat" ? "page" : undefined}
          onClick={() => onNavigate("chat")}
        >
          <IconChat size={14} /> Analyze Grant
        </button>
        <button
          className={`tab-btn${active === "admin" ? " tab-btn--active" : ""}`}
          aria-current={active === "admin" ? "page" : undefined}
          onClick={() => onNavigate("admin")}
        >
          <IconBuilding size={14} /> Administer
        </button>
      </nav>

      {/* ── Right cluster ── */}
      <div className="header-right">
        <div className="header-badge">
          <IconMicrosoft size={12} />
          Powered by Microsoft Foundry IQ
        </div>
        {actions && (
          <>
            <div className="header-right-divider" />
            <div className="header-actions">{actions}</div>
          </>
        )}
      </div>
    </header>
  );
}
