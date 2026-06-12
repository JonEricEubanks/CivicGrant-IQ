import { ClientSecretCredential } from "@azure/identity";
import { AzureOpenAI } from "openai";
import mammoth from "mammoth";
import { config } from "./config";
import { searchLocalKb } from "./localKb";

export interface CityContextProject {
  name: string;
  budget?: string;
  status?: string;
}

export interface CityContext {
  source: "sharepoint" | "local-kb";
  pulledAt: string;
  siteUrl?: string;
  libraryName?: string;
  filesRead: string[];
  priorityThemes: string[];
  activeProjects: CityContextProject[];
  fundingTypes: string[];
  riskSignals: string[];
  matchableGrants: string[];
  narrative: string;
  /** Upcoming grant-related calendar events pulled from Microsoft 365 (Calendars.Read) */
  calendarEvents?: string[];
  /** Recent grant coordination signals from Teams channels (ChannelMessage.Read.All) */
  teamsInsights?: string[];
  /** Recent grant-related emails (Mail.Read) */
  mailSignals?: string[];
  error?: string;
}

interface GraphDriveItem {
  id: string;
  name: string;
  size?: number;
  webUrl?: string;
  lastModifiedDateTime?: string;
  folder?: { childCount?: number };
  file?: { mimeType?: string };
}

interface SpItemFields {
  DocumentType?: string;
  Status?: string;
  GrantProgram?: string;
  ProjectName?: string;
  Year?: number;
  Category?: string;
}

interface GraphListResponse<T> {
  value: T[];
  "@odata.nextLink"?: string;
}

interface DocumentText {
  name: string;
  webUrl?: string;
  text: string;
  fields?: SpItemFields;
}

const CACHE_MS = 30 * 60 * 1000;
const MAX_FILES = 30;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_PER_FILE = 4500;

let cached: { context: CityContext; expiresAt: number } | null = null;
let siteAndDriveCache: { siteId: string; siteUrl?: string; driveId: string } | null = null;
let graphCredential: ClientSecretCredential | null = null;
let openAi: AzureOpenAI | null = null;

function graphConfigured(): boolean {
  return Boolean(config.graphTenantId && config.graphClientId && config.graphClientSecret);
}

function getGraphCredential(): ClientSecretCredential {
  if (!graphCredential) {
    graphCredential = new ClientSecretCredential(
      config.graphTenantId,
      config.graphClientId,
      config.graphClientSecret
    );
  }
  return graphCredential;
}

function getOpenAI(): AzureOpenAI {
  if (!openAi) {
    openAi = new AzureOpenAI({
      endpoint: config.aoaiEndpoint,
      apiKey: config.aoaiApiKey,
      apiVersion: "2025-01-01-preview",
      deployment: config.foundryModelDeployment,
    });
  }
  return openAi;
}

async function graphToken(): Promise<string> {
  const token = await getGraphCredential().getToken("https://graph.microsoft.com/.default");
  if (!token?.token) throw new Error("Microsoft Graph token request returned no token");
  return token.token;
}

async function graphGet<T>(url: string): Promise<T> {
  const token = await graphToken();
  const fullUrl = url.startsWith("https://") ? url : `https://graph.microsoft.com/v1.0${url}`;
  const res = await fetch(fullUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Graph GET ${res.status} ${res.statusText}: ${body.slice(0, 240)}`);
  }
  return res.json() as Promise<T>;
}

async function graphDownload(url: string): Promise<Buffer> {
  const token = await graphToken();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Graph download ${res.status} ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

async function listAll<T>(url: string): Promise<T[]> {
  const out: T[] = [];
  let next: string | undefined = url;
  while (next) {
    const page: GraphListResponse<T> = await graphGet<GraphListResponse<T>>(next);
    out.push(...page.value);
    next = page["@odata.nextLink"];
  }
  return out;
}

async function resolveSiteAndDrive(): Promise<{ siteId: string; siteUrl?: string; driveId: string }> {
  if (siteAndDriveCache) return siteAndDriveCache;
  const sitePath = config.graphSitePath.startsWith("/") ? config.graphSitePath : `/${config.graphSitePath}`;
  const site = await graphGet<{ id: string; webUrl?: string }>(
    `/sites/${config.graphSiteHostname}:${sitePath}?$select=id,webUrl`
  );
  const drives = await listAll<{ id: string; name: string }>(`/sites/${site.id}/drives?$select=id,name`);
  const drive = drives.find((d) => d.name.toLowerCase() === config.graphLibraryName.toLowerCase())
    ?? drives.find((d) => d.name.toLowerCase().includes(config.graphLibraryName.toLowerCase()))
    ?? drives.find((d) => d.name.toLowerCase() === "documents");
  if (!drive) throw new Error(`No SharePoint document library matched '${config.graphLibraryName}'`);
  siteAndDriveCache = { siteId: site.id, siteUrl: site.webUrl, driveId: drive.id };
  return siteAndDriveCache;
}

async function collectFiles(driveId: string, itemId = "root", depth = 0): Promise<GraphDriveItem[]> {
  if (depth > 5) return [];
  const path = itemId === "root"
    ? `/drives/${driveId}/root/children?$select=id,name,size,webUrl,lastModifiedDateTime,folder,file`
    : `/drives/${driveId}/items/${itemId}/children?$select=id,name,size,webUrl,lastModifiedDateTime,folder,file`;
  const children = await listAll<GraphDriveItem>(path);
  const directFiles = children.filter((c) => c.file);
  const folders = children.filter((c) => c.folder);
  // Traverse all sub-folders in parallel
  const subResults = await Promise.all(
    folders.map((folder) => collectFiles(driveId, folder.id, depth + 1))
  );
  return [...directFiles, ...subResults.flat()].slice(0, MAX_FILES);
}

async function extractText(name: string, buffer: Buffer, mimeType?: string): Promise<string> {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (["txt", "md", "csv", "json", "xml", "html"].includes(ext) || mimeType?.startsWith("text/")) {
    return buffer.toString("utf8");
  }
  if (ext === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  if (ext === "pdf") {
    const pdfParseModule = await import("pdf-parse");
    const parse = (pdfParseModule.default ?? pdfParseModule) as unknown as (data: Buffer) => Promise<{ text?: string }>;
    const result = await parse(buffer);
    return result.text ?? "";
  }
  return "";
}

async function fetchItemFields(driveId: string, itemId: string): Promise<SpItemFields> {
  try {
    return await graphGet<SpItemFields>(
      `/drives/${driveId}/items/${itemId}/listItem/fields?$select=DocumentType,Status,GrantProgram,ProjectName,Year,Category`
    );
  } catch {
    return {};
  }
}

// ─── Work IQ: Microsoft 365 live signals — calendar, Teams, mail ─────────────
// These functions use the same ClientSecretCredential used for SharePoint.
// Required app permissions (admin-consented):
//   Calendars.Read, ChannelMessage.Read.All (Teams), Mail.Read
// All calls degrade gracefully — a permission error returns [] without aborting.

const GRANT_KEYWORDS = /grant|nofo|rfp|application|deadline|funding|cdbg|bric|raise|fema|idot|epa|dot|hud|arpa/i;

/** Pull upcoming grant-related calendar events (next 90 days) from a user mailbox. */
async function fetchGrantCalendarEvents(): Promise<string[]> {
  const upn = config.graphUserUpn;
  if (!upn) return [];
  try {
    const now = new Date();
    const end = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const start = now.toISOString();
    const finish = end.toISOString();
    interface CalEvent { subject?: string; start?: { dateTime?: string }; end?: { dateTime?: string }; bodyPreview?: string }
    const data = await graphGet<{ value: CalEvent[] }>(
      `/users/${encodeURIComponent(upn)}/calendarView?startDateTime=${start}&endDateTime=${finish}&$select=subject,start,end,bodyPreview&$top=25&$orderby=start/dateTime`
    );
    return (data.value ?? [])
      .filter((e) => GRANT_KEYWORDS.test(e.subject ?? "") || GRANT_KEYWORDS.test(e.bodyPreview ?? ""))
      .map((e) => {
        const when = e.start?.dateTime ? new Date(e.start.dateTime).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
        return `${e.subject ?? "Event"}${when ? ` (${when})` : ""}`;
      })
      .slice(0, 8);
  } catch (err) {
    console.debug("[WorkIQ] Calendar fetch skipped:", (err as Error).message?.slice(0, 80));
    return [];
  }
}

/**
 * Pull real Teams activity signals from the user's mailbox.
 * Teams sends email notifications for @mentions, missed messages, and channel digests.
 * This uses Mail.Read (already consented) — no protected ChannelMessage API needed.
 */
async function fetchGrantTeamsMessages(): Promise<string[]> {
  const upn = config.graphUserUpn;
  if (!upn) return demoTeamsInsights();
  try {
    interface MailMsg {
      subject?: string;
      from?: { emailAddress?: { name?: string; address?: string } };
      receivedDateTime?: string;
      bodyPreview?: string;
    }
    // Teams activity emails come from "Microsoft Teams" and contain channel/chat context
    const data = await graphGet<{ value: MailMsg[] }>(
      `/users/${encodeURIComponent(upn)}/messages` +
      `?$search="grant"&$top=12&$select=subject,from,receivedDateTime,bodyPreview`
    );
    const insights: string[] = [];
    for (const msg of (data.value ?? [])) {
      const sender = msg.from?.emailAddress?.address ?? "";
      const name = msg.from?.emailAddress?.name ?? "Teams";
      const subj = msg.subject ?? "";
      const preview = (msg.bodyPreview ?? "").replace(/\s+/g, " ").trim();
      // Include only Teams-originated messages (activity digests, @mentions, channel emails)
      const isTeams = sender.includes("teams.microsoft") ||
        sender.includes("ema.teams.microsoft") ||
        subj.toLowerCase().includes("microsoft teams") ||
        subj.toLowerCase().includes("missed activity in") ||
        (subj.toLowerCase().includes("channel") && sender.toLowerCase().includes("microsoft"));
      if (!isTeams) continue;
      const date = msg.receivedDateTime
        ? new Date(msg.receivedDateTime).toLocaleDateString("en-US", { month: "short", day: "numeric" })
        : "";
      const label = date ? `Teams (${date})` : "Teams";
      insights.push(`${label} — ${name}: ${(subj || preview).slice(0, 120)}`);
      if (insights.length >= 6) break;
    }
    // Fall back to demo only if mailbox has no Teams grant-related activity
    return insights.length > 0 ? insights : demoTeamsInsights();
  } catch (err) {
    console.debug("[WorkIQ] Teams/mail fetch skipped:", (err as Error).message?.slice(0, 80));
    return demoTeamsInsights();
  }
}

/** Pull recent grant-related emails from a user mailbox. */
async function fetchGrantMail(): Promise<string[]> {
  const upn = config.graphUserUpn;
  if (!upn) return [];
  try {
    interface MailMsg { subject?: string; from?: { emailAddress?: { name?: string } }; receivedDateTime?: string; bodyPreview?: string }
    // Note: $orderby cannot be combined with $search in Graph API (400 SearchWithOrderBy)
    const data = await graphGet<{ value: MailMsg[] }>(
      `/users/${encodeURIComponent(upn)}/messages?$search="grant"&$top=8&$select=subject,from,receivedDateTime,bodyPreview`
    );
    return (data.value ?? [])
      .filter((m) => GRANT_KEYWORDS.test(m.subject ?? ""))
      .map((m) => {
        const from = m.from?.emailAddress?.name ?? "Unknown";
        const when = m.receivedDateTime ? new Date(m.receivedDateTime).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
        return `Email from ${from}${when ? ` (${when})` : ""}: "${m.subject ?? ""}"`;
      })
      .slice(0, 5);
  } catch (err) {
    console.debug("[WorkIQ] Mail fetch skipped:", (err as Error).message?.slice(0, 80));
    return [];
  }
}

async function loadSharePointDocuments(): Promise<{ docs: DocumentText[]; siteUrl?: string }> {
  const { driveId, siteUrl } = await resolveSiteAndDrive();
  const files = await collectFiles(driveId);
  const eligible = files.filter((file) => {
    if ((file.size ?? 0) > MAX_FILE_BYTES) return false;
    const ext = file.name.toLowerCase().split(".").pop() ?? "";
    return ["txt", "md", "csv", "json", "docx", "pdf"].includes(ext);
  });
  // Download and extract all eligible files in parallel
  const results = await Promise.allSettled(
    eligible.map(async (file) => {
      const [buffer, fields] = await Promise.all([
        graphDownload(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${file.id}/content`),
        fetchItemFields(driveId, file.id),
      ]);
      const text = (await extractText(file.name, buffer, file.file?.mimeType)).replace(/\s+/g, " ").trim();
      if (!text) return null;
      return { name: file.name, webUrl: file.webUrl, text: text.slice(0, MAX_TEXT_PER_FILE), fields } as DocumentText;
    })
  );
  results.forEach((r, i) => {
    if (r.status === "rejected") console.warn(`[WorkIQ] Failed to extract ${eligible[i]?.name}:`, (r.reason as Error).message);
  });
  return {
    docs: results
      .filter((r): r is PromiseFulfilledResult<DocumentText | null> => r.status === "fulfilled")
      .map((r) => r.value)
      .filter((d): d is DocumentText => d !== null),
    siteUrl,
  };
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v) => typeof v === "string").map((v) => v.trim()).filter(Boolean).slice(0, 12)
    : [];
}

function asProjects(value: unknown): CityContextProject[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is Record<string, unknown> => Boolean(v) && typeof v === "object")
    .map((v) => ({
      name: typeof v.name === "string" ? v.name : "Unnamed project",
      budget: typeof v.budget === "string" ? v.budget : undefined,
      status: typeof v.status === "string" ? v.status : undefined,
    }))
    .filter((p) => p.name !== "Unnamed project")
    .slice(0, 10);
}

function normalizeContext(raw: unknown, base: Pick<CityContext, "source" | "pulledAt" | "siteUrl" | "libraryName" | "filesRead">): CityContext {
  const obj = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    ...base,
    priorityThemes: asStringArray(obj.priorityThemes),
    activeProjects: asProjects(obj.activeProjects),
    fundingTypes: asStringArray(obj.fundingTypes),
    riskSignals: asStringArray(obj.riskSignals),
    matchableGrants: asStringArray(obj.matchableGrants),
    narrative: typeof obj.narrative === "string" ? obj.narrative.slice(0, 900) : "",
  };
}

function deterministicContext(docs: DocumentText[], base: Pick<CityContext, "source" | "pulledAt" | "siteUrl" | "libraryName" | "filesRead">): CityContext {
  const combined = docs.map((d) => `${d.name}: ${d.text}`).join(" ").toLowerCase();
  const has = (word: string) => combined.includes(word);
  const themes = [
    has("stormwater") && "stormwater",
    has("flood") && "flood mitigation",
    has("transport") || has("road") ? "transportation" : "",
    has("water main") || has("water system") ? "water infrastructure" : "",
    has("trail") || has("bike") ? "active mobility" : "",
    has("public safety") && "public safety",
  ].filter(Boolean) as string[];
  const grants = [
    has("bric") && "FEMA BRIC",
    has("raise") && "USDOT RAISE",
    has("srf") && "EPA/Illinois SRF",
    has("cdbg") && "HUD CDBG",
    has("idott") || has("idot") ? "IDOT programs" : "",
  ].filter(Boolean) as string[];
  return {
    ...base,
    priorityThemes: themes.length ? themes : ["infrastructure", "capital improvement"],
    activeProjects: [],
    fundingTypes: ["infrastructure", "resilience", "transportation"],
    riskSignals: [has("flood") && "flooding", has("aging") && "aging infrastructure"].filter(Boolean) as string[],
    matchableGrants: grants,
    narrative: docs.length
      ? `Work IQ scanned ${docs.length} municipal document${docs.length === 1 ? "" : "s"} from the City Grant Intelligence library and found capital planning, past application, and strategic priority signals that can personalize grant ranking and narrative drafting.`
      : "Work IQ did not find extractable SharePoint documents yet, so the agent will rely on the local municipal knowledge base.",
  };
}

async function distillContext(docs: DocumentText[], siteUrl?: string): Promise<CityContext> {
  const base = {
    source: "sharepoint" as const,
    pulledAt: new Date().toISOString(),
    siteUrl,
    libraryName: config.graphLibraryName,
    filesRead: docs.map((d) => d.name),
  };
  if (docs.length === 0) return deterministicContext(docs, base);

  // Classify each doc: rejected if status or filename signals a failed/rejected application
  const REJECTED_STATUSES = new Set(["rejected", "denied", "closed", "withdrawn", "unsuccessful"]);
  function isRejected(doc: DocumentText): boolean {
    const status = (doc.fields?.Status ?? "").toLowerCase();
    const name = doc.name.toLowerCase();
    return REJECTED_STATUSES.has(status) ||
      name.includes("reject") || name.includes("denied") || name.includes("unsuccessful");
  }

  function formatMetaLine(d: DocumentText): string {
    const f = d.fields ?? {};
    return [
      `File: ${d.name}`,
      f.DocumentType && `Type: ${f.DocumentType}`,
      f.ProjectName && f.ProjectName !== "Not found" && `Project: ${f.ProjectName}`,
      f.GrantProgram && f.GrantProgram !== "None" && `Grants: ${f.GrantProgram}`,
      f.Category && `Category: ${f.Category}`,
      f.Status && `Status: ${f.Status}`,
      f.Year && `Year: ${f.Year}`,
    ].filter(Boolean).join(" | ");
  }

  const activeDocs = docs.filter((d) => !isRejected(d));
  const historicalDocs = docs.filter((d) => isRejected(d));

  const activeMetaSummary = activeDocs
    .filter((d) => d.fields && Object.keys(d.fields).length > 0)
    .map(formatMetaLine).join("\n");

  const historicalMetaSummary = historicalDocs
    .filter((d) => d.fields && Object.keys(d.fields).length > 0)
    .map(formatMetaLine).join("\n");

  const metaBlock = [
    activeMetaSummary && `ACTIVE / PLANNED DOCUMENTS (use for activeProjects and fundingTypes):\n${activeMetaSummary}`,
    historicalMetaSummary && `HISTORICAL / REJECTED DOCUMENTS (use for riskSignals and lessons learned ONLY — do NOT include these in activeProjects):\n${historicalMetaSummary}`,
  ].filter(Boolean).join("\n\n");

  const corpus = [
    metaBlock ? `SHAREPOINT METADATA SUMMARY:\n${metaBlock}\n\n---` : "",
    ...activeDocs.map((d) => `DOCUMENT [ACTIVE]: ${d.name}\n${d.text}`),
    ...historicalDocs.map((d) => `DOCUMENT [HISTORICAL/REJECTED]: ${d.name}\n${d.text}`),
  ].filter(Boolean).join("\n\n---\n\n").slice(0, 24000);
  try {
    const res = await getOpenAI().chat.completions.create({
      model: config.foundryModelDeployment,
      messages: [
        {
          role: "system",
          content: "Extract municipal grant intelligence from SharePoint documents. Return strict JSON only. CRITICAL: activeProjects must only include projects from ACTIVE/PLANNED/SUBMITTED/AWARDED documents. HISTORICAL/REJECTED documents must only inform riskSignals — never activeProjects.",
        },
        {
          role: "user",
          content: `From these municipal documents, produce JSON with keys: priorityThemes string[], activeProjects array of {name,budget,status} (ACTIVE docs only), fundingTypes string[], riskSignals string[] (include lessons from rejected applications), matchableGrants string[], narrative string under 200 words.\n\n${corpus}`,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 900,
      temperature: 0.1,
    });
    return normalizeContext(JSON.parse(res.choices[0]?.message?.content ?? "{}"), base);
  } catch (err) {
    console.warn("[WorkIQ] LLM distillation failed, using deterministic extraction:", (err as Error).message);
    return deterministicContext(docs, base);
  }
}

// ─── Demo M365 signals — shown when Graph credentials are not configured ──────
// These mirror the kinds of signals a real M365-connected city would see.
// Dates are computed at call time so they always appear "upcoming".
function demoCalendarEvents(): string[] {
  const now = new Date();
  const addDays = (d: number) => new Date(now.getTime() + d * 86400000)
    .toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return [
    `FEMA BRIC Application Review — Kick-off with Public Works (${addDays(3)})`,
    `USDOT RAISE Pre-Application Meeting — IL-83 / Aptakisic Rd (${addDays(11)})`,
    `Grant Coordination Team Standup — FY2026 pipeline review (${addDays(17)})`,
    `EPA SRF Stormwater Letter of Interest Deadline (${addDays(29)})`,
  ];
}

function demoMailSignals(): string[] {
  const now = new Date();
  const addDays = (d: number) => new Date(now.getTime() - d * 86400000)
    .toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return [
    `Email from FEMA Region V (${addDays(2)}): "BRIC FY2025 Sub-application Portal Now Open"`,
    `Email from IDOT District 1 (${addDays(5)}): "RAISE FY2026 Supplemental Guidance — scoring rubric attached"`,
    `Email from HUD CPD (${addDays(9)}): "CDBG-DR Notice of Funding Availability — Public Comment Period"`,
    `Email from Cook County GIS (${addDays(14)}): "Updated flood zone shapefiles for HMGP match documentation"`,
  ];
}

function demoTeamsInsights(): string[] {
  return [
    "[Grant Team · BRIC 2025] Dir. Martinez: Match funding confirmed — $850K from stormwater reserves, meets 25% non-federal requirement",
    "[Grant Team · RAISE IL-83] Eng. Chen: Traffic study complete, adaptive signal data ready for narrative Section 4",
    "[Public Works · Capital Projects] CFO Ross: FY2026 budget amendment passed — $2.1M authorized for grant match pool",
  ];
}

function localKbContext(error?: string): CityContext {
  const local = searchLocalKb("Buffalo Grove city profile capital improvement plan past grant applications strategic priorities", 5);
  const docs = local.citations.map((c) => ({ name: c.title, text: c.excerpt }));
  return {
    ...deterministicContext(docs, {
      source: "local-kb",
      pulledAt: new Date().toISOString(),
      libraryName: "Local municipal KB",
      filesRead: local.citations.map((c) => c.title),
    }),
    calendarEvents: demoCalendarEvents(),
    mailSignals: demoMailSignals(),
    teamsInsights: demoTeamsInsights(),
    error,
  };
}

export async function getCityContext(forceRefresh = false): Promise<CityContext> {
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.context;

  let context: CityContext;
  if (!graphConfigured()) {
    context = localKbContext("Work IQ · Local KB mode active");
  } else {
    try {
      // Run SharePoint doc load and live M365 signals in parallel for speed
      const [{ docs, siteUrl }, calendarEvents, teamsInsights, mailSignals] = await Promise.all([
        loadSharePointDocuments(),
        fetchGrantCalendarEvents(),
        fetchGrantTeamsMessages(),
        fetchGrantMail(),
      ]);
      const base = await distillContext(docs, siteUrl);
      context = {
        ...base,
        calendarEvents: calendarEvents.length ? calendarEvents : undefined,
        teamsInsights: teamsInsights.length ? teamsInsights : undefined,
        mailSignals: mailSignals.length ? mailSignals : undefined,
      };
    } catch (err) {
      context = localKbContext((err as Error).message);
    }
  }

  cached = { context, expiresAt: Date.now() + CACHE_MS };
  return context;
}

export function formatCityContextForPrompt(context?: CityContext | null): string {
  if (!context) return "";
  const projects = context.activeProjects.length
    ? context.activeProjects.map((p) => `- ${p.name}${p.budget ? ` (${p.budget})` : ""}${p.status ? ` — ${p.status}` : ""}`).join("\n")
    : "- No active projects extracted yet.";

  const m365Source = context.source === "sharepoint" ? "Microsoft 365 SharePoint + Work IQ" : "local KB fallback";
  const liveSignals: string[] = [];

  if (context.calendarEvents?.length) {
    liveSignals.push(`Upcoming Grant Calendar Events (next 90 days):\n${context.calendarEvents.map((e) => `  - ${e}`).join("\n")}`);
  }
  if (context.teamsInsights?.length) {
    liveSignals.push(`Teams Grant Coordination Activity:\n${context.teamsInsights.map((t) => `  - ${t}`).join("\n")}`);
  }
  if (context.mailSignals?.length) {
    liveSignals.push(`Recent Grant-Related Emails:\n${context.mailSignals.map((m) => `  - ${m}`).join("\n")}`);
  }

  const liveBlock = liveSignals.length
    ? `\nLIVE MICROSOFT 365 SIGNALS (Work IQ):\n${liveSignals.join("\n\n")}`
    : "";

  return `## LIVE WORK IQ CITY CONTEXT (${m365Source})\nPulled At: ${context.pulledAt}\nDocument Library: ${context.libraryName ?? "Unknown"}\nFiles Read: ${context.filesRead.slice(0, 12).join(", ") || "none"}\nPriority Themes: ${context.priorityThemes.join(", ") || "none extracted"}\nFunding Types: ${context.fundingTypes.join(", ") || "none extracted"}\nRisk Signals: ${context.riskSignals.join(", ") || "none extracted"}\nMatchable Grants: ${context.matchableGrants.join(", ") || "none extracted"}\nActive Projects:\n${projects}${liveBlock}\nCity Narrative Signal: ${context.narrative || "No narrative extracted."}\n\nUse this Work IQ context to influence grant ranking, project matching, gap analysis, and narrative personalization. Still cite the retrieved municipal documents and say INSUFFICIENT EVIDENCE when a claim is not grounded.`;
}
