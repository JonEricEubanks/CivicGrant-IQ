import { useState, useEffect } from "react";
import type { JSX } from "react";
import { IconBuilding, IconChat, IconSearch } from "./components/Icons";
import { ChatInterface } from "./components/ChatInterface";
import { GrantScanner } from "./components/GrantScanner";
import { streamScan, searchGrantsGov } from "./api";
import type { GrantsGovResult } from "./api";
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
  }));
}

type Tab = "chat" | "scan";

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

  // Intelligence panel tab: "ai" = AI portfolio, "live" = Grants.gov live
  const [intelligenceTab, setIntelligenceTab] = useState<"ai" | "live">("live");

  const handleScan = async (profile: CityProfile) => {
    setIsScanning(true);
    setScanStatus("Portfolio Orchestrator: launching 5 parallel grant analyses…");
    setPortfolioItems([]);
    setCompletedCount(0);
    setScanTotal(0);
    setScanCity(`${profile.cityName}, ${profile.state}`);
    setScanProfile(profile);
    setScannerCollapsed(true);
    // Update focus areas to match the scan profile — triggers live re-search via useEffect
    setLiveFocusAreas(profile.focusAreas);
    // Switch to AI tab so user sees results streaming in
    setIntelligenceTab("ai");

    await streamScan(profile, {
      onStatus: (msg) => setScanStatus(msg),
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
      },
      onDone: () => setIsScanning(false),
      onError: (err) => { setScanStatus(`Error: ${err}`); setIsScanning(false); },
    });
  };

  if (tab === "chat") {
    return <ChatInterface onSwitchToScan={() => setTab("scan")} />;
  }

  const pipelineGrants = portfolioToPipeline(portfolioItems);

  return (
    <div className="app app--scan">
      <header className="app-header">
        <div className="header-brand">
          <span className="header-icon"><IconBuilding size={22} /></span>
          <span className="header-name">CivicGrant IQ</span>
          <span className="header-tag">Municipal Revenue Intelligence</span>
        </div>
        <nav className="header-tabs">
          <button className="tab-btn" onClick={() => setTab("chat")}><IconChat size={14} /> Analyze Grant</button>
          <button className="tab-btn tab-btn--active"><IconSearch size={14} /> Scan My City</button>
        </nav>
        <div className="header-badge">
          <span className="badge-dot" />
          Powered by Microsoft Foundry IQ
        </div>
      </header>
      <div className="scan-page">
        <div className="scan-left">
          <GrantScanner onScan={handleScan} onFocusChange={handleFocusChange} isLoading={isScanning} collapsed={scannerCollapsed} onExpand={() => setScannerCollapsed(false)} onCollapse={scanProfile ? () => setScannerCollapsed(true) : undefined} />
          {isScanning && (
            <div className="scan-status">
              <div className="scan-spinner" />
              {scanStatus}
              {completedCount > 0 && (
                <span className="scan-progress-badge"> · {completedCount}/5 complete</span>
              )}
            </div>
          )}
        </div>
        <div className="scan-right">
        {/* ── Unified Grant Intelligence Card ── */}
        {(pipelineGrants.length > 0 || liveTotal !== null || liveLoading || isScanning) && (
          <div className="intel-card">
            {/* Card header — city + total */}
            <div className="intel-card-header">
              <div className="intel-card-title">
                <span className="intel-card-icon"><IconBuilding size={15} /></span>
                <span className="intel-card-city">{scanCity || "Buffalo Grove, IL"}</span>
                <span className="intel-card-subtitle">Grant Intelligence</span>
              </div>
              {pipelineGrants.length > 0 && (
                <div className="intel-card-total">
                  <span className="intel-card-total-label">AI Portfolio Value</span>
                  <span className="intel-card-total-amount">${(scanTotal / 1_000_000).toFixed(1)}M</span>
                </div>
              )}
            </div>

            {/* Tab switcher */}
            <div className="intel-tabs">
              <button
                className={`intel-tab ${intelligenceTab === "ai" ? "intel-tab--active" : ""}`}
                onClick={() => setIntelligenceTab("ai")}
              >
                <span className="intel-tab-label">AI Recommendations</span>
                {pipelineGrants.length > 0 && (
                  <span className="intel-tab-badge">{pipelineGrants.length}</span>
                )}
                {isScanning && <span className="intel-tab-spinner" />}
              </button>
              <button
                className={`intel-tab ${intelligenceTab === "live" ? "intel-tab--active" : ""}`}
                onClick={() => setIntelligenceTab("live")}
              >
                <span className="intel-tab-dot" />
                <span className="intel-tab-label">Live on Grants.gov</span>
                {liveTotal !== null && (
                  <span className="intel-tab-badge intel-tab-badge--live">{liveResults.filter(r => r.relevanceTier !== "low").length} matched</span>
                )}
                {liveLoading && <span className="intel-tab-spinner" />}
              </button>
            </div>

            {/* ── AI Recommendations tab ── */}
            {intelligenceTab === "ai" && (
              <div className="intel-panel">
                {isScanning && pipelineGrants.length === 0 && (
                  <div className="intel-scanning-state">
                    <div className="scan-spinner" />
                    <div>
                      <div className="intel-scanning-title">AI analyzing grant landscape…</div>
                      <div className="intel-scanning-sub">{scanStatus}</div>
                    </div>
                  </div>
                )}
                {isScanning && pipelineGrants.length > 0 && (
                  <div className="intel-streaming-badge">
                    <span className="scan-live-dot" /> Results streaming in — {completedCount}/5 analyzed
                  </div>
                )}
                {pipelineGrants.length > 0 && (
                  <div className="intel-pipeline-list">
                    {pipelineGrants.map((g, i) => (
                      <div key={g.rank} className="intel-pipeline-row">
                        <span className="intel-rank">#{i + 1}</span>
                        <div className="intel-pipeline-body">
                          <div className="intel-pipeline-name">{g.name}</div>
                          <div className="intel-pipeline-meta">
                            <span className="intel-pipeline-agency">{g.agency}</span>
                            {g.focusArea && <span className="intel-pipeline-tag">{g.focusArea}</span>}
                          </div>
                          <div className="intel-pipeline-bar-row">
                            <div className="intel-pipeline-bar-track">
                              <div
                                className={`intel-pipeline-bar-fill ${g.matchScore >= 80 ? "intel-bar--high" : g.matchScore >= 60 ? "intel-bar--med" : "intel-bar--low"}`}
                                style={{ width: `${g.matchScore}%` }}
                              />
                            </div>
                            <span className="intel-pipeline-pct">{g.matchScore}%</span>
                          </div>
                        </div>
                        <div className="intel-pipeline-right">
                          <span className="intel-pipeline-amt">${(g.amount / 1_000_000).toFixed(1)}M</span>
                          <button
                            className="intel-analyze-btn"
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
                            Analyze →
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {!isScanning && pipelineGrants.length === 0 && (
                  <div className="intel-empty-state">
                    Run a city scan to get AI-ranked grant recommendations for {scanCity || "your city"}
                  </div>
                )}
              </div>
            )}

            {/* ── Live Grants.gov tab ── */}
            {intelligenceTab === "live" && (
              <div className="intel-panel">
                {/* Focus pills */}
                <div className="intel-focus-row">
                  <span className="intel-focus-label">Matching:</span>
                  {liveFocusAreas.map((a) => (
                    <span key={a} className="intel-focus-pill">{a}</span>
                  ))}
                </div>

                {liveTotal !== null && !liveError && (
                  <div className="intel-live-meta">
                    <strong>{liveResults.filter(r => r.relevanceTier !== "low").length}</strong> relevant · <strong>{liveResults.filter(r => r.relevanceTier === "high").length}</strong> strong match · {liveTotal.toLocaleString()} total open
                  </div>
                )}

                {liveLoading && (
                  <div className="intel-loading">
                    <div className="scan-spinner" />
                    Searching Grants.gov…
                  </div>
                )}

                {liveError && <div className="live-search-error">{liveError}</div>}

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

                {!liveLoading && liveTotal === null && !liveError && (
                  <div className="intel-empty-state">
                    Select focus areas above to see live matching grants from Grants.gov
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Show intel card shell even before first scan so live tab is visible */}
        {(pipelineGrants.length === 0 && liveTotal === null && !liveLoading && !isScanning) && (
          <div className="intel-card">
            <div className="intel-card-header">
              <div className="intel-card-title">
                <span className="intel-card-icon"><IconBuilding size={15} /></span>
                <span className="intel-card-city">Grant Intelligence</span>
              </div>
            </div>
            <div className="intel-tabs">
              <button className="intel-tab" disabled>
                <span className="intel-tab-label">AI Recommendations</span>
                <span className="intel-tab-badge intel-tab-badge--empty">Run scan</span>
              </button>
              <button
                className="intel-tab intel-tab--active"
                onClick={() => setIntelligenceTab("live")}
              >
                <span className="intel-tab-dot" />
                <span className="intel-tab-label">Live on Grants.gov</span>
                {liveLoading && <span className="intel-tab-spinner" />}
              </button>
            </div>
            <div className="intel-panel">
              <div className="intel-focus-row">
                <span className="intel-focus-label">Matching:</span>
                {liveFocusAreas.map((a) => <span key={a} className="intel-focus-pill">{a}</span>)}
              </div>
              <div className="intel-empty-state">
                Live grants load automatically · Run a scan to get AI recommendations
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
