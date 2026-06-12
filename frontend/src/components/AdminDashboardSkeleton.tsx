import type { JSX } from "react";
import "./AdminDashboardSkeleton.css";

/** Full-layout skeleton that mirrors GrantAdminDashboard while data loads. */
export function AdminDashboardSkeleton(): JSX.Element {
  return (
    <div className="admin-skeleton-root">
      {/* ─── Sidebar ─────────────────────────── */}
      <aside className="admin-skel-sidebar">
        <div className="admin-skel-sidebar-header">
          <div className="skel-block" style={{ height: 14, width: "65%", borderRadius: 4 }} />
          <div className="skel-block" style={{ height: 10, width: "40%", borderRadius: 3 }} />
        </div>

        {/* Stats */}
        <div className="admin-skel-stats">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="admin-skel-stat">
              <div className="skel-block" style={{ height: 10, width: "55%" }} />
              <div className="skel-block" style={{ height: 18, width: "70%" }} />
            </div>
          ))}
        </div>

        {/* Portfolio button */}
        <div className="admin-skel-btn skel-block" />

        {/* Grant list */}
        <div className="admin-skel-grant-list">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`admin-skel-grant-item${i === 0 ? " admin-skel-grant-item-first" : ""}`}
            >
              <div className="skel-block" style={{ height: 12, width: `${65 + (i % 3) * 10}%` }} />
              <div style={{ display: "flex", gap: 6 }}>
                <div className="skel-block" style={{ height: 18, width: 52, borderRadius: 10 }} />
                <div className="skel-block" style={{ height: 18, width: 44, borderRadius: 10 }} />
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* ─── Main content ─────────────────────── */}
      <main className="admin-skel-main">
        {/* Header row */}
        <div className="admin-skel-header-row">
          <div className="admin-skel-header-left">
            <div className="skel-block" style={{ height: 22, width: "45%" }} />
            <div className="skel-block" style={{ height: 13, width: "30%" }} />
            <div className="admin-skel-badges">
              <div className="skel-block" style={{ height: 20, width: 72, borderRadius: 10 }} />
              <div className="skel-block" style={{ height: 20, width: 56, borderRadius: 10 }} />
            </div>
          </div>
          <div className="skel-block" style={{ height: 34, width: 120, borderRadius: 8 }} />
        </div>

        {/* Budget cards */}
        <div className="admin-skel-cards">
          {[0, 1, 2].map((i) => (
            <div key={i} className="admin-skel-card">
              <div className="skel-block" style={{ height: 11, width: "50%" }} />
              <div className="skel-block" style={{ height: 26, width: "65%" }} />
              <div className="admin-skel-progress-bar">
                <div className="admin-skel-progress-fill" style={{ width: `${45 + i * 15}%` }} />
              </div>
              <div className="skel-block" style={{ height: 10, width: "40%" }} />
            </div>
          ))}
        </div>

        {/* Milestones section */}
        <div className="admin-skel-section">
          <div className="skel-block" style={{ height: 13, width: "25%" }} />
          <div className="admin-skel-rows">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="admin-skel-row">
                <div className="admin-skel-icon skel-block" />
                <div className="skel-block" style={{ height: 12, flex: 1 }} />
                <div className="skel-block" style={{ height: 20, width: 64, borderRadius: 10 }} />
              </div>
            ))}
          </div>
        </div>

        {/* Compliance section */}
        <div className="admin-skel-section">
          <div className="skel-block" style={{ height: 13, width: "30%" }} />
          <div className="admin-skel-rows">
            {[0, 1, 2].map((i) => (
              <div key={i} className="admin-skel-row">
                <div className="admin-skel-icon skel-block" />
                <div className="skel-block" style={{ height: 12, flex: 1 }} />
                <div className="skel-block" style={{ height: 20, width: 72, borderRadius: 10 }} />
                <div className="skel-block" style={{ height: 12, width: 70 }} />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
