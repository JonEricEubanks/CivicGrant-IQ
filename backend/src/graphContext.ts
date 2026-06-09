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

interface GraphListResponse<T> {
  value: T[];
  "@odata.nextLink"?: string;
}

interface DocumentText {
  name: string;
  webUrl?: string;
  text: string;
}

const CACHE_MS = 30 * 60 * 1000;
const MAX_FILES = 30;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_PER_FILE = 4500;

let cached: { context: CityContext; expiresAt: number } | null = null;
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
  const sitePath = config.graphSitePath.startsWith("/") ? config.graphSitePath : `/${config.graphSitePath}`;
  const site = await graphGet<{ id: string; webUrl?: string }>(
    `/sites/${config.graphSiteHostname}:${sitePath}?$select=id,webUrl`
  );
  const drives = await listAll<{ id: string; name: string }>(`/sites/${site.id}/drives?$select=id,name`);
  const drive = drives.find((d) => d.name.toLowerCase() === config.graphLibraryName.toLowerCase())
    ?? drives.find((d) => d.name.toLowerCase().includes(config.graphLibraryName.toLowerCase()))
    ?? drives.find((d) => d.name.toLowerCase() === "documents");
  if (!drive) throw new Error(`No SharePoint document library matched '${config.graphLibraryName}'`);
  return { siteId: site.id, siteUrl: site.webUrl, driveId: drive.id };
}

async function collectFiles(driveId: string, itemId = "root", depth = 0): Promise<GraphDriveItem[]> {
  if (depth > 5) return [];
  const path = itemId === "root"
    ? `/drives/${driveId}/root/children?$select=id,name,size,webUrl,lastModifiedDateTime,folder,file`
    : `/drives/${driveId}/items/${itemId}/children?$select=id,name,size,webUrl,lastModifiedDateTime,folder,file`;
  const children = await listAll<GraphDriveItem>(path);
  const out: GraphDriveItem[] = [];
  for (const child of children) {
    if (out.length >= MAX_FILES) break;
    if (child.folder) {
      out.push(...await collectFiles(driveId, child.id, depth + 1));
    } else if (child.file) {
      out.push(child);
    }
  }
  return out.slice(0, MAX_FILES);
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

async function loadSharePointDocuments(): Promise<{ docs: DocumentText[]; siteUrl?: string }> {
  const { driveId, siteUrl } = await resolveSiteAndDrive();
  const files = await collectFiles(driveId);
  const docs: DocumentText[] = [];
  for (const file of files) {
    if ((file.size ?? 0) > MAX_FILE_BYTES) continue;
    const ext = file.name.toLowerCase().split(".").pop() ?? "";
    if (!["txt", "md", "csv", "json", "docx", "pdf"].includes(ext)) continue;
    try {
      const buffer = await graphDownload(`https://graph.microsoft.com/v1.0/drives/${driveId}/items/${file.id}/content`);
      const text = (await extractText(file.name, buffer, file.file?.mimeType)).replace(/\s+/g, " ").trim();
      if (text) docs.push({ name: file.name, webUrl: file.webUrl, text: text.slice(0, MAX_TEXT_PER_FILE) });
    } catch (err) {
      console.warn(`[WorkIQ] Failed to extract ${file.name}:`, (err as Error).message);
    }
  }
  return { docs, siteUrl };
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
  const corpus = docs.map((d) => `DOCUMENT: ${d.name}\n${d.text}`).join("\n\n---\n\n").slice(0, 24000);
  try {
    const res = await getOpenAI().chat.completions.create({
      model: config.foundryModelDeployment,
      messages: [
        {
          role: "system",
          content: "Extract municipal grant intelligence from SharePoint documents. Return strict JSON only.",
        },
        {
          role: "user",
          content: `From these municipal documents, produce JSON with keys: priorityThemes string[], activeProjects array of {name,budget,status}, fundingTypes string[], riskSignals string[], matchableGrants string[], narrative string under 200 words.\n\n${corpus}`,
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
    error,
  };
}

export async function getCityContext(forceRefresh = false): Promise<CityContext> {
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.context;

  let context: CityContext;
  if (!graphConfigured()) {
    context = localKbContext("Microsoft Graph is not configured. Set GRAPH_TENANT_ID, GRAPH_CLIENT_ID, and GRAPH_CLIENT_SECRET.");
  } else {
    try {
      const { docs, siteUrl } = await loadSharePointDocuments();
      context = await distillContext(docs, siteUrl);
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
  return `## LIVE WORK IQ CITY CONTEXT (${context.source === "sharepoint" ? "Microsoft 365 SharePoint" : "local KB fallback"})\nPulled At: ${context.pulledAt}\nDocument Library: ${context.libraryName ?? "Unknown"}\nFiles Read: ${context.filesRead.slice(0, 12).join(", ") || "none"}\nPriority Themes: ${context.priorityThemes.join(", ") || "none extracted"}\nFunding Types: ${context.fundingTypes.join(", ") || "none extracted"}\nRisk Signals: ${context.riskSignals.join(", ") || "none extracted"}\nMatchable Grants: ${context.matchableGrants.join(", ") || "none extracted"}\nActive Projects:\n${projects}\nCity Narrative Signal: ${context.narrative || "No narrative extracted."}\n\nUse this Work IQ context to influence grant ranking, project matching, gap analysis, and narrative personalization. Still cite the retrieved municipal documents and say INSUFFICIENT EVIDENCE when a claim is not grounded.`;
}
