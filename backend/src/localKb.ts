/**
 * localKb.ts — Zero-cost local knowledge base for CivicGrant IQ
 *
 * Replaces Azure AI Search (Standard tier, ~$249/month) with direct
 * file reads from infra/docs/. All Foundry / Azure OpenAI usage is
 * unchanged — only the retrieval layer is local.
 *
 * Retrieval: keyword-frequency scoring against query terms.
 * The 5 docs are ~56 KB total so all fit comfortably in gpt-4o-mini's
 * 128K context window even when returning all of them.
 */

import fs from "fs";
import path from "path";
import type { Citation } from "./agent";

// ─── Doc definitions ────────────────────────────────────────────────────────
const DOCS_DIR = path.resolve(__dirname, "../../infra/docs");

interface KbDoc {
  filename: string;
  title: string;
  description: string;
}

const KB_DOCS: KbDoc[] = [
  // ── Buffalo Grove primary documents ──────────────────────────────────────
  {
    filename: "BG-CityProfile-2026.txt",
    title: "Buffalo Grove City Profile 2026",
    description: "City demographics, budget, bonding capacity, reserves, CRS Class 7, Aa2 Moody's rating",
  },
  {
    filename: "BG-CapitalImprovementPlan-2026-2030.txt",
    title: "Buffalo Grove Capital Improvement Plan 2026–2030",
    description: "15 priority projects, $89.4M total, $34.4M in active grant pursuit",
  },
  {
    filename: "BG-PastApplication-BRIC-BuffaloCreek-2025.txt",
    title: "BG Past Application — FEMA BRIC Buffalo Creek 2025",
    description: "FEMA BRIC $3.4M flood warning system, green infrastructure, lift station hardening",
  },
  {
    filename: "BG-PastApplication-Northwood-Stormwater-SMC-2024.txt",
    title: "BG Past Application — Northwood Stormwater SMC 2024",
    description: "AWARDED $5.5M SMC SIIP stormwater wetland, culverts, road reconstruction",
  },
  {
    filename: "BG-PastApplication-RAISE-Aptakisic-IL83-2024.txt",
    title: "BG Past Application — RAISE Aptakisic/IL-83 2024",
    description: "RAISE FY2024 $5M request, Aptakisic/IL-83 reconstruction, adaptive signals, protected bike lane",
  },
  // ── Universal knowledge base — any city, any size ─────────────────────────
  {
    filename: "UNIVERSAL-CityGrantFramework-2026.txt",
    title: "Universal Municipal Grant Eligibility Framework 2026",
    description: "City classification by population tier (micro/small/mid/large/metro), geographic type (rural/suburban/urban), income profile, special designations (Justice40, Opportunity Zone, ARC, coal community). Grant readiness checklist, eligibility scoring matrix, program routing guide for any US municipality.",
  },
  {
    filename: "FEDERAL-MajorGrantPrograms-2026.txt",
    title: "Federal Grant Programs Master Index 2026",
    description: "Comprehensive catalog: RAISE, SS4A, MEGA, INFRA, HSIP, CMAQ, TAP, PROTECT, Carbon Reduction, FEMA BRIC, HMGP, FMA, EPA CWSRF, DWSRF, lead service line, CDBG, HOME, HUD, USDA RD, EDA, DOE GRIP, EECBG, IRA clean energy, IIJA programs. Award ranges, match requirements, eligibility, deadlines, CFDA numbers.",
  },
  {
    filename: "SMALLCITY-RURAL-GrantGuide-2026.txt",
    title: "Small City & Rural Community Grant Guide 2026",
    description: "USDA Rural Development programs (water/wastewater, community facilities, REAP, ReConnect), rural eligibility definitions, ARC Appalachian grants, Delta Regional Authority, state CDBG non-entitlement programs, SRF principal forgiveness strategies, quick-win matrix for towns under 50,000 population.",
  },
  {
    filename: "METRO-SUBURBAN-GrantLandscape-2026.txt",
    title: "Metropolitan & Suburban City Grant Landscape 2026",
    description: "Suburban advantage strategy, HUD CDBG/HOME entitlement programs, MPO transportation programming (CMAP, NCTCOG, DVRPC), RAISE for suburbs, SS4A, state DOT programs by state (IL/TX/CA/FL/NY/OH), brownfield redevelopment, smart city grants, affordable housing, competition levels by program.",
  },
  // ── Hackathon-winning: scoring rubrics, calendar, equity, stacking ─────────
  {
    filename: "FederalGrant-ScoringRubrics-WinningCriteria-2026.txt",
    title: "Federal Grant Scoring Rubrics & Winning Criteria 2026",
    description: "Point-by-point scoring breakdown for RAISE (7 criteria), FEMA BRIC (200-point matrix), SS4A, HUD CDBG, EPA CWSRF. Benefit-Cost Analysis methodology (VSL $13.2M, FHWA crash costs, Hazus-MH), 7 universal winning principles, reviewer red flags to avoid, application review timelines.",
  },
  {
    filename: "GrantCalendar-FY2026-Deadlines.txt",
    title: "Federal Grant Calendar FY2026 — Deadlines & Open Opportunities",
    description: "Currently open grants (EPA SRF, USDA RD, CWSRF rolling). Upcoming: SS4A NOFO July 2026, FEMA BRIC August 2026, HSIP state calls fall 2026, RAISE FY2027 December 2026. Year-round programs, FY2027 planning calendar, 12-month RAISE preparation timeline. How to set up Grants.gov alerts.",
  },
  {
    filename: "Equity-Justice40-GrantFraming-2026.txt",
    title: "Equity, Justice40 & Environmental Justice Grant Framing 2026",
    description: "How to document equity for any city: CEJST screening tool, EPA EJScreen percentile thresholds, LMI documentation (HUD LMISD), elderly/disability/LEP/zero-vehicle household framing. Justice40 background, FY2026 equity scoring under new administration, DEIA workforce language, community engagement documentation requirements, equity section templates for RAISE and BRIC.",
  },
  {
    filename: "MultiGrant-Stacking-Strategies.txt",
    title: "Multi-Grant Stacking Strategies for Municipal Projects",
    description: "How to fully fund projects by stacking RAISE + HSIP + CMAQ + TAP + state DOT + local bonds. Anchor grant concept. Project stacks: major arterial ($5M, 8% local), complete street ($8M, 5% local), flood mitigation ($12M), brownfield. Buffalo Grove specific stacks for Aptakisic/IL-83, Buffalo Creek, Northwood Phase 2. TIF, SRF loans, IRA direct pay as stack components. Federal double-dipping rules.",
  },
];

// ─── Load all docs at startup (cached) ──────────────────────────────────────
interface LoadedDoc extends KbDoc {
  content: string;
  tokens: string[];
}

let _cache: LoadedDoc[] | null = null;

function loadDocs(): LoadedDoc[] {
  if (_cache) return _cache;
  _cache = KB_DOCS.map((doc) => {
    const filePath = path.join(DOCS_DIR, doc.filename);
    let content = "";
    try {
      content = fs.readFileSync(filePath, "utf-8");
    } catch {
      console.warn(`[LocalKB] Could not read ${doc.filename}`);
    }
    // Tokenize for scoring: lowercase words, strip punctuation
    const tokens = content
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2);
    return { ...doc, content, tokens };
  });
  console.log(`[LocalKB] Loaded ${_cache.length} docs from ${DOCS_DIR}`);
  return _cache;
}

// ─── Keyword relevance score ─────────────────────────────────────────────────
function scoreDoc(doc: LoadedDoc, queryTokens: string[]): number {
  if (!doc.tokens.length) return 0;
  let score = 0;
  for (const qt of queryTokens) {
    const freq = doc.tokens.filter((t) => t === qt || t.startsWith(qt)).length;
    score += freq;
  }
  // Boost description-keyword matches (title/description hit = high relevance signal)
  const descLower = (doc.title + " " + doc.description).toLowerCase();
  for (const qt of queryTokens) {
    if (descLower.includes(qt)) score += 5;
  }
  return score;
}

// ─── Stop words to ignore in query ─────────────────────────────────────────
const STOP_WORDS = new Set([
  "the", "and", "for", "with", "this", "that", "from", "are", "has", "have",
  "was", "were", "will", "can", "what", "how", "who", "when", "where", "why",
  "about", "all", "any", "not", "but", "its", "our", "you", "your", "they",
  "their", "them", "which", "been", "also", "more", "than", "into", "over",
]);

// ─── Main export: search local knowledge base ────────────────────────────────
export function searchLocalKb(
  query: string,
  topK = 5
): { context: string; citations: Citation[] } {
  const docs = loadDocs();

  const queryTokens = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));

  // Score every doc; always include at least topK even if score = 0
  const scored = docs
    .map((doc) => ({ doc, score: scoreDoc(doc, queryTokens) }))
    .sort((a, b) => b.score - a.score);

  // Detect if query is asking about a city other than Buffalo Grove.
  // If so, boost universal framework docs and suppress BG-specific docs.
  const queryLower = query.toLowerCase();
  const isBgQuery =
    queryLower.includes("buffalo grove") ||
    queryLower.includes("buffalo gr") ||
    (!queryLower.match(/\b(city|town|village|municipality|county)\s+of\s+(?!buffalo)/i) &&
      !queryLower.match(/\b(rural|small town|big city|large city|metro|suburban)\b/i) &&
      !queryLower.match(/\b(texas|california|florida|ohio|georgia|michigan|colorado|arizona|virginia|washington|oregon|nevada|utah|north carolina|south carolina|tennessee|indiana|missouri|kentucky|louisiana|alabama|mississippi|arkansas|iowa|kansas|nebraska|south dakota|north dakota|montana|wyoming|idaho|new mexico|maine|vermont|new hampshire|connecticut|rhode island|delaware|maryland|new jersey|massachusetts)\b/i));

  // Apply city-type routing: if NOT a BG query, heavily boost universal docs
  if (!isBgQuery) {
    for (const s of scored) {
      const fname = s.doc.filename;
      if (fname.startsWith("UNIVERSAL-") || fname.startsWith("FEDERAL-") ||
          fname.startsWith("SMALLCITY-") || fname.startsWith("METRO-") ||
          fname.startsWith("IIJA-") || fname.startsWith("RURAL-") ||
          fname.startsWith("FederalGrant-") || fname.startsWith("GrantCalendar-") ||
          fname.startsWith("Equity-") || fname.startsWith("MultiGrant-")) {
        s.score += 30; // strong boost for universal docs on any-city queries
      }
    }
    // Re-sort after boost
    scored.sort((a, b) => b.score - a.score);
  }

  // Return top 4 docs: BG queries get 2 BG docs + 2 universal; other cities get 3–4 universal
  const maxDocs = Math.min(topK, 4);
  const selected = scored.slice(0, maxDocs);

  const citations: Citation[] = selected.map((s, i) => ({
    id: `local-kb-${i}`,
    title: s.doc.title,
    excerpt: s.doc.description,
    source: "municipal_docs" as const,
  }));

  // Truncate each doc to first 3000 chars for universal docs (richer info density)
  // BG-specific docs keep 2000 chars (they're already well-structured summaries)
  const context = selected
    .map(
      (s) => {
        const charLimit = s.doc.filename.startsWith("BG-") ? 2000 : 3000;
        const truncated = s.doc.content.length > charLimit
          ? s.doc.content.slice(0, charLimit) + "\n[...truncated for context length]"
          : s.doc.content;
        return `**${s.doc.title}**\n${s.doc.description}\n\n${truncated}`;
      }
    )
    .join("\n\n---\n\n");

  return { context, citations };
}

// ─── Preload at module import ────────────────────────────────────────────────
loadDocs();
