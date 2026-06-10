import type { ReactNode } from "react";
import { IconBuilding, IconChat, IconSearch, IconBrandLogo, IconMicrosoft } from "./Icons";

export type AppTab = "chat" | "scan" | "admin";

/**
 * AppHeader — the single, unified top navigation used across every view
 * (Analyze Grant / Scan My City / Administer). Keeps the brand and the
 * "Powered by Microsoft Foundry IQ" badge persistent on every screen so the
 * navigation never shifts between a sidebar and a top bar.
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
      <div
        className="header-brand header-brand--link"
        role="button"
        tabIndex={0}
        onClick={() => onNavigate("chat")}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onNavigate("chat"); }}
      >
        <span className="header-icon"><IconBrandLogo size={26} /></span>
        <span className="header-name">CivicGrant IQ</span>
        <span className="header-tag">Municipal Revenue Intelligence</span>
      </div>

      <nav className="header-tabs" aria-label="Primary">
        <button
          className={`tab-btn${active === "chat" ? " tab-btn--active" : ""}`}
          aria-current={active === "chat" ? "page" : undefined}
          onClick={() => onNavigate("chat")}
        >
          <IconChat size={14} /> Analyze Grant
        </button>
        <button
          className={`tab-btn${active === "scan" ? " tab-btn--active" : ""}`}
          aria-current={active === "scan" ? "page" : undefined}
          onClick={() => onNavigate("scan")}
        >
          <IconSearch size={14} /> Scan My City
        </button>
        <button
          className={`tab-btn${active === "admin" ? " tab-btn--active" : ""}`}
          aria-current={active === "admin" ? "page" : undefined}
          onClick={() => onNavigate("admin")}
        >
          <IconBuilding size={14} /> Administer
        </button>
      </nav>

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
