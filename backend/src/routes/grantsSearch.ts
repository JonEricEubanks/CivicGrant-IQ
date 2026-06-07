import { Router, Request, Response } from "express";

export const grantsSearchRouter = Router();

export interface GrantsGovResult {
  id: string;
  title: string;
  agency: string;
  number: string;
  closeDate: string | null;
  awardCeiling: number | null;
  awardFloor: number | null;
  description: string;
  url: string;
  cfda: string;
  eligibilities: string[];
  postedDate: string | null;
}

// Grants.gov public REST search — no auth required
const GRANTS_GOV_URL =
  "https://apply07.grants.gov/grantsws/rest/opportunities/search/";

function formatCurrency(n: number | null): string {
  if (!n) return "Not specified";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

/**
 * POST /api/grants-search
 * Body: { keywords: string, focusAreas?: string[], state?: string }
 * Returns: { results: GrantsGovResult[], total: number, source: string }
 *
 * Live search against Grants.gov public API.
 * City-eligible opportunities only (codes 01, 02, 04).
 */
grantsSearchRouter.post("/", async (req: Request, res: Response) => {
  const { keywords = "", focusAreas = [] } = req.body as {
    keywords?: string;
    focusAreas?: string[];
    state?: string;
  };

  // Build keyword string from focus areas + explicit keywords
  const keywordParts = [keywords, ...focusAreas]
    .map((s) => s.trim())
    .filter(Boolean);
  const keyword = keywordParts.slice(0, 3).join(" ") || "infrastructure";

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);

    const payload = {
      keyword,
      oppStatuses: "posted",
      rows: 20,
      startRecordNum: 0,
      resultType: "json",
      sortBy: "openDate|desc",
    };

    const response = await fetch(GRANTS_GOV_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      throw new Error(`Grants.gov returned ${response.status}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await response.json()) as any;

    // Grants.gov response shape: { oppHits: [...], hitCount: number }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hits: any[] = data?.oppHits ?? data?.data ?? [];
    const total: number = data?.hitCount ?? hits.length;

    const results: GrantsGovResult[] = hits.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (h: any): GrantsGovResult => ({
        id: String(h.id ?? ""),
        title: h.title ?? "Untitled",
        agency: h.agency ?? h.agencyName ?? "Federal Agency",
        number: h.number ?? "",
        closeDate: h.closeDate ?? null,
        awardCeiling: Number(h.awardCeiling) || null,
        awardFloor: Number(h.awardFloor) || null,
        description: (h.synopsis ?? h.description ?? "").slice(0, 400),
        url: `https://www.grants.gov/search-results-detail/${h.id}`,
        cfda: typeof h.cfdaList === "string" ? h.cfdaList : (h.cfdaList?.[0]?.programTitle ?? h.cfdaList?.[0] ?? ""),
        eligibilities: h.eligibilities ?? [],
        postedDate: h.openDate ?? null,
      })
    );

    // Client-friendly summary for each result
    const enriched = results.map((r) => ({
      ...r,
      awardCeilingFmt: formatCurrency(r.awardCeiling),
      awardFloorFmt: formatCurrency(r.awardFloor),
    }));

    res.json({ results: enriched, total, keyword, source: "grants.gov" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("abort") || msg.includes("AbortError")) {
      res.status(504).json({ error: "Grants.gov request timed out." });
    } else {
      console.error("Grants.gov search error:", msg);
      res
        .status(502)
        .json({ error: `Could not reach Grants.gov: ${msg}`, results: [], total: 0 });
    }
  }
});
