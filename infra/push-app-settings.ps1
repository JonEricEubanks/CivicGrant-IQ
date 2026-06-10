#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Reads backend/.env and pushes every key=value as an App Service application
  setting to civicgrant-backend, then restarts the app.

.USAGE
  ./infra/push-app-settings.ps1

.PREREQS
  - Azure CLI logged in:  az login
  - Subscription set:     az account set --subscription <id>
  - backend/.env populated with real values (copy from .env.example, fill in)
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$APP_NAME      = "civicgrant-backend"
$RESOURCE_GROUP = "rg-skillsfest"
$ENV_FILE      = Join-Path $PSScriptRoot "..\backend\.env"

# ── Validate ────────────────────────────────────────────────────────────────
if (-not (Test-Path $ENV_FILE)) {
    Write-Error "backend/.env not found. Copy backend/.env.example → backend/.env and fill in your values."
    exit 1
}

Write-Host "`n=== Pushing App Service settings for $APP_NAME ===" -ForegroundColor Cyan

# ── Parse .env (skip blank lines and comments) ─────────────────────────────
$settings = @{}
foreach ($line in Get-Content $ENV_FILE) {
    $trimmed = $line.Trim()
    if ($trimmed -eq "" -or $trimmed.StartsWith("#")) { continue }
    $idx = $trimmed.IndexOf("=")
    if ($idx -lt 1) { continue }
    $key   = $trimmed.Substring(0, $idx).Trim()
    $value = $trimmed.Substring($idx + 1).Trim()
    # Strip inline comments (e.g. VALUE=foo   # comment)
    $commentIdx = $value.IndexOf("   #")
    if ($commentIdx -ge 0) { $value = $value.Substring(0, $commentIdx).Trim() }
    $settings[$key] = $value
}

# ── Add production-required extras ─────────────────────────────────────────
$settings["WEBSITES_PORT"]    = "3001"   # Tells App Service which port to forward to
$settings["NODE_ENV"]         = "production"
$settings["PORT"]             = "3001"

Write-Host "  Found $($settings.Count) settings to push" -ForegroundColor Gray

# ── Build az CLI argument list ──────────────────────────────────────────────
# az webapp config appsettings set expects:  KEY=VALUE KEY2=VALUE2 ...
$pairs = $settings.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }

Write-Host "  Applying settings..." -ForegroundColor Yellow
az webapp config appsettings set `
    --name $APP_NAME `
    --resource-group $RESOURCE_GROUP `
    --settings @pairs `
    --output none

if ($LASTEXITCODE -ne 0) { throw "Failed to set app settings" }
Write-Host "  Settings applied." -ForegroundColor Green

# ── Ensure startup command is set ──────────────────────────────────────────
Write-Host "  Setting startup command..." -ForegroundColor Yellow
az webapp config set `
    --name $APP_NAME `
    --resource-group $RESOURCE_GROUP `
    --startup-file "node dist/index.js" `
    --output none

# ── Restart to pick up new settings ────────────────────────────────────────
Write-Host "  Restarting app..." -ForegroundColor Yellow
az webapp restart --name $APP_NAME --resource-group $RESOURCE_GROUP --output none

Write-Host "`nDone! Backend settings live on $APP_NAME." -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Link SWA to backend:" -ForegroundColor Gray
Write-Host "     Portal -> civicgrant-iq -> Settings -> Linked backends -> Add -> civicgrant-backend" -ForegroundColor Gray
Write-Host "  2. Add GitHub secrets (Settings -> Secrets -> Actions):" -ForegroundColor Gray
Write-Host "     AZURE_STATIC_WEB_APPS_API_TOKEN  - from civicgrant-iq -> Manage deployment token" -ForegroundColor Gray
Write-Host "     AZURE_WEBAPP_PUBLISH_PROFILE     - from civicgrant-backend -> Get publish profile" -ForegroundColor Gray
Write-Host "  3. Push to main -> both workflows deploy automatically." -ForegroundColor Gray
