import { Router, type Request, type Response } from "express";

export const heroGrantsRouter = Router();

const GRANTS_GOV_URL =
  "https://apply07.grants.gov/grantsws/rest/opportunities/search/";

interface HeroGrantResult {
  name: string;
  agency: string;
  match: number;
  /** Formatted string, e.g. "$5M+" or null if not found */
  funding: string | null;
  /** Days until close, or null if unknown / no deadline */
  daysLeft: number | null;
  /** Raw award ceiling in dollars, or null */
  awardCeiling: number | null;
  /** ISO close date string, or null */
  closeDate: string | null;
  prompt: string;
}

interface HeroGrantsResponse {
  grants: HeroGrantResult[];
  /** Sum of real award ceilings in millions, rounded to 1 dp */
  totalMillion: number;
  source: "live" | "fallback";
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const ms = new Date(dateStr).getTime();
  if (Number.isNaN(ms)) return null;
  const diff = Math.ceil((ms - Date.now()) / 86_400_000);
  return Math.max(0, diff);
}

function formatFunding(ceiling: number | null): string | null {
  if (!ceiling) return null;
  if (ceiling >= 1_000_000) return `$${(ceiling / 1_000_000).toFixed(1)}M`;
  if (ceiling >= 1_000) return `$${(ceiling / 1_000).toFixed(0)}K`;
  return `$${ceiling.toLocaleString()}`;
}

async function searchOne(keyword: string): Promise<{ awardCeiling: number | null; closeDate: string | null } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(GRANTS_GOV_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        keyword,
        oppStatuses: "posted",
        rows: 5,
        startRecordNum: 0,
        resultType: "json",
        sortBy: "openDate|desc",
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hits: any[] = data?.oppHits ?? data?.data ?? [];
    if (hits.length === 0) return null;
    const best = hits[0];
    return {
      awardCeiling: Number(best.awardCeiling) || null,
      closeDate: best.closeDate ?? null,
    };
  } catch {
    clearTimeout(timer);
    return null;
  }
}

/**
 * GET /api/hero-grants
 *
 * Returns live grant metadata for the three hero cards on the landing page.
 * Runs 3 parallel Grants.gov searches. Falls back gracefully to curated
 * values if the API is unreachable or returns no matching opportunities.
 */
heroGrantsRouter.get("/", async (_req: Request, res: Response) => {
  // Curated fallback values (same as current hardcoded UI)
  const FALLBACKS: Omit<HeroGrantResult, "awardCeiling" | "closeDate">[] = [
    {
      name: "RAISE Grant",
      agency: "U.S. Dept of Transportation",
      match: 85,
      funding: "$5M+",
      daysLeft: null,
      prompt:
        "Analyze USDOT RAISE grant for Buffalo Grove IL — Aptakisic Road/IL-83 intersection improvement project",
    },
    {
      name: "HUD CDBG",
      agency: "Housing & Urban Development",
      match: 72,
      funding: "$2.1M",
      daysLeft: null,
      prompt:
        "What HUD CDBG grants does Buffalo Grove IL (Lake County) qualify for with our senior housing and community facility priorities?",
    },
    {
      name: "EPA Water SRF",
      agency: "U.S. Environmental Protection Agency",
      match: 68,
      funding: "$1.6M",
      daysLeft: null,
      prompt:
        "Find EPA Water State Revolving Fund grants for Buffalo Grove IL stormwater and water main replacement projects",
    },
  ];

  const KEYWORDS = [
    "RAISE transportation infrastructure city",
    "CDBG community development block grant city",
    "EPA water state revolving fund SRF municipality",
  ];

  // Run all three searches in parallel
  const results = await Promise.all(KEYWORDS.map(searchOne));

  let anyLive = false;
  const grants: HeroGrantResult[] = FALLBACKS.map((fb, i) => {
    const live = results[i];
    if (live) anyLive = true;
    return {
      ...fb,
      awardCeiling: live?.awardCeiling ?? null,
      closeDate: live?.closeDate ?? null,
      funding: (live && formatFunding(live.awardCeiling)) ?? fb.funding,
      daysLeft: (live && daysUntil(live.closeDate)) ?? fb.daysLeft,
    };
  });

  // Compute total from real ceilings where available, else use curated $8.7M
  const realCeilings = grants.filter((g) => g.awardCeiling !== null).map((g) => g.awardCeiling as number);
  const totalMillion =
    realCeilings.length > 0
      ? Math.round((realCeilings.reduce((a, b) => a + b, 0) / 1_000_000) * 10) / 10
      : 8.7;

  const response: HeroGrantsResponse = {
    grants,
    totalMillion,
    source: anyLive ? "live" : "fallback",
  };

  res.json(response);
});
