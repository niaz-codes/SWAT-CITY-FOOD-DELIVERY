# Sets every variable from backend/.env on the Railway "backend" service
# (production environment), then adds the production-only values that
# DEPLOYMENT.md requires. Values are passed through stdin where possible so
# spaces and special characters survive without fragile quoting.
#
# Usage:  pwsh -File scripts/railway-backend-vars.ps1
# Run from the repository root. Requires: railway CLI linked to the
# swat-city-backend project (cd backend; railway link), and the "backend"
# service to exist (railway up creates it).

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

# Keys handled separately (never copied straight from .env)
$skip = @('NODE_ENV', 'PORT', 'PUBLIC_API_URL', 'CORS_ORIGIN')

$lines = Get-Content (Join-Path $repoRoot 'backend/.env') -Encoding UTF8
foreach ($line in $lines) {
    $t = $line.Trim()
    if (-not $t -or $t.StartsWith('#')) { continue }
    $i = $t.IndexOf('=')
    if ($i -lt 1) { continue }
    $key = $t.Substring(0, $i).Trim()
    $val = $t.Substring($i + 1).Trim().Trim('"').Trim("'")
    if ($skip -contains $key) { continue }
    $val | railway variable set $key --stdin --skip-deploys --json 2>&1 | Out-Null
    Write-Output "set $key"
}

# Production-only values (see DEPLOYMENT.md "Backend on Railway")
railway variable set NODE_ENV=production --skip-deploys --json 2>&1 | Out-Null
railway variable set NIXPACKS_NODE_VERSION=22 --skip-deploys --json 2>&1 | Out-Null
railway variable set "PUBLIC_API_URL=https://backend-production-73f5.up.railway.app" --skip-deploys --json 2>&1 | Out-Null
Write-Output "set NODE_ENV, NIXPACKS_NODE_VERSION, PUBLIC_API_URL"

Write-Output "Done. Trigger a redeploy: cd backend; railway redeploy -y"
