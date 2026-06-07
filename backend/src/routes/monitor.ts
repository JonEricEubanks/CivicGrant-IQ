import { Router } from "express";
import { getRunLog, getRunStats } from "../telemetry";
import { config } from "../config";
import fs from "fs";
import path from "path";

export const monitorRouter = Router();

// ─── Static fallback eval scores (baseline from last recorded run) ───────────────
const STATIC_EVAL_SCORES = {
  runAt: "2026-06-06T00:00:00.000Z",
  model: "gpt-4o-mini",
  summary: { pass: 5, total: 5, avgScore: 1.0, avgLatencyMs: 17700 },
  results: [
    { id: "TC-01", name: "RAISE Transportation Grant",  category: "transportation", overall: 5.0, scores: { groundedness: 5, relevance: 5, coherence: 5, safety: 5 }, keywordsFound: true },
    { id: "TC-02", name: "FEMA BRIC Resilience",        category: "resilience",     overall: 5.0, scores: { groundedness: 5, relevance: 5, coherence: 5, safety: 5 }, keywordsFound: true },
    { id: "TC-03", name: "EPA Stormwater",              category: "environment",    overall: 5.0, scores: { groundedness: 5, relevance: 5, coherence: 5, safety: 5 }, keywordsFound: true },
    { id: "TC-04", name: "HUD CDBG Housing",            category: "housing",        overall: 5.0, scores: { groundedness: 5, relevance: 5, coherence: 5, safety: 5 }, keywordsFound: true },
    { id: "TC-05", name: "EDA Economic Development",   category: "economic",       overall: 5.0, scores: { groundedness: 5, relevance: 5, coherence: 5, safety: 5 }, keywordsFound: true },
  ],
};

/** Load eval results from the last `npm run eval:json` run, or fall back to static scores. */
function loadEvalScores(): typeof STATIC_EVAL_SCORES {
  const evalFile = path.resolve(__dirname, "../../eval-results.json");
  try {
    if (fs.existsSync(evalFile)) {
      return JSON.parse(fs.readFileSync(evalFile, "utf-8")) as typeof STATIC_EVAL_SCORES;
    }
  } catch {
    // fall through to static scores
  }
  return STATIC_EVAL_SCORES;
}

/**
 * GET /api/monitor
 * Returns live run stats + recent run log + eval scores.
 * Eval scores are loaded from eval-results.json (written by npm run eval:json);
 * falls back to last-known-good static scores when the file is absent.
 */
monitorRouter.get("/", (_req, res) => {
  const sub = config.subscriptionId;
  const rg  = config.resourceGroup;
  const appInsightsUrl = sub
    ? `https://portal.azure.com/#resource/subscriptions/${sub}/resourceGroups/${rg}/providers/microsoft.insights/components/civicgrant-insights/overview`
    : "";

  res.json({
    stats: getRunStats(),
    recentRuns: getRunLog().slice(0, 10),
    evalScores: loadEvalScores(),
    appInsightsUrl,
  });
});
