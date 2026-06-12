import "dotenv/config"; // load .env FIRST so all env vars are available
import { initTelemetry } from "./telemetry";
// Initialize telemetry after dotenv so connection string is available
initTelemetry();

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { chatRouter } from "./routes/chat";
import { scanRouter } from "./routes/scan";
import { packageRouter } from "./routes/package";
import { draftApplicationRouter } from "./routes/draftApplication";
import { fetchUrlRouter } from "./routes/fetchUrl";
import { grantsSearchRouter } from "./routes/grantsSearch";
import { heroGrantsRouter } from "./routes/heroGrants";
import { monitorRouter } from "./routes/monitor";
import { adminChatRouter } from "./routes/adminChat";
import { generateReportRouter } from "./routes/generateReport";
import { grantsLiveRouter } from "./routes/grantsLive";
import { workIqRouter } from "./routes/workIq";
import { fabricIqRouter } from "./routes/fabricIq";
import { checkHealth } from "./agent";

const app = express();
const PORT = process.env.PORT || 3001;

// CORS — allow localhost in dev; in production the SWA linked-backend proxy
// sends requests server-side so CORS is not needed. ALLOWED_ORIGIN can be set
// to a specific SWA domain as an extra safety net for direct API callers.
const allowedOrigins: (string | RegExp)[] = [/^http:\/\/localhost:\d+$/];
if (process.env.ALLOWED_ORIGIN) {
  allowedOrigins.push(process.env.ALLOWED_ORIGIN);
} else {
  // Allow any *.azurestaticapps.net origin as a safe production default
  allowedOrigins.push(/^https:\/\/[a-z0-9-]+\.azurestaticapps\.net$/);
}
app.use(cors({ origin: allowedOrigins }));

// Security headers — sane defaults; this is a JSON API behind the SWA proxy,
// so we disable the restrictive CSP/COEP that only apply to served HTML.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

// Body-size cap — grant text can be large (pasted NOFOs) but 1 MB is plenty and
// blocks oversized-payload abuse of the AI endpoints.
app.use(express.json({ limit: "1mb" }));

// Rate limiting — prevents abuse of expensive AI-backed endpoints
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute
  max: 10,               // 10 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — please wait before sending another analysis." },
});

const scanLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,                // scan fires 5 parallel AI calls, so tighter limit
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many scan requests — please wait before scanning again." },
});

app.use("/api/chat", chatLimiter, chatRouter);
app.use("/api/scan", scanLimiter, scanRouter);
app.use("/api/package", packageRouter);
app.use("/api/draft-application", chatLimiter, draftApplicationRouter);
app.use("/api/fetch-url", fetchUrlRouter);
app.use("/api/grants-search", grantsSearchRouter);
app.use("/api/hero-grants", heroGrantsRouter);
app.use("/api/monitor", monitorRouter);
app.use("/api/admin-chat", chatLimiter, adminChatRouter);
app.use("/api/generate-report", chatLimiter, generateReportRouter);
app.use("/api/grants-live", grantsLiveRouter);
app.use("/api/work-iq", workIqRouter);
app.use("/api/fabric-iq", fabricIqRouter);

app.get("/api/health", async (_req, res) => {
  const health = await checkHealth();
  res.status(health.status === "ok" ? 200 : 503).json(health);
});

app.listen(PORT, async () => {
  console.log(`CivicGrant IQ backend running on http://localhost:${PORT}`);
  // Startup health probe — surfaces misconfiguration immediately instead of on first request
  try {
    const health = await checkHealth();
    console.log(
      `[Health] status=${health.status} search=${health.search} openai=${health.openai} ` +
      `foundry=${health.foundry} activeKbSource=${health.activeKbSource}`
    );
    if (health.search === "unreachable") {
      console.warn("[Health] AI Search unreachable — serving from local KB fallback.");
    }
  } catch (err) {
    console.warn("[Health] Startup probe failed:", (err as Error).message);
  }
});

// Keep the event loop alive so ts-node doesn't exit after the async startup
// callback resolves (common ts-node clean-exit bug with async listen callbacks)
setInterval(() => {}, 1 << 30);
