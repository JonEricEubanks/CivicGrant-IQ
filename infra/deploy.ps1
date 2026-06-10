#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Deploys all CivicGrant IQ Azure infrastructure to resource group rg-skillsfest.
  AI Search and Azure OpenAI are deployed to eastus2 (required for agentic retrieval).
  Set AZURE_SUBSCRIPTION_ID env var or update $SUBSCRIPTION_ID below before running.

.USAGE
  ./infra/deploy.ps1

.OUTPUT
  Prints all values needed for backend/.env
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Constants ──────────────────────────────────────────────────────────────
# Set your subscription ID here or via $env:AZURE_SUBSCRIPTION_ID
$SUBSCRIPTION_ID   = $env:AZURE_SUBSCRIPTION_ID ?? "<your-subscription-id>"
$RESOURCE_GROUP    = "rg-skillsfest"
$LOCATION          = "northcentralus"   # RG logical location
$AI_LOCATION       = "eastus2"          # AI Search + AOAI must be eastus2 for agentic retrieval
$PREFIX            = "civicgrant"
$SEARCH_NAME       = "$PREFIX-search"
$AOAI_NAME         = "$PREFIX-aoai"
$STORAGE_NAME      = "${PREFIX}store"   # storage names: lowercase, no hyphens, max 24 chars
$BLOB_CONTAINER    = "civicgrant-docs"
$AI_HUB_NAME       = "$PREFIX-hub"
$AI_PROJECT_NAME   = "$PREFIX-project"
$KB_NAME           = "civicgrant-kb"

# ── Pre-flight ─────────────────────────────────────────────────────────────
Write-Host "`n=== CivicGrant IQ Infrastructure Deployment ===" -ForegroundColor Cyan
Write-Host "Subscription : $SUBSCRIPTION_ID"
Write-Host "Resource Group: $RESOURCE_GROUP"
Write-Host "AI Location  : $AI_LOCATION"

az account set --subscription $SUBSCRIPTION_ID
if ($LASTEXITCODE -ne 0) { throw "Failed to set subscription" }

# Ensure RG exists
az group create --name $RESOURCE_GROUP --location $LOCATION --output none

# ── Azure AI Search (Standard tier, eastus2 for agentic retrieval) ────────
Write-Host "`n[1/5] Deploying Azure AI Search ($AI_LOCATION)..." -ForegroundColor Yellow
az search service create `
  --name $SEARCH_NAME `
  --resource-group $RESOURCE_GROUP `
  --location $AI_LOCATION `
  --sku Standard `
  --partition-count 1 `
  --replica-count 1 `
  --output none

$SEARCH_ENDPOINT = "https://$SEARCH_NAME.search.windows.net"
$SEARCH_KEY = (az search admin-key show `
  --service-name $SEARCH_NAME `
  --resource-group $RESOURCE_GROUP `
  --query "primaryKey" -o tsv)

Write-Host "  Search endpoint: $SEARCH_ENDPOINT" -ForegroundColor Green

# ── Azure OpenAI (eastus2) ────────────────────────────────────────────────
Write-Host "`n[2/5] Deploying Azure OpenAI ($AI_LOCATION)..." -ForegroundColor Yellow
az cognitiveservices account create `
  --name $AOAI_NAME `
  --resource-group $RESOURCE_GROUP `
  --location $AI_LOCATION `
  --kind OpenAI `
  --sku S0 `
  --output none

$AOAI_ENDPOINT = (az cognitiveservices account show `
  --name $AOAI_NAME `
  --resource-group $RESOURCE_GROUP `
  --query "properties.endpoint" -o tsv)

# Deploy gpt-4o-mini
az cognitiveservices account deployment create `
  --name $AOAI_NAME `
  --resource-group $RESOURCE_GROUP `
  --deployment-name "gpt-4o-mini" `
  --model-name "gpt-4o-mini" `
  --model-version "2024-07-18" `
  --model-format OpenAI `
  --sku-capacity 40 `
  --sku-name Standard `
  --output none

# Deploy text-embedding-3-large
az cognitiveservices account deployment create `
  --name $AOAI_NAME `
  --resource-group $RESOURCE_GROUP `
  --deployment-name "text-embedding-3-large" `
  --model-name "text-embedding-3-large" `
  --model-version "1" `
  --model-format OpenAI `
  --sku-capacity 120 `
  --sku-name Standard `
  --output none

Write-Host "  AOAI endpoint: $AOAI_ENDPOINT" -ForegroundColor Green

# ── Storage Account + Blob Container ──────────────────────────────────────
Write-Host "`n[3/5] Deploying Storage Account..." -ForegroundColor Yellow
az storage account create `
  --name $STORAGE_NAME `
  --resource-group $RESOURCE_GROUP `
  --location $LOCATION `
  --sku Standard_LRS `
  --kind StorageV2 `
  --output none

$BLOB_CONNECTION_STRING = (az storage account show-connection-string `
  --name $STORAGE_NAME `
  --resource-group $RESOURCE_GROUP `
  --query "connectionString" -o tsv)

az storage container create `
  --name $BLOB_CONTAINER `
  --connection-string $BLOB_CONNECTION_STRING `
  --output none

Write-Host "  Blob container '$BLOB_CONTAINER' created" -ForegroundColor Green

# ── Azure AI Foundry Hub + Project ────────────────────────────────────────
Write-Host "`n[4/5] Deploying AI Foundry Hub + Project ($AI_LOCATION)..." -ForegroundColor Yellow
az ml workspace create `
  --name $AI_HUB_NAME `
  --resource-group $RESOURCE_GROUP `
  --location $AI_LOCATION `
  --kind Hub `
  --output none 2>$null

az ml workspace create `
  --name $AI_PROJECT_NAME `
  --resource-group $RESOURCE_GROUP `
  --location $AI_LOCATION `
  --kind Project `
  --hub-id (az ml workspace show --name $AI_HUB_NAME --resource-group $RESOURCE_GROUP --query id -o tsv) `
  --output none 2>$null

$FOUNDRY_PROJECT_ENDPOINT = (az ml workspace show `
  --name $AI_PROJECT_NAME `
  --resource-group $RESOURCE_GROUP `
  --query "discovery_url" -o tsv 2>$null)

if (-not $FOUNDRY_PROJECT_ENDPOINT) {
  $FOUNDRY_PROJECT_ENDPOINT = "https://$AI_LOCATION.api.azureml.ms/agents/v1.0/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RESOURCE_GROUP/providers/Microsoft.MachineLearningServices/workspaces/$AI_PROJECT_NAME"
}

Write-Host "  Foundry project: $AI_PROJECT_NAME" -ForegroundColor Green

# ── Create Foundry IQ Knowledge Base ──────────────────────────────────────
Write-Host "`n[5/5] Creating Foundry IQ Knowledge Base '$KB_NAME'..." -ForegroundColor Yellow
Write-Host "  Connect AI Search data source to Foundry and create the knowledge base" -ForegroundColor Gray
Write-Host "  in the Azure AI Foundry portal at: https://ai.azure.com" -ForegroundColor Gray
Write-Host "  Knowledge base name: $KB_NAME" -ForegroundColor Gray
Write-Host "  Blob source: $BLOB_CONTAINER in $STORAGE_NAME" -ForegroundColor Gray

# ── Print .env file ────────────────────────────────────────────────────────
Write-Host "`n`n=== Copy the following into backend/.env ===" -ForegroundColor Cyan
$envContent = @"
SEARCH_ENDPOINT=$SEARCH_ENDPOINT
SEARCH_API_KEY=$SEARCH_KEY
KNOWLEDGE_BASE_NAME=$KB_NAME
AOAI_ENDPOINT=$AOAI_ENDPOINT
AOAI_GPT_DEPLOYMENT=gpt-4o-mini
AOAI_EMBEDDING_DEPLOYMENT=text-embedding-3-large
FOUNDRY_PROJECT_ENDPOINT=$FOUNDRY_PROJECT_ENDPOINT
FOUNDRY_MODEL_DEPLOYMENT=gpt-4o-mini
BLOB_CONNECTION_STRING=$BLOB_CONNECTION_STRING
BLOB_CONTAINER_NAME=$BLOB_CONTAINER
AZURE_SUBSCRIPTION_ID=$SUBSCRIPTION_ID
AZURE_RESOURCE_GROUP=$RESOURCE_GROUP
AZURE_LOCATION=$AI_LOCATION
PORT=3001
"@

Write-Host $envContent -ForegroundColor White

# Save to .env
$envPath = Join-Path $PSScriptRoot "..\backend\.env"
$envContent | Set-Content -Path $envPath -Encoding UTF8
Write-Host "`nAlso saved to: $envPath" -ForegroundColor Green
Write-Host "`nDeployment complete!" -ForegroundColor Cyan
