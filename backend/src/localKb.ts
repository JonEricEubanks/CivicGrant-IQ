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

  // Return top 3 docs to keep total context ~10K tokens max (helps with rate limits)
  const selected = scored.slice(0, Math.min(topK, 3));

  const citations: Citation[] = selected.map((s, i) => ({
    id: `local-kb-${i}`,
    title: s.doc.title,
    excerpt: s.doc.description,
    source: "municipal_docs" as const,
  }));

  // Truncate each doc to first 2000 chars to reduce token usage
  const context = selected
    .map(
      (s) => {
        const truncated = s.doc.content.length > 2000
          ? s.doc.content.slice(0, 2000) + "\n[...truncated for context length]"  
          : s.doc.content;
        return `**${s.doc.title}**\n${s.doc.description}\n\n${truncated}`;
      }
    )
    .join("\n\n---\n\n");

  return { context, citations };
}

// ─── Preload at module import ────────────────────────────────────────────────
loadDocs();
