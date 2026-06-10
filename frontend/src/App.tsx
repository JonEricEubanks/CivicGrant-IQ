import { useState, useEffect } from "react";
import type { JSX } from "react";
import { IconBuilding } from "./components/Icons";
import { AppHeader } from "./components/AppHeader";
import { ChatInterface } from "./components/ChatInterface";
import { GrantScanner } from "./components/GrantScanner";
import { GrantAdminDashboard } from "./components/GrantAdminDashboard";
import { streamScan, searchGrantsGov } from "./api";
import type { GrantsGovResult } from "./api";
import { DemoTour } from "./components/DemoTour";
import type { CityProfile, PortfolioItem } from "./types";
import type { PipelineGrant } from "./components/GrantPipelineWidget";
import "./App.css";

// ─── Focus area → keyword map (for local relevance scoring) ─────────────────
const FOCUS_KEYWORDS: Record<string, string[]> = {
  "Transportation & Infrastructure": ["transportation", "highway", "road", "bridge", "trail", "transit", "pedestrian", "bike", "infrastructure", "corridor", "intersection", "signal", "mobility"],
  "Affordable Housing": ["housing", "affordable", "shelter", "rental", "homeownership", "community development", "cdbg", "home program"],
  "Water & Sewer": ["water", "sewer", "wastewater", "stormwater", "drinking water", "utility", "pipe", "drainage", "main replacement"],
  "Economic Development": ["economic", "business", "workforce", "employment", "job", "commerce", "revitalization", "brownfield"],
  "Public Safety": ["safety", "police", "fire", "emergency", "911", "violence", "security", "crime prevention"],
  "Parks & Recreation": ["park", "recreation", "trail", "green space", "playground", "open space", "sports", "greenway"],
  "Environmental / Climate": ["environment", "climate", "resilience", "green", "sustainability", "clean", "carbon", "tree", "air quality", "solar", "watershed", "flood"],
  "Broadband / Digital Equity": ["broadband", "internet", "digital", "connectivity", "fiber", "access", "equity", "telecommunications"],
  "Public Health": ["health", "wellness", "mental health", "opioid", "prevention", "disease", "medical", "behavioral"],
  "Historic Preservation": ["historic", "preservation", "heritage", "cultural", "landmark", "restoration", "rehabilitation"],
};

// Scored grant — extends GrantsGovResult with relevance metadata
interface ScoredGrant extends GrantsGovResult {
  awardCeilingFmt: string;
  relevanceScore: number;
  relevanceTier: "high" | "medium" | "low";
  relevanceReason: string;
  matchedArea: string | null;
}

function decodeTitle(raw: string): string {
  return raw
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/** Client-side relevance scoring against the city profile */
function scoreGrant(grant: GrantsGovResult, profile: CityProfile): Pick<ScoredGrant, "relevanceScore" | "relevanceTier" | "relevanceReason" | "matchedArea"> {
  const text = `${grant.title} ${grant.description}`.toLowerCase();
  let score = 0;
  let matchedArea: string | null = null;

  // +3 for each matched focus area (first match wins for category)
  for (const area of profile.focusAreas) {
    const kws = FOCUS_KEYWORDS[area] ?? [];
    if (kws.some((kw) => text.includes(kw))) {
      score += 3;
      if (!matchedArea) matchedArea = area;
    }
  }

  // +2 if capital projects text overlaps (extract meaningful words)
  const projectWords = profile.currentProjects
    .toLowerCase()
    .split(/[\s,;/]+/)
    .filter((w) => w.length > 4);
  if (projectWords.some((w) => text.includes(w))) score += 2;

  // +2 if explicitly municipal-eligible language
  if (/city|municipal|local government|unit of general|county|township/.test(text)) score += 2;

  // +1 for state-specific references
  if (text.includes(profile.state.toLowerCase())) score += 1;

  // Deadline sweet spot: open but not expiring tomorrow
  if (grant.closeDate) {
    const daysLeft = Math.ceil((new Date(grant.closeDate).getTime() - Date.now()) / 86400000);
    if (daysLeft > 7 && daysLeft < 180) score += 1;
  }

  const capped = Math.min(score, 10);
  const tier: "high" | "medium" | "low" = capped >= 6 ? "high" : capped >= 3 ? "medium" : "low";
  const reason =
    tier === "high"
      ? "Strong match — aligns with city priorities & active projects"
      : tier === "medium"
      ? "Partial match — relevant to at least one focus area"
      : "Low direct match — may be worth monitoring";

  return { relevanceScore: capped, relevanceTier: tier, relevanceReason: reason, matchedArea };
}

/** Group scored grants by matched focus area (or "Other Opportunities") */
function categorize(results: ScoredGrant[], focusAreas: string[]): Array<{ label: string; grants: ScoredGrant[] }> {
  const buckets: Record<string, ScoredGrant[]> = {};
  const other: ScoredGrant[] = [];

  for (const r of results) {
    if (r.matchedArea && focusAreas.includes(r.matchedArea)) {
      (buckets[r.matchedArea] ??= []).push(r);
    } else {
      other.push(r);
    }
  }

  // Maintain focus area order, then Other
  const sections = focusAreas
    .filter((a) => buckets[a]?.length)
    .map((a) => ({ label: a, grants: buckets[a] }));

  // Sort each section high→medium→low
  for (const s of sections) s.grants.sort((a, b) => b.relevanceScore - a.relevanceScore);

  if (other.length) sections.push({ label: "Other Opportunities", grants: other.sort((a, b) => b.relevanceScore - a.relevanceScore) });
  return sections;
}
// Convert PortfolioItem → PipelineGrant for the existing widget
function portfolioToPipeline(items: PortfolioItem[]): PipelineGrant[] {
  return items.map((item, i) => ({
    rank: i + 1,
    name: item.grantName,
    agency: item.agency,
    amount: item.fundingAmount,
    matchScore: item.matchScore,
    deadline: item.deadline,
    focusArea: item.focusArea,
    grantsGovUrl: (item as PortfolioItem & { grantsGovUrl?: string }).grantsGovUrl,
    fundingVerified: item.fundingVerified,
  }));
}

/** Compact dollar formatter: $X.XB / $XXXM / $X.XM / $XXK. */
function fmtMoney(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 100_000_000) return `$${Math.round(n / 1_000_000)}M`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n.toLocaleString()}`;
}

type Tab = "chat" | "scan" | "admin";

export default function App() {
  const [tab, setTab] = useState<Tab>("chat");
  const [isScanning, setIsScanning] = useState(false);
  const [scannerCollapsed, setScannerCollapsed] = useState(false);
  const [scanStatus, setScanStatus] = useState("");
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>([]);
  const [scanCity, setScanCity] = useState("");
  const [scanTotal, setScanTotal] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [scanProfile, setScanProfile] = useState<CityProfile | null>(null);
  const [totalGrantCount, setTotalGrantCount] = useState(5);

  // Live Grants.gov search — driven by focus areas, no manual keyword input
  const DEFAULT_FOCUS = ["Transportation & Infrastructure", "Water & Sewer", "Environmental / Climate"];
  const [liveFocusAreas, setLiveFocusAreas] = useState<string[]>(DEFAULT_FOCUS);
  const [liveResults, setLiveResults] = useState<ScoredGrant[]>([]);
  const [liveCategories, setLiveCategories] = useState<Array<{ label: string; grants: ScoredGrant[] }>>([]);
  const [liveTotal, setLiveTotal] = useState<number | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);

  // Debounce: whenever focus areas change, re-run live search after 600ms
  useEffect(() => {
    if (liveFocusAreas.length === 0) return;
    const timer = setTimeout(() => {
      runLiveSearch(liveFocusAreas, scanProfile);
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveFocusAreas]);

  const runLiveSearch = async (focusAreas: string[], profile: CityProfile | null) => {
    setLiveLoading(true);
    setLiveError(null);
    // Build keyword from first focus area for the Grants.gov query
    const keyword = focusAreas[0]?.split(" & ")[0]?.split(" / ")[0]?.toLowerCase() ?? "infrastructure";
    try {
      const res = await searchGrantsGov(keyword, focusAreas);
      const scored: ScoredGrant[] = (res.results as (GrantsGovResult & { awardCeilingFmt?: string })[]).map((r) => ({
        ...r,
        awardCeilingFmt: (r as { awardCeilingFmt?: string }).awardCeilingFmt ?? "",
        ...(profile ? scoreGrant(r, profile) : scoreGrant(r, { cityName: "Buffalo Grove", state: "IL", population: 41496, focusAreas, currentProjects: "" })),
      }));
      setLiveResults(scored);
      setLiveTotal(res.total);
      setLiveCategories(categorize(scored, focusAreas));
    } catch (err) {
      setLiveError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLiveLoading(false);
    }
  };

  // Called by GrantScanner when focus chips change
  const handleFocusChange = (areas: string[]) => {
    setLiveFocusAreas(areas);
  };

  const handleScan = async (profile: CityProfile) => {
    setIsScanning(true);
    setScanStatus("Portfolio Orchestrator: launching parallel grant analyses…");
    setPortfolioItems([]);
    setCompletedCount(0);
    setScanTotal(0);
    setTotalGrantCount(5);
    setScanCity(`${profile.cityName}, ${profile.state}`);
    setScanProfile(profile);
    setScannerCollapsed(true);
    // Update focus areas to match the scan profile — triggers live re-search via useEffect
    setLiveFocusAreas(profile.focusAreas);

    await streamScan(profile, {
      onStatus: (msg) => {
        setScanStatus(msg);
        // Extract the total from status messages like "1/8 analyzed" or "launching 8 parallel"
        const m = msg.match(/(\d+)\s*\/\s*\d+|launching\s+(\d+)\s*parallel/);
        if (m) {
          const n = parseInt(m[1] || m[2], 10);
          if (!isNaN(n) && n > 3) setTotalGrantCount(n);
        }
      },
      onPortfolioItem: (item) => {
        setCompletedCount((c) => c + 1);
        setPortfolioItems((prev) =>
          [...prev, item].sort((a, b) => b.matchScore - a.matchScore)
        );
        setScanTotal((prev) => prev + item.fundingAmount);
      },
      onPortfolioComplete: ({ grants, totalOpportunity }) => {
        setPortfolioItems([...grants].sort((a, b) => b.matchScore - a.matchScore));
        setScanTotal(totalOpportunity);
        // Mark totalGrantCount as the actual delivered count so the badge resolves.
        setTotalGrantCount(grants.length);
        setCompletedCount(grants.length);
      },
      onDone: () => setIsScanning(false),
      onError: (err) => { setScanStatus(`Error: ${err}`); setIsScanning(false); },
    });
    // Safety: always clear scanning if streamScan returns without onDone
    setIsScanning(false);
  };

  const tourButton = <DemoTour onNavigate={setTab} />;

  if (tab === "chat") {
    return <ChatInterface onSwitchToScan={() => setTab("scan")} onSwitchToAdmin={() => setTab("admin")} tourButton={tourButton} />;
  }

  if (tab === "admin") {
    return (
      <div className="app app--admin">
        <AppHeader active="admin" onNavigate={setTab} actions={tourButton} />
        <div className="admin-page">
          <GrantAdminDashboard />
        </div>
      </div>
    );
  }

  const pipelineGrants = portfolioToPipeline(portfolioItems);

  return (
    <div className="app app--scan">
      <AppHeader active="scan" onNavigate={setTab} actions={tourButton} />
      <div className="scan-page">
        <div className="scan-left">
          <GrantScanner onScan={handleScan} onFocusChange={handleFocusChange} isLoading={isScanning} collapsed={scannerCollapsed} onExpand={() => setScannerCollapsed(false)} onCollapse={scanProfile ? () => setScannerCollapsed(true) : undefined} />
            {isScanning && (
            <div className="scan-status">
              <div className="scan-spinner" />
              {scanStatus}
              {completedCount > 0 && (
                <span className="scan-progress-badge"> · {completedCount}/{totalGrantCount} complete</span>
              )}
            </div>
          )}
        </div>
        <div className="scan-right">
          {/* ── Unified Grant Intelligence Card (no tabs) ── */}
          <div className="intel-card">

            {/* Header */}
            <div className="intel-card-header">
              <div className="intel-card-title">
                <span className="intel-card-icon"><IconBuilding size={15} /></span>
                <span className="intel-card-city">{scanCity || "Grant Intelligence"}</span>
                {scanCity && <span className="intel-card-subtitle">Grant Intelligence</span>}
              </div>
              <div className="intel-header-stats">
                {liveTotal !== null && (
                  <div className="intel-hstat">
                    <span className="intel-hstat-dot" />
                    <div>
                      <div className="intel-hstat-val">{liveResults.filter(r => r.relevanceTier !== "low").length}</div>
                      <div className="intel-hstat-label">live matched</div>
                    </div>
                  </div>
                )}
                {(pipelineGrants.length > 0 || isScanning) && (
                  <div className="intel-hstat intel-hstat--ai">
                    <span className="intel-hstat-spark">✦</span>
                    <div>
                      <div className="intel-hstat-val">${(scanTotal / 1_000_000).toFixed(1)}M</div>
                      <div className="intel-hstat-label">AI portfolio</div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Animated scan progress bar */}
            {isScanning && (
              <div className="intel-scan-bar">
                <div
                  className="intel-scan-bar-fill"
                  style={{ width: `${totalGrantCount > 0 ? Math.max(8, Math.round((completedCount / totalGrantCount) * 100)) : 12}%` }}
                />
                <div className="intel-scan-bar-label">
                  <span className="intel-scan-live-dot" />
                  AI analyzing grants{completedCount > 0 ? ` · ${completedCount} of ${totalGrantCount} complete` : ""}
                  <span className="intel-scan-status-text">{scanStatus}</span>
                </div>
              </div>
            )}

            {/* Unified scrollable panel */}
            <div className="intel-unified-panel">

              {/* ── AI Section ── */}
              {(pipelineGrants.length > 0 || isScanning) && (
                <>
                  <div className="intel-section-hd">
                    <span className="intel-section-spark">✦</span>
                    <span className="intel-section-label">AI Recommendations</span>
                    {pipelineGrants.length > 0 && (
                      <span className="intel-section-meta">{pipelineGrants.length} grants · ${(scanTotal / 1_000_000).toFixed(1)}M portfolio</span>
                    )}
                    {isScanning && (
                      <span className="intel-section-streaming">
                        <span className="intel-tab-spinner" /> streaming
                      </span>
                    )}
                  </div>

                  {/* Skeleton loaders while waiting for first AI result */}
                  {isScanning && pipelineGrants.length === 0 && (
                    <div className="intel-skeletons">
                      {[0, 1, 2].map(i => (
                        <div key={i} className="intel-skeleton" style={{ animationDelay: `${i * 0.18}s` }} />
                      ))}
                    </div>
                  )}

                  {pipelineGrants.map((g, i) => (
                    <div
                      key={g.rank}
                      className={`intel-ai-card intel-ai-card--${g.matchScore >= 80 ? "high" : g.matchScore >= 60 ? "med" : "low"}`}
                      style={{ animationDelay: `${i * 0.05}s` }}
                    >
                      <div className="intel-ai-left">
                        <div className="intel-ai-rank">#{i + 1}</div>
                        <div className="intel-ai-ring">
                          <svg viewBox="0 0 36 36" className="intel-ai-ring-svg">
                            <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3.2" />
                            <circle
                              cx="18" cy="18" r="15.9" fill="none"
                              stroke={g.matchScore >= 80 ? "#22c55e" : g.matchScore >= 60 ? "#f59e0b" : "#94a3b8"}
                              strokeWidth="3.2"
                              strokeDasharray={`${g.matchScore} 100`}
                              strokeLinecap="round"
                              transform="rotate(-90 18 18)"
                            />
                          </svg>
                          <span className="intel-ai-ring-pct">{g.matchScore}%</span>
                        </div>
                      </div>
                      <div className="intel-ai-body">
                        <div className="intel-ai-name">{g.name}</div>
                        <div className="intel-ai-meta">
                          <span className="intel-ai-agency">{g.agency}</span>
                          {g.focusArea && <span className="intel-ai-tag">{g.focusArea}</span>}
                          {g.fundingVerified && <span className="intel-ai-verified">✓ verified</span>}
                        </div>
                      </div>
                      <div className="intel-ai-right">
                        <span className="intel-ai-amount">{fmtMoney(g.amount)}</span>
                        <button
                          className="intel-ai-btn"
                          onClick={() => {
                            setTab("chat");
                            setTimeout(() => {
                              const el = document.querySelector<HTMLTextAreaElement>(".chat-input");
                              if (el) {
                                const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
                                setter?.call(el, `Analyze ${g.name} (${g.agency}) for ${scanCity}`);
                                el.dispatchEvent(new Event("input", { bubbles: true }));
                                el.focus();
                              }
                            }, 250);
                          }}
                        >
                          Deep Dive →
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {/* ── Live Grants.gov section divider ── */}
              <div className="intel-section-hd intel-section-hd--live">
                <span className="intel-live-dot-pulse" />
                <span className="intel-section-label">Live on Grants.gov</span>
                {liveTotal !== null && !liveLoading && (
                  <span className="intel-section-meta">
                    {liveResults.filter(r => r.relevanceTier !== "low").length} matched · {liveTotal.toLocaleString()} open
                  </span>
                )}
                {liveLoading && <span className="intel-tab-spinner" />}
              </div>

              {/* Focus pills */}
              <div className="intel-focus-row">
                <span className="intel-focus-label">Matching:</span>
                {liveFocusAreas.map((a) => (
                  <span key={a} className="intel-focus-pill">{a}</span>
                ))}
              </div>

              {liveError && <div className="live-search-error">{liveError}</div>}

              {liveLoading && (
                <div className="intel-loading">
                  <div className="scan-spinner" />
                  Searching Grants.gov…
                </div>
              )}

              {!liveLoading && liveCategories.length > 0 && (
                <div className="live-results-list">
                  {liveCategories.map(({ label, grants }) => (
                    <div key={label} className="live-category-section">
                      <div className={`live-category-header ${label === "Other Opportunities" ? "live-category-header--other" : ""}`}>
                        <span className="live-category-label">{label}</span>
                        <span className="live-category-count">{grants.length} grant{grants.length !== 1 ? "s" : ""}</span>
                      </div>
                      {grants.map((r) => {
                        const title = decodeTitle(r.title);
                        let deadlineBadge: JSX.Element | null = null;
                        if (r.closeDate) {
                          const daysLeft = Math.ceil((new Date(r.closeDate).getTime() - Date.now()) / 86400000);
                          const cls = daysLeft <= 14 ? "urgent" : daysLeft <= 45 ? "soon" : "open";
                          const label2 = daysLeft <= 0 ? "Closing" : daysLeft <= 14 ? `${daysLeft}d left` : daysLeft <= 45 ? `${daysLeft}d left` : `Closes ${r.closeDate}`;
                          deadlineBadge = <span className={`live-result-deadline-badge ${cls}`}>{label2}</span>;
                        } else {
                          deadlineBadge = <span className="live-result-deadline-badge ongoing">Rolling</span>;
                        }
                        return (
                          <div key={r.id} className="live-result-card">
                            <div className="live-result-top">
                              <span className="live-result-title">{title}</span>
                              <div className="live-result-badges">
                                <span className={`relevance-badge relevance-badge--${r.relevanceTier}`}>
                                  {r.relevanceTier === "high" ? "Strong match" : r.relevanceTier === "medium" ? "Relevant" : "Low match"}
                                </span>
                                {deadlineBadge}
                              </div>
                            </div>
                            <div className="live-result-meta">
                              <span className="live-result-agency-badge"><IconBuilding size={11} /> {r.agency}</span>
                              {r.number && <span className="live-result-num">{r.number}</span>}
                              {r.cfda && <span className="live-result-cfda">CFDA {r.cfda}</span>}
                            </div>
                            {r.relevanceReason && r.relevanceTier !== "low" && (
                              <div className={`live-result-reason live-result-reason--${r.relevanceTier}`}>
                                {r.relevanceReason}
                              </div>
                            )}
                            {r.description && (
                              <p className="live-result-desc">{r.description.slice(0, 180)}{r.description.length > 180 ? "…" : ""}</p>
                            )}
                            <div className="live-result-actions">
                              <a href={r.url} target="_blank" rel="noopener noreferrer" className="live-result-link">
                                View on Grants.gov ↗
                              </a>
                              <button
                                className={`live-result-analyze ${r.relevanceTier === "high" ? "live-result-analyze--priority" : ""}`}
                                onClick={() => {
                                  setTab("chat");
                                  setTimeout(() => {
                                    const el = document.querySelector<HTMLTextAreaElement>(".chat-input");
                                    if (el) {
                                      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
                                      const cityCtx = scanProfile ? `${scanProfile.cityName}, ${scanProfile.state}` : "Buffalo Grove, IL";
                                      setter?.call(el, `Analyze the "${title}" grant (${r.agency}, opportunity ${r.number}) for ${cityCtx}.`);
                                      el.dispatchEvent(new Event("input", { bubbles: true }));
                                      el.focus();
                                    }
                                  }, 250);
                                }}
                              >
                                {r.relevanceTier === "high" ? "Analyze — Top Pick →" : "Analyze →"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}

              {!liveLoading && liveTotal === null && !liveError && !isScanning && pipelineGrants.length === 0 && (
                <div className="intel-empty-state">
                  Live grants load automatically — select focus areas above
                </div>
              )}

            </div>{/* /intel-unified-panel */}
          </div>{/* /intel-card */}
        </div>
      </div>
    </div>
  );
}
