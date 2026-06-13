/**
 * grantsLive.ts
 *
 * GET /api/grants-live?keywords=stormwater&agency=FEMA&rows=10
 *
 * Proxies the grants.gov public REST search API (no auth required) and returns
 * a normalised list of live open/forecasted grant opportunities.
 * The scan agent uses this list to ground its analysis in real, current grants
 * instead of the static PORTFOLIO_GRANT_DEFS.
 */

import { Router, Request, Response } from "express";

export const grantsLiveRouter = Router();

// ─── grants.gov public endpoint ──────────────────────────────────────────────
const GRANTS_GOV_SEARCH = "https://apply07.grants.gov/grantsws/rest/opportunities/search";const GRANTS_GOV_DETAIL = "https://api.grants.gov/v1/api/fetchOpportunity";

/**
 * Fetch the REAL available funding for one opportunity. Prefers
 * `estimatedFunding` (Estimated Total Program Funding — reliably populated and
 * matches the public listing) then `awardCeiling`. Returns dollars, or null.
 */
async function fetchEstimatedFunding(id: string): Promise<number | null> {
  if (!id) return null;
  try {
    const res = await fetch(GRANTS_GOV_DETAIL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunityId: String(id) }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      data?: { synopsis?: { awardCeiling?: number | string; estimatedFunding?: number | string } };
    };
    const syn = data?.data?.synopsis;
    const toNum = (v: number | string | undefined): number | null => {
      const n = typeof v === "string" ? parseInt(v.replace(/[^0-9]/g, ""), 10) : v;
      return n && n > 0 ? n : null;
    };
    return toNum(syn?.estimatedFunding) ?? toNum(syn?.awardCeiling);
  } catch {
    return null;
  }
}
// Funding category codes we care about for municipal infrastructure
// RA = Disaster Prevention and Relief, ENV = Environmental Quality, T = Transportation,
// AR = Agriculture, HO = Housing, CD = Community Development, H = Health,
// C = Business/Commerce, I = Income Security, LJL = Law Justice Legal, SCI = Science
// The default covers most municipal use cases; callers can override via ?categories=
const DEFAULT_CATEGORIES = "RA|ENV|T|AR|HO|CD";

interface GrantsGovHit {
  id: string;
  number: string;
  title: string;
  agencyCode: string;
  agency: string;
  openDate: string;
  closeDate: string;
  oppStatus: string;
  docType: string;
  cfdaList: string[];
}

interface GrantsGovResponse {
  hitCount: number;
  startRecord: number;
  oppHits: GrantsGovHit[];
}

export interface LiveGrant {
  id: string;
  opportunityNumber: string;
  title: string;
  agency: string;
  agencyCode: string;
  openDate: string;
  closeDate: string;      // ISO format  YYYY-MM-DD or empty string
  status: string;
  cfda: string[];         // e.g. ["20.205"]
  grantsGovUrl: string;   // direct link for demo click-through
  /** Real Estimated Total Program Funding in dollars (null if not published) */
  estimatedFunding?: number | null;
}

/** Convert MM/DD/YYYY → YYYY-MM-DD (or return empty string if absent) */
function toISO(mmddyyyy: string | undefined): string {
  if (!mmddyyyy) return "";
  const [m, d, y] = mmddyyyy.split("/");
  if (!m || !d || !y) return mmddyyyy;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/**
 * GET /api/grants-live
 * Query params:
 *   keywords  - space/comma separated search terms (default: "infrastructure resilience")
 *   rows      - max results to return 1-20 (default: 10)
 *   status    - "posted" | "forecasted" | "posted|forecasted" (default: "forecasted|posted")
 *   withFunding - "1" to enrich each grant with real estimatedFunding (extra detail calls)
 */
grantsLiveRouter.get("/", async (req: Request, res: Response) => {
  const rawKeywords = (req.query.keywords as string | undefined) ?? "infrastructure resilience";
  const rows = Math.min(20, Math.max(1, Number(req.query.rows ?? 10)));
  const status = (req.query.status as string | undefined) ?? "forecasted|posted";
  const withFunding = req.query.withFunding === "1" || req.query.withFunding === "true";
  const rawCategories = (req.query.categories as string | undefined) ?? DEFAULT_CATEGORIES;
  // Allow callers to override sort — "relevance" (grants.gov default) works best for
  // specific program-name queries (e.g. "BRIC"); "closeDate|asc" is best for
  // soonest-closing dashboards. Default: "closeDate|asc" for backward compat.
  const rawSortBy = (req.query.sortBy as string | undefined) ?? "closeDate|asc";

  // Sanitize keywords — strip any HTML/JS injection attempts
  const keyword = rawKeywords
    .replace(/[<>"'`;]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);

  // categories=none skips the filter entirely (needed for grants with empty categoryOfFunding, e.g. BRIC).
  // Otherwise sanitize — only allow pipe-separated uppercase alphanumeric codes.
  const skipCategories = rawCategories.toLowerCase() === "none";
  const categories = skipCategories ? null : (rawCategories.replace(/[^A-Z|]/g, "").slice(0, 60) || DEFAULT_CATEGORIES);

  // Sanitize sortBy — allow only word chars and pipe/hyphen
  const sortBy = /^[\w|]+$/.test(rawSortBy) ? rawSortBy : "closeDate|asc";

  const body: Record<string, unknown> = {
    keyword,
    oppStatuses: status,
    rows,
  };
  // Only apply category filter when caller hasn't opted out — some grants (e.g. FEMA BRIC)
  // have an empty categoryOfFunding and would be filtered out otherwise.
  if (categories) {
    body.fundingCategories = categories;
  }
  // Only add sortBy when not requesting relevance — omitting the field lets grants.gov
  // use its default relevance scoring, which is what we want for specific-name searches.
  if (sortBy !== "relevance") {
    body.sortBy = sortBy;
  }

  try {
    const response = await fetch(GRANTS_GOV_SEARCH, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
    });

    if (!response.ok) {
      res.status(502).json({
        error: `grants.gov returned ${response.status}`,
        source: "grants.gov",
      });
      return;
    }

    const data = (await response.json()) as GrantsGovResponse;
    const hits: GrantsGovHit[] = Array.isArray(data.oppHits) ? data.oppHits : [];

    const grants: LiveGrant[] = hits.map((h) => ({
      id: h.id,
      opportunityNumber: h.number,
      title: h.title,
      agency: h.agency,
      agencyCode: h.agencyCode ?? "",
      openDate: toISO(h.openDate),
      closeDate: toISO(h.closeDate),
      status: h.oppStatus ?? "posted",
      cfda: Array.isArray(h.cfdaList) ? h.cfdaList : [],
      grantsGovUrl: `https://www.grants.gov/search-results-detail/${h.id}`,
    }));

    // Drop grants whose close date has already passed — never show expired opportunities
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const openGrants = grants.filter((g) => {
      if (!g.closeDate) return true; // no date = rolling/open
      return new Date(g.closeDate) >= today;
    });

    // Optionally enrich with real program funding from the detail endpoint.
    if (withFunding && openGrants.length > 0) {
      const fundings = await Promise.all(openGrants.map((g) => fetchEstimatedFunding(g.id)));
      openGrants.forEach((g, i) => {
        g.estimatedFunding = fundings[i];
      });
    }

    res.json({
      totalHits: data.hitCount ?? grants.length,
      returned: openGrants.length,
      keyword,
      source: "grants.gov",
      grants: openGrants,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(502).json({ error: `grants.gov fetch failed: ${message}`, source: "grants.gov" });
  }
});
