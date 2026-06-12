/**
 * indexDocs.mjs — Upload Buffalo Grove docs to Azure AI Search (Basic tier)
 * Run: node infra/indexDocs.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ENDPOINT = process.env.SEARCH_ENDPOINT || "https://civicgrant-iq.search.windows.net";
const KEY = process.env.SEARCH_API_KEY;
if (!KEY) {
  console.error("ERROR: SEARCH_API_KEY environment variable is required. Set it before running this script.");
  process.exit(1);
}
const API_VERSION = "2024-07-01";
const INDEX_NAME = "civicgrant-index";
const DOCS_DIR = path.join(__dirname, "docs");

const DOCS = [
  // ── Buffalo Grove primary documents ───────────────────────────────────────
  { id: "doc1",  filename: "BG-CityProfile-2026.txt",                               title: "Buffalo Grove City Profile 2026" },
  { id: "doc2",  filename: "BG-CapitalImprovementPlan-2026-2030.txt",               title: "Buffalo Grove Capital Improvement Plan 2026-2030" },
  { id: "doc3",  filename: "BG-PastApplication-BRIC-BuffaloCreek-2025.txt",         title: "BG Past Application FEMA BRIC Buffalo Creek 2025" },
  { id: "doc4",  filename: "BG-PastApplication-Northwood-Stormwater-SMC-2024.txt",  title: "BG Past Application Northwood Stormwater SMC 2024" },
  { id: "doc5",  filename: "BG-PastApplication-RAISE-Aptakisic-IL83-2024.txt",      title: "BG Past Application RAISE Aptakisic IL-83 2024" },
  // ── Universal any-city intelligence ───────────────────────────────────────
  { id: "doc6",  filename: "UNIVERSAL-CityGrantFramework-2026.txt",                 title: "Universal Municipal Grant Eligibility Framework 2026" },
  { id: "doc7",  filename: "FEDERAL-MajorGrantPrograms-2026.txt",                   title: "Federal Grant Programs Master Index 2026" },
  { id: "doc8",  filename: "SMALLCITY-RURAL-GrantGuide-2026.txt",                   title: "Small City & Rural Community Grant Guide 2026" },
  { id: "doc9",  filename: "METRO-SUBURBAN-GrantLandscape-2026.txt",                title: "Metropolitan & Suburban City Grant Landscape 2026" },
  // ── Hackathon-winning depth: scoring, timing, equity, stacking ────────────
  { id: "doc10", filename: "FederalGrant-ScoringRubrics-WinningCriteria-2026.txt",  title: "Federal Grant Scoring Rubrics & Winning Criteria 2026" },
  { id: "doc11", filename: "GrantCalendar-FY2026-Deadlines.txt",                    title: "Federal Grant Calendar FY2026 — Deadlines & Open Opportunities" },
  { id: "doc12", filename: "Equity-Justice40-GrantFraming-2026.txt",                title: "Equity, Justice40 & Environmental Justice Grant Framing 2026" },
  { id: "doc13", filename: "MultiGrant-Stacking-Strategies.txt",                    title: "Multi-Grant Stacking Strategies for Municipal Projects" },
];

async function searchFetch(path, method = "GET", body) {
  const url = `${ENDPOINT}${path}?api-version=${API_VERSION}`;
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", "api-key": KEY },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

// ─── Create index if not exists ──────────────────────────────────────────────
async function ensureIndex() {
  try {
    await searchFetch(`/indexes/${INDEX_NAME}`);
    console.log(`Index '${INDEX_NAME}' already exists.`);
  } catch {
    console.log(`Creating index '${INDEX_NAME}'...`);
    await searchFetch(`/indexes`, "POST", {
      name: INDEX_NAME,
      fields: [
        { name: "id",       type: "Edm.String", key: true,  searchable: false, filterable: true  },
        { name: "title",    type: "Edm.String", key: false, searchable: true,  filterable: true,  analyzer: "en.microsoft" },
        { name: "content",  type: "Edm.String", key: false, searchable: true,  filterable: false, analyzer: "en.microsoft" },
        { name: "filename", type: "Edm.String", key: false, searchable: false, filterable: true  },
      ],
    });
    console.log("Index created.");
  }
}

// ─── Upload docs ─────────────────────────────────────────────────────────────
// Azure AI Search Free tier: 32766 byte max per term. Chunk large docs into
// ≤28 KB pieces so no single content field exceeds the limit.
const CHUNK_SIZE = 18000;

// Break any single token longer than 1000 chars (e.g. long URLs) so the
// Azure AI Search analyzer doesn't choke on oversized terms.
function sanitizeContent(text) {
  return text.replace(/\S{1001,}/g, (m) => {
    const out = [];
    for (let i = 0; i < m.length; i += 800) out.push(m.slice(i, i + 800));
    return out.join(" ");
  });
}

function chunkDoc(doc, content) {
  const clean = sanitizeContent(content);
  if (clean.length <= CHUNK_SIZE) {
    return [{ "@search.action": "upload", id: doc.id, title: doc.title, filename: doc.filename, content: clean }];
  }
  const chunks = [];
  let i = 0, part = 0;
  while (i < clean.length) {
    // Break at paragraph boundary when possible
    let end = Math.min(i + CHUNK_SIZE, clean.length);
    if (end < clean.length) {
      const boundary = clean.lastIndexOf("\n\n", end);
      if (boundary > i + CHUNK_SIZE / 2) end = boundary;
    }
    const chunk = clean.slice(i, end);
    chunks.push({
      "@search.action": "upload",
      id: `${doc.id}_p${part}`,
      title: `${doc.title} (Part ${part + 1})`,
      filename: doc.filename,
      content: chunk,
    });
    i = end;
    part++;
  }
  return chunks;
}

async function uploadDocs() {
  const actions = DOCS.flatMap((doc) => {
    const content = fs.readFileSync(path.join(DOCS_DIR, doc.filename), "utf-8");
    return chunkDoc(doc, content);
  });

  // Upload in batches of 10 (Search API limit per request)
  for (let i = 0; i < actions.length; i += 10) {
    const batch = actions.slice(i, i + 10);
    const result = await searchFetch(`/indexes/${INDEX_NAME}/docs/index`, "POST", { value: batch });
    result.value.forEach((r) => {
      console.log(`  ${r.key}: status=${r.status} statusCode=${r.statusCode} ${r.errorMessage || ""}`);
    });
  }
}

// ─── Verify ──────────────────────────────────────────────────────────────────
async function verify() {
  const result = await searchFetch(`/indexes/${INDEX_NAME}/docs/$count`);
  console.log(`\nDocument count in index: ${result}`);
  const search = await searchFetch(`/indexes/${INDEX_NAME}/docs/search`, "POST", {
    search: "buffalo grove stormwater grant",
    top: 3,
    select: "id,title",
  });
  console.log("Sample search results:");
  search.value.forEach((d) => console.log(`  [${d.id}] ${d.title}`));
}

(async () => {
  try {
    await ensureIndex();
    console.log("\nUploading docs...");
    await uploadDocs();
    await verify();
    console.log("\nDone! Search endpoint ready.");
    console.log(`SEARCH_ENDPOINT=https://civicgrant-srch.search.windows.net`);
    console.log(`SEARCH_API_KEY=${KEY}`);
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
})();
