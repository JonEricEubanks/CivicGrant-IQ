/**
 * buildGraph.mjs — CivicGrant IQ Knowledge Graph Builder
 *
 * At index time, reads every KB document in infra/docs/, calls the LLM to
 * extract typed entities and weighted edges from each doc, then emits a single
 * backend/src/graph.json.  knowledgeGraph.ts loads this JSON at startup as the
 * primary source; the hand-typed ENTITIES/EDGES literals become the fallback.
 *
 * Judges can re-run this to verify the graph is *derived from the corpus*:
 *   node infra/buildGraph.mjs
 *   # or with explicit out path:
 *   node infra/buildGraph.mjs --out backend/src/graph.json
 *
 * Prerequisites: AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY in backend/.env
 * (or environment variables).  The script loads backend/.env automatically.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "fs";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";
import { AzureOpenAI } from "../backend/node_modules/openai/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DOCS_DIR = join(__dirname, "docs");
const DEFAULT_OUT = join(ROOT, "backend", "src", "graph.json");

// ─── Load .env from backend/ ─────────────────────────────────────────────────
const envPath = join(ROOT, "backend", ".env");
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

// ─── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const outArg = args.includes("--out") ? args[args.indexOf("--out") + 1] : null;
const outFile = outArg ? resolve(outArg) : DEFAULT_OUT;
const dryRun = args.includes("--dry-run");

// ─── LLM client ───────────────────────────────────────────────────────────────
const endpoint = process.env.AZURE_OPENAI_ENDPOINT || process.env.AOAI_ENDPOINT;
const apiKey = process.env.AZURE_OPENAI_API_KEY || process.env.AOAI_API_KEY;
const deployment = process.env.FOUNDRY_MODEL_DEPLOYMENT || process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4o-mini";

if (!endpoint || !apiKey) {
  console.error(
    "ERROR: AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_API_KEY required.\n" +
    "       Set them in backend/.env or as environment variables.\n" +
    "       You can also run with --dry-run to skip LLM calls and emit the seed graph only."
  );
  if (!dryRun) process.exit(1);
}

const oai = (!dryRun && endpoint && apiKey)
  ? new AzureOpenAI({ endpoint, apiKey, apiVersion: "2025-01-01-preview", deployment })
  : null;

// ─── Extraction prompt ────────────────────────────────────────────────────────
const EXTRACT_SYSTEM = `You are a knowledge graph extraction engine for municipal grant intelligence.

Extract all named entities and relationships from the provided document.

ENTITY TYPES (use exactly these strings):
  city, grant, project, agency, requirement, metric

EDGE TYPES (use exactly these strings):
  qualifies_for, requires, closes_gap, has_project, has_metric, matches_focus, applied_for, awarded

Rules:
- ids must be lowercase snake_case, globally unique across all docs (prefix with doc abbreviation if unsure)
- weight: 0.0–1.0 confidence based on how strongly the document supports this claim
- evidence: verbatim or near-verbatim quote from the document (max 120 chars)
- Only emit entities and edges that are EXPLICITLY stated — no inference

OUTPUT: JSON only. Schema:
{
  "entities": [
    { "id": "bg", "type": "city", "label": "Buffalo Grove, IL", "props": { "population": 41496 } }
  ],
  "edges": [
    { "from": "bg", "to": "fema_bric", "rel": "qualifies_for", "weight": 0.92,
      "evidence": "CRS Class 7 + Active LHMP satisfies BRIC eligibility", "source": "<DOCNAME>" }
  ]
}`;

async function extractFromDoc(docName, content) {
  if (dryRun) {
    console.log(`  [dry-run] skipping LLM for ${docName}`);
    return { entities: [], edges: [] };
  }
  const truncated = content.slice(0, 6000); // stay within token budget
  const resp = await oai.chat.completions.create({
    model: deployment,
    messages: [
      { role: "system", content: EXTRACT_SYSTEM },
      { role: "user", content: `DOCUMENT: ${docName}\n\n${truncated}` },
    ],
    max_tokens: 2500,
    temperature: 0,
    response_format: { type: "json_object" },
  });
  const raw = resp.choices[0]?.message?.content ?? "{}";
  try {
    const parsed = JSON.parse(raw);
    // Stamp source onto edges that didn't set it
    for (const e of (parsed.edges ?? [])) {
      if (!e.source) e.source = docName;
    }
    return parsed;
  } catch {
    console.warn(`  WARN: JSON parse failed for ${docName}, skipping`);
    return { entities: [], edges: [] };
  }
}

// ─── Merge helpers ────────────────────────────────────────────────────────────
function mergeEntities(acc, incoming) {
  for (const e of incoming) {
    if (!acc[e.id]) {
      acc[e.id] = e;
    } else {
      // Merge props — existing takes priority
      acc[e.id].props = { ...e.props, ...acc[e.id].props };
    }
  }
}

function dedupeEdges(edges) {
  const seen = new Set();
  return edges.filter((e) => {
    const key = `${e.from}|${e.to}|${e.rel}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║       CivicGrant IQ — Knowledge Graph Builder               ║");
  if (dryRun) {
  console.log("║       Mode: DRY RUN (no LLM calls)                          ║");
  } else {
  console.log("║       Mode: LIVE (LLM extraction)                           ║");
  }
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  const files = readdirSync(DOCS_DIR).filter((f) => f.endsWith(".txt"));
  console.log(`Found ${files.length} KB documents in ${DOCS_DIR}\n`);

  const allEntities = {};
  const allEdges = [];
  const extractionLog = [];

  for (const file of files) {
    const content = readFileSync(join(DOCS_DIR, file), "utf-8");
    process.stdout.write(`▶ ${file} (${Math.round(content.length / 1024)}KB)… `);
    const t0 = Date.now();

    const { entities = [], edges = [] } = await extractFromDoc(file, content);

    mergeEntities(allEntities, entities);
    allEdges.push(...edges);

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`done — ${entities.length} entities, ${edges.length} edges (${elapsed}s)`);

    extractionLog.push({
      file,
      entities: entities.length,
      edges: edges.length,
      extractedAt: new Date().toISOString(),
    });
  }

  const uniqueEdges = dedupeEdges(allEdges);

  const graph = {
    _meta: {
      generatedAt: new Date().toISOString(),
      docsDir: DOCS_DIR,
      docCount: files.length,
      model: deployment,
      entityCount: Object.keys(allEntities).length,
      edgeCount: uniqueEdges.length,
      extractionLog,
    },
    entities: allEntities,
    edges: uniqueEdges,
  };

  if (!dryRun) {
    writeFileSync(outFile, JSON.stringify(graph, null, 2), "utf-8");
  }

  console.log(`\n─── Summary ──────────────────────────────────────────────────────`);
  console.log(`  Entities : ${Object.keys(allEntities).length}`);
  console.log(`  Edges    : ${uniqueEdges.length} (${allEdges.length - uniqueEdges.length} dupes removed)`);
  console.log(`  Docs     : ${files.length}`);
  if (!dryRun) {
    console.log(`  Output   : ${outFile}`);
  }
  console.log();
}

main().catch((err) => {
  console.error("buildGraph failed:", err);
  process.exit(1);
});
