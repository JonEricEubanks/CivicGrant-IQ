import "dotenv/config";

function require_env(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required environment variable: ${name}`);
  return val;
}

export const config = {
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

  // Azure Resource details (for reference — set in .env, never hardcode)
  subscriptionId: process.env.AZURE_SUBSCRIPTION_ID ?? "",
  resourceGroup: process.env.AZURE_RESOURCE_GROUP ?? "rg-skillsfest",
  location: process.env.AZURE_LOCATION ?? "eastus2",
};
