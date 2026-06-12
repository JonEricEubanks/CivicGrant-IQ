import "dotenv/config";

/**
 * When FORCE_MOCK_MODE=true, all Azure credential env vars become optional.
 * The Tier 3 mock engine runs the full pipeline in <200ms with zero credentials,
 * enabling reliable live demos even without Azure access.
 */
const mockMode = process.env.FORCE_MOCK_MODE === "true";

function require_env(name: string): string {
  const val = process.env[name];
  if (!val && !mockMode) throw new Error(`Missing required environment variable: ${name}`);
  return val ?? "";
}

export const config = {
  // Mock mode — set FORCE_MOCK_MODE=true to run the full pipeline without Azure credentials
  mockMode,

  // Azure AI Search Free tier (civicgrant-srch) — $0/month
  searchEndpoint: require_env("SEARCH_ENDPOINT"),
  searchApiKey: require_env("SEARCH_API_KEY"),
  knowledgeBaseName: process.env.KNOWLEDGE_BASE_NAME ?? "civicgrant-kb",
  // Physical AI Search index queried by the REST fallback path (distinct from the
  // Foundry IQ knowledge base name above). Single source of truth — override via env.
  searchIndexName: process.env.SEARCH_INDEX_NAME ?? "civicgrant-index",

  // Azure Application Insights (civicgrant-insights) — telemetry + tracing
  appInsightsConnectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING ?? "",

  // Azure OpenAI
  aoaiEndpoint: require_env("AOAI_ENDPOINT"),
  aoaiApiKey: require_env("AOAI_API_KEY"),
  aoaiGptDeployment: process.env.AOAI_GPT_DEPLOYMENT ?? "gpt-4o-mini",
  aoaiEmbeddingDeployment: process.env.AOAI_EMBEDDING_DEPLOYMENT ?? "text-embedding-3-large",

  // Microsoft Foundry Project
  foundryProjectEndpoint: require_env("FOUNDRY_PROJECT_ENDPOINT"),
  foundryModelDeployment: process.env.FOUNDRY_MODEL_DEPLOYMENT ?? "gpt-4o-mini",

  // Azure Blob Storage (municipal docs corpus)
  blobConnectionString: process.env.BLOB_CONNECTION_STRING ?? "",
  blobContainerName: process.env.BLOB_CONTAINER_NAME ?? "civicgrant-docs",

  // Microsoft Graph / SharePoint Work IQ context
  graphTenantId: process.env.GRAPH_TENANT_ID ?? "",
  graphClientId: process.env.GRAPH_CLIENT_ID ?? "",
  graphClientSecret: process.env.GRAPH_CLIENT_SECRET ?? "",
  graphSiteHostname: process.env.GRAPH_SITE_HOSTNAME ?? "",
  graphSitePath: process.env.GRAPH_SITE_PATH ?? "",
  graphLibraryName: process.env.GRAPH_LIBRARY_NAME ?? "",
  // Optional: a specific M365 user UPN to pull calendar events and mail from
  graphUserUpn: process.env.GRAPH_USER_UPN ?? "",

  // Microsoft Fabric IQ — GrantLakehouse, GrantLifecycle graph model, GrantPortfolio semantic model
  // Uses a Service Principal with Workspace Member/Contributor role on CivicGrant-IQ
  // Can reuse GRAPH_* credentials if that SP also has Fabric permissions
  fabricTenantId:    process.env.FABRIC_TENANT_ID    || process.env.GRAPH_TENANT_ID    || "",
  fabricClientId:    process.env.FABRIC_CLIENT_ID    || process.env.GRAPH_CLIENT_ID    || "",
  fabricClientSecret: process.env.FABRIC_CLIENT_SECRET || process.env.GRAPH_CLIENT_SECRET || "",
  fabricWorkspaceId:  process.env.FABRIC_WORKSPACE_ID  || "d560d0c7-337a-4784-8be7-ab23b1a945ba",
  fabricSqlEndpoint:  process.env.FABRIC_SQL_ENDPOINT  || "dlfartuhhivupl72ef5u2r4tzy-y7igbvl2gocepc7hvmr3dkkfxi.datawarehouse.fabric.microsoft.com",

  // Azure Resource details (for reference — set in .env, never hardcode)
  subscriptionId: process.env.AZURE_SUBSCRIPTION_ID ?? "",
  resourceGroup: process.env.AZURE_RESOURCE_GROUP ?? "",
  location: process.env.AZURE_LOCATION ?? "eastus2",
};
