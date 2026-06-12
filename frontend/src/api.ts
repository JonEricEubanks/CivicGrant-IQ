const API_BASE = import.meta.env.VITE_API_URL || "/api";

type SSEHandler = {
  onStatus?: (msg: string) => void;
  onMeta?: (data: { isFollowUp: boolean }) => void;
  onRoutingDecision?: (data: { intent: string; sources: string[]; widgetType: string }) => void;
  onWorkIqContext?: (data: import("./types").WorkIqCityContext) => void;
  onAgentStatus?: (data: { agent: string; message: string }) => void;
  onReasoningStep?: (step: import("./types").ReasoningStep) => void;
  onCitations?: (citations: import("./types").Citation[]) => void;
  onDecision?: (decision: import("./types").OrchestrationDecision) => void;
  onAnswerChunk?: (content: string) => void;
  onAnswer?: (data: { threadId: string; runId: string; content: string }) => void;
  onWidget?: (widget: { type: string; data: unknown }) => void;
  onReview?: (data: import("./types").RedTeamResult) => void;
  onCompetitorIntel?: (data: import("./types").CompetitorIntelResult) => void;
  onRefinedNarrative?: (data: import("./types").RefinedNarrativeResult) => void;
  onAgentHandoff?: (data: import("./types").AgentHandoff) => void;
  onTierInfo?: (data: { tier: number; label: string; guardrailsPassed: boolean; violations: number }) => void;
  onGraphPaths?: (data: { paths: import("./types").GraphPath[] }) => void;
  onDone?: (threadId: string) => void;
  onError?: (msg: string) => void;
};

export async function streamChat(
  message: string,
  threadId: string | undefined,
  handlers: SSEHandler
): Promise<void> {
  const res = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, threadId }),
  });

  if (!res.ok || !res.body) {
    handlers.onError?.(`Request failed: ${res.statusText}`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const lines = part.split("\n");
      let event = "message";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) event = line.slice(7);
        if (line.startsWith("data: ")) data = line.slice(6);
      }
      if (!data) continue;
      try {
        const parsed = JSON.parse(data);
        if (event === "status") handlers.onStatus?.(parsed.message);
        if (event === "meta") handlers.onMeta?.(parsed);
        if (event === "routing_decision") handlers.onRoutingDecision?.(parsed);
        if (event === "work_iq_context") handlers.onWorkIqContext?.(parsed);
        if (event === "agent_status") handlers.onAgentStatus?.(parsed);
        if (event === "reasoning_step") handlers.onReasoningStep?.(parsed);
        if (event === "citations") handlers.onCitations?.(parsed.citations);
        if (event === "decision") handlers.onDecision?.(parsed);
        if (event === "answer_chunk") handlers.onAnswerChunk?.(parsed.content);
        if (event === "widget") handlers.onWidget?.(parsed);
        if (event === "tier_info") handlers.onTierInfo?.(parsed);
        if (event === "graph_paths") handlers.onGraphPaths?.(parsed);
        if (event === "review") handlers.onReview?.(parsed);
        if (event === "competitor_intel") handlers.onCompetitorIntel?.(parsed);
        if (event === "refined_narrative") handlers.onRefinedNarrative?.(parsed);
        if (event === "agent_handoff") handlers.onAgentHandoff?.(parsed);
        if (event === "answer") handlers.onAnswer?.(parsed);
        if (event === "done") handlers.onDone?.(parsed.threadId);
        if (event === "error") handlers.onError?.(parsed.message);
      } catch {
        // ignore parse errors on incomplete chunks
      }
    }
  }
}

export async function fetchCityContext(): Promise<import("./types").WorkIqCityContext> {
  const res = await fetch(`${API_BASE}/work-iq/context`);
  if (!res.ok) throw new Error(`Work IQ context failed: ${res.statusText}`);
  return res.json();
}

export async function refreshCityContext(): Promise<import("./types").WorkIqCityContext> {
  const res = await fetch(`${API_BASE}/work-iq/refresh`, { method: "POST" });
  if (!res.ok) throw new Error(`Work IQ refresh failed: ${res.statusText}`);
  return res.json();
}

// ─── Fabric IQ context ────────────────────────────────────────────────────

export interface FabricIqContext {
  source: "fabric-live" | "fabric-partial" | "fabric-offline";
  pulledAt: string;
  workspaceId: string;
  items: { name: string; type: string }[];
  tables: string[];
  grantRows: Record<string, string | number | boolean | null>[];
  graphPaths: unknown;
  semanticModelName: string | null;
  error?: string;
}

export async function fetchFabricContext(): Promise<FabricIqContext> {
  const res = await fetch(`${API_BASE}/fabric-iq/context`);
  if (!res.ok) throw new Error(`Fabric IQ context failed: ${res.statusText}`);
  return res.json();
}

export async function refreshFabricContext(): Promise<FabricIqContext> {
  const res = await fetch(`${API_BASE}/fabric-iq/refresh`, { method: "POST" });
  if (!res.ok) throw new Error(`Fabric IQ refresh failed: ${res.statusText}`);
  return res.json();
}

export async function streamScan(
  profile: import("./types").CityProfile,
  handlers: SSEHandler & {
    onScanActivity?: (a: import("./types").ScanActivity) => void;
    onPortfolioItem?: (item: import("./types").PortfolioItem) => void;
    onPortfolioComplete?: (data: { grants: import("./types").PortfolioItem[]; totalOpportunity: number }) => void;
    onResults?: (data: { threadId: string; content: string }) => void;
  }
): Promise<void> {
  const res = await fetch(`${API_BASE}/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  });

  if (!res.ok || !res.body) {
    handlers.onError?.(`Request failed: ${res.statusText}`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const lines = part.split("\n");
      let event = "message";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) event = line.slice(7);
        if (line.startsWith("data: ")) data = line.slice(6);
      }
      if (!data) continue;
      try {
        const parsed = JSON.parse(data);
        if (event === "status") handlers.onStatus?.(parsed.message);
        if (event === "citations") handlers.onCitations?.(parsed.citations);
        if (event === "scan_activity") handlers.onScanActivity?.(parsed);
        if (event === "portfolio_item") handlers.onPortfolioItem?.(parsed);
        if (event === "portfolio_complete") handlers.onPortfolioComplete?.(parsed);
        if (event === "results") handlers.onResults?.(parsed);
        if (event === "done") handlers.onDone?.("");
        if (event === "error") handlers.onError?.(parsed.message);
      } catch {
        // ignore
      }
    }
  }
}

export async function generatePackage(
  widget: unknown,
  analysisText: string,
  title: string
): Promise<{ html: string; title: string }> {
  const res = await fetch(`${API_BASE}/package`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ widget, analysisText, title }),
  });
  if (!res.ok) throw new Error(`Package generation failed: ${res.statusText}`);
  return res.json() as Promise<{ html: string; title: string }>;
}

/**
 * Recreate a full submission-ready application by adapting Buffalo Grove's
 * proven past application (retrieved from Foundry IQ) to the target grant.
 * Returns a styled, printable HTML document.
 */
export async function draftApplication(input: {
  grantName: string;
  agency?: string;
  fundingAmount?: number;
  awardRange?: string;
  matchScore?: number;
  analysisText?: string;
}): Promise<{ html: string; title: string; precedentTitle: string; grounded: boolean }> {
  const res = await fetch(`${API_BASE}/draft-application`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Draft application failed: ${res.statusText}`);
  return res.json() as Promise<{ html: string; title: string; precedentTitle: string; grounded: boolean }>;
}

export interface FetchedUrl {
  url: string;
  title: string;
  text: string;
  wordCount: number;
}

/**
 * Fetch a remote URL server-side and return extracted plain text.
 * Use this to let users paste a grant announcement URL and have the
 * full page content injected as context for the agent.
 */
export async function fetchGrantUrl(url: string): Promise<FetchedUrl> {
  const res = await fetch(`${API_BASE}/fetch-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
    throw new Error(err.error ?? res.statusText);
  }
  return res.json() as Promise<FetchedUrl>;
}

export interface GrantsGovResult {
  id: string;
  title: string;
  agency: string;
  number: string;
  closeDate: string | null;
  awardCeilingFmt: string;
  awardFloorFmt: string;
  description: string;
  url: string;
  cfda: string;
  postedDate: string | null;
}

export interface GrantsSearchResponse {
  results: GrantsGovResult[];
  total: number;
  keyword: string;
  source: string;
}

/**
 * Live search against Grants.gov public API.
 * Returns open opportunities eligible for city/township governments.
 */
export async function searchGrantsGov(
  keywords: string,
  focusAreas: string[] = [],
  categories?: string
): Promise<GrantsSearchResponse> {
  const res = await fetch(`${API_BASE}/grants-search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keywords, focusAreas, categories }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
    throw new Error(err.error ?? res.statusText);
  }
  return res.json() as Promise<GrantsSearchResponse>;
}

// ─── Hero grants ──────────────────────────────────────────────────────────────
export interface HeroGrantResult {
  name: string;
  agency: string;
  match: number;
  funding: string | null;
  daysLeft: number | null;
  awardCeiling: number | null;
  closeDate: string | null;
  prompt: string;
  /** Real Grants.gov opportunity URL when the card is live; null for curated fallback */
  url?: string | null;
  /** True when this card came from the live Grants.gov API */
  live?: boolean;
}

export interface HeroGrantsResponse {
  grants: HeroGrantResult[];
  totalMillion: number;
  /** Number of distinct open federal programs the total is summed across */
  programCount?: number;
  source: "live" | "fallback";
}

/**
 * Fetch live grant metadata for the landing page hero cards.
 * Never throws — returns null on any network error so the UI
 * can fall back to the hardcoded curated values.
 */
export async function fetchHeroGrants(): Promise<HeroGrantsResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/hero-grants`);
    if (!res.ok) return null;
    return res.json() as Promise<HeroGrantsResponse>;
  } catch {
    return null;
  }
}

// ─── Monitor types ────────────────────────────────────────────────────────────
export interface RunLogEntry {
  id: string;
  ts: string;
  querySnippet: string;
  latencyMs: number;
  matchScore?: number;
  success: boolean;
  kbSource?: "azure_search" | "local_kb";
}

export interface MonitorData {
  stats: {
    totalRuns: number;
    successRate: number;
    avgLatencyMs: number;
    avgMatchScore: number;
    lastRunAt: string | null;
  };
  recentRuns: RunLogEntry[];
  evalScores: {
    runAt: string;
    model: string;
    summary: { pass: number; total: number; avgScore: number; avgLatencyMs: number };
    results: Array<{
      id: string;
      name: string;
      category: string;
      overall: number;
      scores: { groundedness: number; relevance: number; coherence: number; safety: number };
      keywordsFound: boolean;
    }>;
  };
  appInsightsUrl: string;
}

/**
 * Fetches live agent telemetry for the in-app Intelligence Monitor panel.
 */
export async function fetchMonitor(): Promise<MonitorData> {
  const res = await fetch(`${API_BASE}/monitor`);
  if (!res.ok) throw new Error(`Monitor fetch failed: ${res.statusText}`);
  return res.json() as Promise<MonitorData>;
}

// ─── Grant Administration ─────────────────────────────────────────────────────

export interface AdminPortfolio {
  grants: import("./types").AdminGrant[];
  stats: import("./types").AdminPortfolioStats;
  fabricLive?: boolean;
  fabricPulledAt?: string | null;
}

/**
 * Load the full grant portfolio (static, no AI).
 */
export async function fetchAdminPortfolio(): Promise<AdminPortfolio> {
  const res = await fetch(`${API_BASE}/admin-chat/portfolio`);
  if (!res.ok) throw new Error(`Portfolio fetch failed: ${res.statusText}`);
  return res.json() as Promise<AdminPortfolio>;
}

/**
 * Fetch live open grant opportunities from the grants.gov public API.
 * Returns actual current postings — no AI involved, low latency.
 */
export async function fetchLiveGrants(
  keywords: string,
  rows = 10
): Promise<import("./types").LiveGrantsResponse> {
  const params = new URLSearchParams({ keywords, rows: String(rows) });
  const res = await fetch(`${API_BASE}/grants-live?${params.toString()}`);
  if (!res.ok) throw new Error(`grants-live fetch failed: ${res.statusText}`);
  return res.json() as Promise<import("./types").LiveGrantsResponse>;
}

type AdminSSEHandlers = {
  onStatus?: (msg: string) => void;
  onAnswerChunk?: (content: string) => void;
  onAnswer?: (content: string) => void;
  onWidget?: (widget: { type: string; data: import("./types").AdminWidgetData }) => void;
  onDone?: () => void;
  onError?: (msg: string) => void;
};

/**
 * Stream a grant administration question to the AI agent.
 * Optionally scoped to a specific grant (grantId) or portfolio-wide.
 */
export async function streamAdminChat(
  message: string,
  grantId: string | undefined,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  handlers: AdminSSEHandlers
): Promise<void> {
  const res = await fetch(`${API_BASE}/admin-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, grantId, history }),
  });

  if (!res.ok || !res.body) {
    handlers.onError?.(`Request failed: ${res.statusText}`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const lines = part.split("\n");
      let event = "message";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) event = line.slice(7);
        if (line.startsWith("data: ")) data = line.slice(6);
      }
      if (!data) continue;
      try {
        const parsed = JSON.parse(data) as Record<string, unknown>;
        if (event === "status") handlers.onStatus?.(parsed.message as string);
        if (event === "answer_chunk") handlers.onAnswerChunk?.(parsed.content as string);
        if (event === "widget") handlers.onWidget?.(parsed as { type: string; data: import("./types").AdminWidgetData });
        if (event === "answer") handlers.onAnswer?.(parsed.content as string);
        if (event === "done") handlers.onDone?.();
        if (event === "error") handlers.onError?.(parsed.message as string);
      } catch {
        // ignore parse errors on incomplete chunks
      }
    }
  }
}

// ─── Report Generation ────────────────────────────────────────────────────────

export type ReportType = "quarterly" | "sf425" | "closeout";

type ReportSSEHandlers = {
  onStatus?: (msg: string) => void;
  onHtmlChunk?: (content: string) => void;
  onHtmlDone?: (data: { html: string; title: string; grantName: string }) => void;
  onDone?: () => void;
  onError?: (msg: string) => void;
};

/**
 * Stream generation of a federal compliance report (SF-PPR quarterly, SF-425, or closeout).
 * The agent writes a complete, submission-ready HTML document using real grant data.
 */
export async function streamGenerateReport(
  grantId: string,
  reportType: ReportType,
  handlers: ReportSSEHandlers
): Promise<void> {
  const res = await fetch(`${API_BASE}/generate-report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grantId, reportType }),
  });

  if (!res.ok || !res.body) {
    handlers.onError?.(`Request failed: ${res.statusText}`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const lines = part.split("\n");
      let event = "message";
      let data = "";
      for (const line of lines) {
        if (line.startsWith("event: ")) event = line.slice(7);
        if (line.startsWith("data: ")) data = line.slice(6);
      }
      if (!data) continue;
      try {
        const parsed = JSON.parse(data) as Record<string, unknown>;
        if (event === "status") handlers.onStatus?.(parsed.message as string);
        if (event === "html_chunk") handlers.onHtmlChunk?.(parsed.content as string);
        if (event === "html_done") handlers.onHtmlDone?.(parsed as { html: string; title: string; grantName: string });
        if (event === "done") handlers.onDone?.();
        if (event === "error") handlers.onError?.(parsed.message as string);
      } catch {
        // ignore
      }
    }
  }
}
