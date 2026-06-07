/**
 * telemetry.ts — OpenTelemetry + Azure Application Insights instrumentation
 *
 * MUST be imported FIRST in index.ts (before any other app code) so the
 * auto-instrumentation hooks are registered before modules load.
 *
 * Provides:
 *  - Distributed traces for every HTTP request, outbound fetch, and agent run
 *  - Custom spans: grant_analysis, kb_search, red_team_review, competitive_intel
 *  - Custom metrics: agent latency, token usage, match scores
 *  - All data flows to Azure Application Insights (civicgrant-insights)
 */

import { useAzureMonitor } from "@azure/monitor-opentelemetry";
import { metrics, trace, context, SpanStatusCode } from "@opentelemetry/api";
import type { Span } from "@opentelemetry/api";

// ─── Bootstrap Azure Monitor (call once at process start) ────────────────────
export function initTelemetry(): void {
  const connStr = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
  if (!connStr) {
    console.warn("[Telemetry] APPLICATIONINSIGHTS_CONNECTION_STRING not set — telemetry disabled");
    return;
  }

  useAzureMonitor({
    azureMonitorExporterOptions: { connectionString: connStr },
    // Capture outbound HTTP (fetch to Azure Search, Azure OpenAI, Foundry)
    instrumentationOptions: {
      http: { enabled: true },
    },
  });

  console.log("[Telemetry] Azure Monitor OpenTelemetry initialized");
}

// ─── Tracer + Meter singletons ────────────────────────────────────────────────
const tracer = trace.getTracer("civicgrant-iq", "1.0.0");
const meter  = metrics.getMeter("civicgrant-iq", "1.0.0");

// ─── Custom metrics ───────────────────────────────────────────────────────────
const agentLatencyHist = meter.createHistogram("civicgrant.agent.latency_ms", {
  description: "End-to-end latency of a full grant analysis run in milliseconds",
  unit: "ms",
});

const matchScoreHist = meter.createHistogram("civicgrant.agent.match_score", {
  description: "Grant match score returned by the agent (0–100)",
  unit: "{score}",
});

const kbSearchLatencyHist = meter.createHistogram("civicgrant.kb.search_latency_ms", {
  description: "Knowledge base retrieval latency in milliseconds",
  unit: "ms",
});

const subAgentLatencyHist = meter.createHistogram("civicgrant.subagent.latency_ms", {
  description: "Sub-agent (red team / competitive intel) latency in milliseconds",
  unit: "ms",
});

const agentRunCounter = meter.createCounter("civicgrant.agent.runs_total", {
  description: "Total number of grant analysis runs",
});

const agentErrorCounter = meter.createCounter("civicgrant.agent.errors_total", {
  description: "Total number of agent errors",
});

// ─── Span helpers ─────────────────────────────────────────────────────────────

/**
 * Wrap an async function in an OTel span with automatic error recording.
 */
export async function withSpan<T>(
  spanName: string,
  attributes: Record<string, string | number | boolean>,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return tracer.startActiveSpan(spanName, async (span) => {
    span.setAttributes(attributes);
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  });
}

// ─── Grant analysis instrumentation ─────────────────────────────────────────

export function recordAgentRun(opts: {
  query: string;
  latencyMs: number;
  matchScore?: number;
  success: boolean;
  threadId?: string;
  kbSource?: "azure_search" | "local_kb";
}): void {
  const attrs = { "civicgrant.query.length": opts.query.length, success: String(opts.success) };
  agentRunCounter.add(1, attrs);
  agentLatencyHist.record(opts.latencyMs, attrs);
  if (!opts.success) agentErrorCounter.add(1, attrs);
  if (opts.matchScore !== undefined) {
    matchScoreHist.record(opts.matchScore, {
      "civicgrant.thread_id": opts.threadId ?? "unknown",
    });
  }
  // Also push to in-memory ring buffer for the in-app monitor panel
  pushRunToLog({
    querySnippet: opts.query.slice(0, 80),
    latencyMs: opts.latencyMs,
    matchScore: opts.matchScore,
    success: opts.success,
    kbSource: opts.kbSource,
  });
}

export function recordKbSearch(latencyMs: number, hitCount: number, source: "azure_search" | "local_kb"): void {
  kbSearchLatencyHist.record(latencyMs, {
    "civicgrant.kb.source": source,
    "civicgrant.kb.hits": hitCount,
  });
}

export function recordSubAgent(agentName: string, latencyMs: number, success: boolean): void {
  subAgentLatencyHist.record(latencyMs, {
    "civicgrant.subagent.name": agentName,
    success: String(success),
  });
}

// ─── Re-export OTel primitives for use in other files ─────────────────────────
export { tracer, context, SpanStatusCode };

// ─── In-memory run log (ring buffer, last 50 runs) ────────────────────────────
export interface RunLogEntry {
  id: string;
  ts: string;          // ISO timestamp
  querySnippet: string;
  latencyMs: number;
  matchScore?: number;
  success: boolean;
  kbSource?: "azure_search" | "local_kb";
}

const RUN_LOG_MAX = 50;
const _runLog: RunLogEntry[] = [];

export function pushRunToLog(entry: Omit<RunLogEntry, "id" | "ts">): void {
  _runLog.unshift({
    id: Math.random().toString(36).slice(2, 9),
    ts: new Date().toISOString(),
    ...entry,
  });
  if (_runLog.length > RUN_LOG_MAX) _runLog.length = RUN_LOG_MAX;
}

export function getRunLog(): RunLogEntry[] {
  return [..._runLog];
}

export function getRunStats(): {
  totalRuns: number;
  successRate: number;
  avgLatencyMs: number;
  avgMatchScore: number;
  lastRunAt: string | null;
} {
  if (!_runLog.length) return { totalRuns: 0, successRate: 1, avgLatencyMs: 0, avgMatchScore: 0, lastRunAt: null };
  const successful = _runLog.filter((r) => r.success);
  const withScore = _runLog.filter((r) => r.matchScore !== undefined);
  return {
    totalRuns: _runLog.length,
    successRate: successful.length / _runLog.length,
    avgLatencyMs: Math.round(_runLog.reduce((s, r) => s + r.latencyMs, 0) / _runLog.length),
    avgMatchScore: withScore.length
      ? Math.round(withScore.reduce((s, r) => s + (r.matchScore ?? 0), 0) / withScore.length)
      : 0,
    lastRunAt: _runLog[0]?.ts ?? null,
  };
}
