import { useState } from "react";
import type { JSX } from "react";
import { AppHeader } from "./components/AppHeader";
import { ChatInterface } from "./components/ChatInterface";
import { GrantAdminDashboard } from "./components/GrantAdminDashboard";
import { DemoTour } from "./components/DemoTour";
import "./App.css";

type Tab = "chat" | "scan" | "admin";

export default function App(): JSX.Element {
  const [tab, setTab] = useState<Tab>("chat");
  const [selectedAdminGrantId, setSelectedAdminGrantId] = useState<string | null>(null);
  const tourButton = <DemoTour onNavigate={setTab} />;

  if (tab === "chat" || tab === "scan") {
    return (
      <ChatInterface
        onSwitchToScan={() => setTab("scan")}
        onSwitchToAdmin={(grantId) => {
          setSelectedAdminGrantId(grantId ?? null);
          setTab("admin");
        }}
        tourButton={tourButton}
        autoScan={tab === "scan"}
        onScanTriggered={() => setTab("chat")}
      />
    );
  }

  return (
    <div className="app app--admin">
      <a href="#main-content" className="skip-nav">Skip to main content</a>
      <AppHeader active="admin" onNavigate={setTab} actions={tourButton} />
      <main id="main-content" className="admin-page">
        <GrantAdminDashboard initialSelectedGrantId={selectedAdminGrantId} />
      </main>
    </div>
  );
}
