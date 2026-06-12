/**
 * Fabric IQ Route — live Microsoft Fabric integration
 *
 * Three data layers:
 *  1. Fabric REST API  — workspace item discovery, graph model GQL traversals
 *  2. SQL Analytics    — T-SQL queries against GrantLakehouse via mssql + AAD token
 *  3. Context builder  — formatted prompt context for agent injection
 */
import { Router, Request, Response } from "express";
import { ClientSecretCredential } from "@azure/identity";
import sql from "mssql";
import { config } from "../config";

export const fabricIqRouter = Router();

// ─── Fabric REST helpers ────────────────────────────────────────────────────

const FABRIC_BASE = "https://api.fabric.microsoft.com/v1";
const FABRIC_SCOPE = "https://api.fabric.microsoft.com/.default";
const SQL_SCOPE    = "https://database.windows.net/.default";

async function getFabricToken(): Promise<string> {
  const cred = new ClientSecretCredential(
    config.fabricTenantId,
    config.fabricClientId,
    config.fabricClientSecret,
  );
  const t = await cred.getToken(FABRIC_SCOPE);
  return t.token;
}

async function getSqlToken(): Promise<string> {
  const cred = new ClientSecretCredential(
    config.fabricTenantId,
    config.fabricClientId,
    config.fabricClientSecret,
  );
  const t = await cred.getToken(SQL_SCOPE);
  return t.token;
}

async function fabricGet(path: string): Promise<unknown> {
  const token = await getFabricToken();
  const res = await fetch(`${FABRIC_BASE}/${path}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Fabric API ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function fabricPost(path: string, body: unknown): Promise<unknown> {
  const token = await getFabricToken();
  const res = await fetch(`${FABRIC_BASE}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Fabric API POST ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── Workspace items ────────────────────────────────────────────────────────

interface FabricItem {
  id: string;
  displayName: string;
  type: string;
  description?: string;
}

async function getWorkspaceItems(): Promise<FabricItem[]> {
  const data = await fabricGet(`workspaces/${config.fabricWorkspaceId}/items`) as { value: FabricItem[] };
  return data.value ?? [];
}

// ─── Lakehouse tables (via SQL Analytics Endpoint) ─────────────────────────

export interface GrantTableRow {
  [key: string]: string | number | boolean | null;
}

async function queryGrantLakehouse(query: string): Promise<GrantTableRow[]> {
  const token = await getSqlToken();
  const pool = await sql.connect({
    server: config.fabricSqlEndpoint,
    database: "GrantLakehouse",
    options: { encrypt: true, trustServerCertificate: false, connectTimeout: 15000, requestTimeout: 20000 },
    authentication: {
      type: "azure-active-directory-access-token",
      options: { token },
    },
  } as sql.config);

  try {
    const result = await pool.request().query(query);
    return result.recordset as GrantTableRow[];
  } finally {
    await pool.close();
  }
}

async function discoverLakehouseTables(): Promise<string[]> {
  const rows = await queryGrantLakehouse(`
    SELECT TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE = 'BASE TABLE'
    ORDER BY TABLE_NAME
  `);
  return rows.map((r) => String(r.TABLE_NAME));
}

async function getGrantSummary(): Promise<GrantTableRow[]> {
  // Attempt to query the most useful table — prefer dim_grant, then any grant table, then first available
  const tables = await discoverLakehouseTables();
  const grantTable = tables.find((t) => /dim_grant/i.test(t))
    ?? tables.find((t) => /grant/i.test(t))
    ?? tables[0];

  if (!grantTable) return [];

  // Pull top grants directly — mssql returns typed rows even without schema probe
  try {
    const rows = await queryGrantLakehouse(`SELECT TOP 20 * FROM [dbo].[${grantTable}]`);
    return rows;
  } catch {
    // Table may not be in dbo schema
    try {
      const rows = await queryGrantLakehouse(`SELECT TOP 20 * FROM [${grantTable}]`);
      return rows;
    } catch {
      return [];
    }
  }
}

// ─── Graph model GQL traversal ─────────────────────────────────────────────

interface GqlResult {
  paths?: Array<{
    nodes: Array<{ id: string; label: string; properties: Record<string, unknown> }>;
    edges: Array<{ label: string; properties: Record<string, unknown> }>;
  }>;
  [key: string]: unknown;
}

async function findGraphModelId(): Promise<string | null> {
  const items = await getWorkspaceItems();
  const graphItem = items.find((i) => i.type === "GraphModel" || i.type === "GraphQLApi");
  return graphItem?.id ?? null;
}

async function runGqlTraversal(graphModelId: string, gql: string): Promise<GqlResult> {
  // The executeQuery endpoint is in preview — pass preview=true as a URL query param
  const token = await getFabricToken();
  const url = `${FABRIC_BASE}/workspaces/${config.fabricWorkspaceId}/graphModels/${graphModelId}/executeQuery?preview=true`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: gql }),
  });
  if (!res.ok) throw new Error(`GQL executeQuery → ${res.status}: ${await res.text()}`);
  return res.json() as Promise<GqlResult>;
}

// ─── Context builder ────────────────────────────────────────────────────────

export interface FabricIqContext {
  source: "fabric-live" | "fabric-partial" | "fabric-offline";
  pulledAt: string;
  workspaceId: string;
  items: { name: string; type: string }[];
  tables: string[];
  grantRows: GrantTableRow[];
  graphPaths: GqlResult | null;
  semanticModelName: string | null;
  error?: string;
}

export function formatFabricContextForPrompt(ctx: FabricIqContext): string {
  const lines: string[] = [];
  lines.push(`[Fabric IQ Context — ${ctx.source} @ ${ctx.pulledAt}]`);
  lines.push(`Workspace: ${ctx.workspaceId}`);

  if (ctx.items.length) {
    lines.push(`\nWorkspace items (${ctx.items.length}):`);
    for (const item of ctx.items) lines.push(`  • ${item.name} (${item.type})`);
  }

  if (ctx.semanticModelName) {
    lines.push(`\nSemantic model: ${ctx.semanticModelName} — grant portfolio KPIs and scoring dimensions ready`);
  }

  if (ctx.tables.length) {
    lines.push(`\nGrantLakehouse tables: ${ctx.tables.join(", ")}`);
  }

  if (ctx.grantRows.length) {
    lines.push(`\nLive grant data from GrantLakehouse (${ctx.grantRows.length} rows):`);
    for (const row of ctx.grantRows.slice(0, 8)) {
      const summary = Object.entries(row)
        .filter(([, v]) => v !== null)
        .slice(0, 5)
        .map(([k, v]) => `${k}=${v}`)
        .join(" | ");
      lines.push(`  • ${summary}`);
    }
  }

  if (ctx.graphPaths?.paths?.length) {
    lines.push(`\nGrantLifecycle graph traversal (${ctx.graphPaths.paths.length} paths found):`);
    for (const path of ctx.graphPaths.paths.slice(0, 4)) {
      const nodeLabels = path.nodes.map((n) => `${n.label}[${n.id}]`).join(" → ");
      lines.push(`  • ${nodeLabels}`);
    }
  }

  if (ctx.error) lines.push(`\n⚠ Partial data (${ctx.error})`);

  return lines.join("\n");
}

// ─── Context fetcher (cached 3 min) ─────────────────────────────────────────

let contextCache: { ctx: FabricIqContext; expiresAt: number } | null = null;
const CACHE_TTL_MS = 3 * 60 * 1000;

export async function getFabricContext(force = false): Promise<FabricIqContext> {
  if (!force && contextCache && Date.now() < contextCache.expiresAt) {
    return contextCache.ctx;
  }

  const pulledAt = new Date().toISOString();
  const ctx: FabricIqContext = {
    source: "fabric-offline",
    pulledAt,
    workspaceId: config.fabricWorkspaceId,
    items: [],
    tables: [],
    grantRows: [],
    graphPaths: null,
    semanticModelName: null,
  };

  if (!config.fabricClientId || !config.fabricClientSecret || !config.fabricTenantId) {
    ctx.error = "FABRIC_CLIENT_ID / FABRIC_CLIENT_SECRET / FABRIC_TENANT_ID not configured";
    return ctx;
  }

  try {
    // 1. Workspace items
    const allItems = await getWorkspaceItems();
    ctx.items = allItems.map((i) => ({ name: i.displayName, type: i.type }));

    const semanticModel = allItems.find((i) => i.type === "SemanticModel");
    ctx.semanticModelName = semanticModel?.displayName ?? null;

    ctx.source = "fabric-partial";

    // 2. SQL — table discovery + grant data
    try {
      ctx.tables = await discoverLakehouseTables();
      ctx.grantRows = await getGrantSummary();
    } catch (sqlErr) {
      ctx.error = `SQL: ${(sqlErr as Error).message}`;
    }

    // 3. Graph model GQL traversal
    try {
      const graphModelId = await findGraphModelId();
      if (graphModelId) {
        ctx.graphPaths = await runGqlTraversal(graphModelId, `
          MATCH (g:Grant)-[r]-(c)
          RETURN g, r, c
          LIMIT 12
        `);
      }
    } catch (gqlErr) {
      ctx.error = (ctx.error ? ctx.error + " | " : "") + `GQL: ${(gqlErr as Error).message}`;
    }

    if (ctx.tables.length > 0 || ctx.graphPaths) ctx.source = "fabric-live";
  } catch (err) {
    ctx.error = (err as Error).message;
  }

  contextCache = { ctx, expiresAt: Date.now() + CACHE_TTL_MS };
  return ctx;
}

// ─── Routes ─────────────────────────────────────────────────────────────────

/** GET /api/fabric-iq/context — full Fabric IQ context (3 min cache) */
fabricIqRouter.get("/context", async (_req: Request, res: Response) => {
  try {
    const ctx = await getFabricContext(false);
    res.json(ctx);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** POST /api/fabric-iq/refresh — force-refresh the cache */
fabricIqRouter.post("/refresh", async (_req: Request, res: Response) => {
  try {
    const ctx = await getFabricContext(true);
    res.json(ctx);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** POST /api/fabric-iq/sql — run an arbitrary read-only SQL query (demo endpoint) */
fabricIqRouter.post("/sql", async (req: Request, res: Response) => {
  const { query } = req.body as { query?: string };
  if (!query || typeof query !== "string") {
    res.status(400).json({ error: "query is required" });
    return;
  }
  // Block DML — only allow SELECT/WITH
  const trimmed = query.trim().toUpperCase();
  if (!trimmed.startsWith("SELECT") && !trimmed.startsWith("WITH")) {
    res.status(400).json({ error: "Only SELECT/WITH queries are allowed" });
    return;
  }
  try {
    const rows = await queryGrantLakehouse(query);
    res.json({ rows, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
