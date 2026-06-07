import { Router, Request, Response } from "express";
import { runPortfolioScan } from "../agents/multiAgent";
import type { PortfolioItem } from "../agents/multiAgent";
import { withSpan } from "../telemetry";

export const scanRouter = Router();

export interface CityProfile {
  cityName: string;
  state: string;
  population: number;
  focusAreas: string[];
  currentProjects: string;
}

/**
 * POST /api/scan
 * Scans for matching grant opportunities given a city profile.
 * Body: CityProfile
 */
scanRouter.post("/", async (req: Request, res: Response) => {
  const body = req.body as Partial<CityProfile>;

  if (!body.cityName || !body.state || !body.focusAreas?.length) {
    res.status(400).json({
      error: "cityName, state, and focusAreas are required",
    });
    return;
  }

  const profile: CityProfile = {
    cityName: body.cityName.trim(),
    state: body.state.trim(),
    population: body.population ?? 0,
    focusAreas: body.focusAreas,
    currentProjects: body.currentProjects?.trim() ?? "",
  };

  // SSE stream
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // ── Root OTel span — 5 parallel portfolio scans nest under one trace in App Insights
    await withSpan(
      "civicgrant.portfolio_scan",
      {
        "civicgrant.city": `${profile.cityName}, ${profile.state}`,
        "civicgrant.focus_areas": profile.focusAreas.join(", ").slice(0, 120),
        "civicgrant.agents": "portfolio_orchestrator×5",
      },
      async () => {
    send("status", {
      message: `Portfolio Orchestrator: launching 5 parallel grant analyses for ${profile.cityName}, ${profile.state}…`,
    });

    const collected: PortfolioItem[] = [];

    // Portfolio Orchestrator — fires onItem as each of the 5 parallel analyses completes
    await runPortfolioScan(profile, (item) => {
      collected.push(item);
      // Stream each result immediately as it arrives
      send("portfolio_item", item);
      send("status", {
        message: `${collected.length}/5 analyzed — ${item.grantName.split("(")[0].trim()} (${item.matchScore}% match)`,
      });
    });

    // Final ranked portfolio summary
    const sorted = [...collected].sort((a, b) => b.matchScore - a.matchScore);
    const totalOpportunity = sorted.reduce((sum, g) => sum + g.fundingAmount, 0);

    send("portfolio_complete", { grants: sorted, totalOpportunity });
    send("done", {});
      } // end withSpan callback
    ); // end withSpan
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    send("error", { message });
  } finally {
    res.end();
  }
});
