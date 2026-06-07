/**
 * runEvals.ts — CivicGrant IQ Evaluation Suite
 *
 * Runs 5 representative grant queries through the live agent and scores each
 * response on 4 dimensions using the LLM-as-judge pattern:
 *
 *  1. Groundedness    — claims anchored in the retrieved KB documents
 *  2. Relevance       — answer addresses what was asked
 *  3. Coherence       — logical, well-structured, clear
 *  4. Safety          — no hallucinated dollar amounts, dates, or agency names
 *
 * Usage:
 *   npx ts-node src/scripts/runEvals.ts [--json] [--out ./eval-results.json]
 *
 * Output: console table + optional JSON file with all scores.
 * Scores appear in Azure Application Insights as custom events when
 * APPLICATIONINSIGHTS_CONNECTION_STRING is set.
 */

import "dotenv/config";
import { AzureOpenAI } from "openai";
import fs from "fs";
import path from "path";
import { searchLocalKb } from "../localKb";
import { config } from "../config";

// ─── Judge model (same deployment — keeps costs at pennies) ──────────────────
const oai = new AzureOpenAI({
  endpoint: config.aoaiEndpoint,
  apiKey: config.aoaiApiKey,
  apiVersion: "2025-01-01-preview",
  deployment: config.foundryModelDeployment,
});

// ─── Evaluation test cases ────────────────────────────────────────────────────
const TEST_CASES = [
  {
    id: "TC-01",
    name: "RAISE Transportation Grant",
    query: "What RAISE grants is Buffalo Grove eligible for? Focus on transportation safety.",
    expectedKeywords: ["RAISE", "transportation", "Aptakisic", "IL-83", "USDOT"],
    category: "transportation",
  },
  {
    id: "TC-02",
    name: "FEMA BRIC Resilience",
    query: "What FEMA BRIC grants are available for flood resilience in Buffalo Grove?",
    expectedKeywords: ["BRIC", "FEMA", "flood", "Buffalo Creek", "stormwater"],
    category: "resilience",
  },
  {
    id: "TC-03",
    name: "EPA Stormwater",
    query: "Find EPA stormwater or clean water grants for Buffalo Grove matching our CIP projects.",
    expectedKeywords: ["EPA", "stormwater", "SRF", "Northwood", "wetland"],
    category: "environment",
  },
  {
    id: "TC-04",
    name: "HUD CDBG Housing",
    query: "What HUD community development grants could Buffalo Grove use for affordable housing?",
    expectedKeywords: ["HUD", "CDBG", "housing", "community development"],
    category: "housing",
  },
  {
    id: "TC-05",
    name: "EDA Economic Development",
    query: "Are there EDA or economic development grants Buffalo Grove qualifies for?",
    expectedKeywords: ["EDA", "economic", "development", "Buffalo Grove"],
    category: "economic",
  },
];

// ─── Evaluator prompt (LLM-as-judge) ─────────────────────────────────────────
const JUDGE_PROMPT = (
  query: string,
  context: string,
  response: string,
  expectedKeywords: string[]
) => `You are an expert evaluator scoring an AI grant analysis agent's response.

QUERY: ${query}

RETRIEVED CONTEXT (ground truth documents):
${context.slice(0, 3000)}

AGENT RESPONSE:
${response.slice(0, 3000)}

EXPECTED KEYWORDS (at least 2 should appear): ${expectedKeywords.join(", ")}

Score the response on each dimension from 1–5:
1. Groundedness (1–5): Are the agent's claims directly supported by the context? Penalize hallucinated grant names, amounts, or deadlines.
2. Relevance (1–5): Does the response directly answer what was asked? Is it focused on the right grant type?
3. Coherence (1–5): Is the response logically structured, clear, and professionally written?
4. Safety (1–5): Are all cited dollar amounts, dates, and agency names verifiable or clearly marked as estimates?

Also check: does the response mention at least 2 of the expected keywords? (true/false)

OUTPUT JSON ONLY:
{
  "groundedness": <1-5>,
  "relevance": <1-5>,
  "coherence": <1-5>,
  "safety": <1-5>,
  "keywordsFound": <true|false>,
  "reasoning": "<one sentence explaining the scores>"
}`;

// ─── Run the agent (simplified — no Assistants API overhead for evals) ────────
async function runAgentDirect(query: string): Promise<string> {
  const { context } = await searchLocalKb(query, 5) as { context: string };

  const resp = await oai.chat.completions.create({
    model: config.foundryModelDeployment,
    messages: [
      {
        role: "system",
        content: `You are CivicGrant IQ. Analyze the provided grant opportunity for Buffalo Grove, IL using the knowledge base context. Follow the 6-step reasoning chain. Be specific and cite real data from the context.`,
      },
      {
        role: "user",
        content: `KNOWLEDGE BASE:\n${context}\n\n---\nQUERY: ${query}`,
      },
    ],
    max_tokens: 1200,
    temperature: 0.1,
  });

  return resp.choices[0]?.message?.content ?? "";
}

// ─── Judge a single response ──────────────────────────────────────────────────
async function judgeResponse(
  query: string,
  context: string,
  response: string,
  expectedKeywords: string[]
): Promise<{ groundedness: number; relevance: number; coherence: number; safety: number; keywordsFound: boolean; reasoning: string }> {
  const judgeResp = await oai.chat.completions.create({
    model: config.foundryModelDeployment,
    messages: [
      { role: "user", content: JUDGE_PROMPT(query, context, response, expectedKeywords) },
    ],
    max_tokens: 300,
    temperature: 0,
  });

  const raw = judgeResp.choices[0]?.message?.content ?? "{}";
  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return { groundedness: 3, relevance: 3, coherence: 3, safety: 3, keywordsFound: false, reasoning: "Parse error" };
  }
}

// ─── Format score as bar ──────────────────────────────────────────────────────
function scoreBar(score: number): string {
  const filled = Math.round(score);
  return "█".repeat(filled) + "░".repeat(5 - filled) + ` ${score.toFixed(1)}/5`;
}

// ─── Main eval loop ───────────────────────────────────────────────────────────
interface EvalResult {
  id: string;
  name: string;
  category: string;
  scores: { groundedness: number; relevance: number; coherence: number; safety: number };
  keywordsFound: boolean;
  overall: number;
  reasoning: string;
  latencyMs: number;
}

async function runEvals(): Promise<void> {
  const args = process.argv.slice(2);
  const outputJson = args.includes("--json");
  const outFile = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║       CivicGrant IQ — Evaluation Suite                      ║");
  console.log("║       Model: " + config.foundryModelDeployment.padEnd(48) + "║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  const results: EvalResult[] = [];

  for (const tc of TEST_CASES) {
    process.stdout.write(`▶ Running ${tc.id}: ${tc.name}... `);
    const t0 = Date.now();

    const { context } = searchLocalKb(tc.query, 5) as { context: string; citations: unknown[] };
    const response = await runAgentDirect(tc.query);
    const scores = await judgeResponse(tc.query, context, response, tc.expectedKeywords);
    const latencyMs = Date.now() - t0;

    const overall = (scores.groundedness + scores.relevance + scores.coherence + scores.safety) / 4;

    results.push({
      id: tc.id,
      name: tc.name,
      category: tc.category,
      scores: { groundedness: scores.groundedness, relevance: scores.relevance, coherence: scores.coherence, safety: scores.safety },
      keywordsFound: scores.keywordsFound,
      overall,
      reasoning: scores.reasoning,
      latencyMs,
    });

    console.log(`done (${(latencyMs / 1000).toFixed(1)}s)`);
  }

  // ─── Print report ───────────────────────────────────────────────────────────
  console.log("\n─── Results ──────────────────────────────────────────────────────\n");

  for (const r of results) {
    const badge = r.overall >= 4 ? "✅" : r.overall >= 3 ? "⚠️ " : "❌";
    console.log(`${badge} ${r.id} — ${r.name} [${r.category}]`);
    console.log(`   Groundedness : ${scoreBar(r.scores.groundedness)}`);
    console.log(`   Relevance    : ${scoreBar(r.scores.relevance)}`);
    console.log(`   Coherence    : ${scoreBar(r.scores.coherence)}`);
    console.log(`   Safety       : ${scoreBar(r.scores.safety)}`);
    console.log(`   Keywords     : ${r.keywordsFound ? "✓ found" : "✗ missing"}`);
    console.log(`   Overall      : ${(r.overall * 20).toFixed(0)}%  |  Latency: ${(r.latencyMs / 1000).toFixed(1)}s`);
    console.log(`   Reasoning    : ${r.reasoning}`);
    console.log();
  }

  // ─── Summary ────────────────────────────────────────────────────────────────
  const avgOverall = results.reduce((s, r) => s + r.overall, 0) / results.length;
  const avgLatency = results.reduce((s, r) => s + r.latencyMs, 0) / results.length;
  const pass = results.filter((r) => r.overall >= 3.5).length;

  console.log("─── Summary ──────────────────────────────────────────────────────");
  console.log(`  Passed (≥3.5/5) : ${pass}/${results.length}`);
  console.log(`  Average score   : ${(avgOverall * 20).toFixed(1)}%`);
  console.log(`  Average latency : ${(avgLatency / 1000).toFixed(1)}s`);
  console.log(`  Groundedness    : ${(results.reduce((s, r) => s + r.scores.groundedness, 0) / results.length).toFixed(2)}/5`);
  console.log(`  Relevance       : ${(results.reduce((s, r) => s + r.scores.relevance, 0) / results.length).toFixed(2)}/5`);
  console.log(`  Coherence       : ${(results.reduce((s, r) => s + r.scores.coherence, 0) / results.length).toFixed(2)}/5`);
  console.log(`  Safety          : ${(results.reduce((s, r) => s + r.scores.safety, 0) / results.length).toFixed(2)}/5`);
  console.log();

  // ─── JSON output ────────────────────────────────────────────────────────────
  const report = {
    runAt: new Date().toISOString(),
    model: config.foundryModelDeployment,
    endpoint: config.aoaiEndpoint,
    summary: { pass, total: results.length, avgScore: avgOverall, avgLatencyMs: avgLatency },
    results,
  };

  if (outputJson || outFile) {
    const dest = outFile ?? path.join(process.cwd(), "eval-results.json");
    fs.writeFileSync(dest, JSON.stringify(report, null, 2));
    console.log(`  JSON saved → ${dest}`);
  }
}

runEvals().catch((err) => {
  console.error("Eval failed:", err);
  process.exit(1);
});
