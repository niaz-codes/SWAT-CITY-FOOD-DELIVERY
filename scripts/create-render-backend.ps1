# Creates the Render web service for the Swat City backend.
#
# Reads all secret values from backend/.env and the API key from
# %TEMP%\render-api-key.txt — nothing secret is printed or committed.
# Mirrors render.yaml (free plan, singapore, rootDir backend) and uses the
# same production Supabase project, per the developer's choice.
#
# Usage: powershell -ExecutionPolicy Bypass -File scripts/create-render-backend.ps1
# Prints only non-secret identifiers and the service URL.

$ErrorActionPreference = 'Stop'

$apiKeyFile = Join-Path $env:TEMP 'render-api-key.txt'
if (-not (Test-Path $apiKeyFile)) { throw "API key file not found: $apiKeyFile" }
$apiKey = (Get-Content $apiKeyFile -Raw).Trim()

$repoRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $repoRoot 'backend/.env'

# --- read backend/.env ---
$wanted = @('SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_PUBLISHABLE_KEY', 'ADMIN_EMAIL', 'ADMIN_PASSWORD')
$values = @{}
foreach ($line in Get-Content $envPath -Encoding UTF8) {
    $t = $line.Trim()
    if (-not $t -or $t.StartsWith('#')) { continue }
    $i = $t.IndexOf('=')
    if ($i -lt 1) { continue }
    $k = $t.Substring(0, $i).Trim()
    if ($wanted -contains $k) {
        $v = $t.Substring($i + 1).Trim().Trim('"').Trim("'")
        if ($v) { $values[$k] = $v }
    }
}
$missing = $wanted | Where-Object { -not $values.ContainsKey($_) }
if ($missing) { throw "Missing keys in backend/.env: $($missing -join ', ')" }

$headers = @{
    Authorization = "Bearer $apiKey"
    Accept        = 'application/json'
    'Content-Type' = 'application/json'
}

# --- workspace (owner) ---
# Note: with a single workspace, Invoke-RestMethod collapses the response
# array and exposes the object as `.owner`.
$owners = Invoke-RestMethod -Uri 'https://api.render.com/v1/owners' -Headers $headers -Method Get
$ownerId = if ($owners.owner) { $owners.owner.id } else { $owners[0].id }
Write-Output "Workspace ownerId: $($ownerId.Substring($ownerId.Length - 6))"
if (-not $ownerId) { throw 'Could not resolve ownerId' }

# --- create service ---
$envVars = @(
    @{ key = 'NODE_VERSION'; value = '22' },
    @{ key = 'NODE_ENV'; value = 'production' },
    @{ key = 'CORS_ORIGIN'; value = 'https://admin-web-seven-vert.vercel.app' },
    @{ key = 'SUPABASE_STORAGE_BUCKET'; value = 'swat-city' },
    @{ key = 'JWT_SECRET'; generateValue = $true },
    @{ key = 'JWT_REFRESH_SECRET'; generateValue = $true },
    @{ key = 'SUPABASE_URL'; value = $values['SUPABASE_URL'] },
    @{ key = 'SUPABASE_SECRET_KEY'; value = $values['SUPABASE_SECRET_KEY'] },
    @{ key = 'SUPABASE_PUBLISHABLE_KEY'; value = $values['SUPABASE_PUBLISHABLE_KEY'] },
    @{ key = 'ADMIN_EMAIL'; value = $values['ADMIN_EMAIL'] },
    @{ key = 'ADMIN_PASSWORD'; value = $values['ADMIN_PASSWORD'] }
)

$body = @{
    type               = 'web_service'
    name               = 'swat-city-backend-test'
    ownerId            = $ownerId
    repo               = 'https://github.com/niaz-codes/SWAT-CITY-FOOD-DELIVERY'
    branch             = 'render-test'
    rootDir            = 'backend'
    autoDeployTrigger  = 'off'
    serviceDetails     = @{
        runtime         = 'node'
        plan            = 'free'
        region          = 'singapore'
        healthCheckPath = '/health'
        numInstances    = 1
        envSpecificDetails = @{
            buildCommand = 'npm ci --include=dev && npm run build'
            startCommand = 'npm start'
        }
    }
    envVars = $envVars
} | ConvertTo-Json -Depth 8

try {
    $res = Invoke-RestMethod -Uri 'https://api.render.com/v1/services' -Headers $headers -Method Post -Body $body
} catch {
    $errBody = $_.ErrorDetails.Message
    if ($errBody -match '"code"\s*:\s*"409_NAME_CONFLICT"') {
        Write-Output 'Service swat-city-backend-test already exists (409). Nothing created.'
        exit 0
    }
    Write-Output "Create failed: $errBody"
    throw
}

$svc = $res.service
$svcId = $svc.id
$svcUrl = $svc.serviceDetails.url
Write-Output "service id : $svcId"
Write-Output "service url: $svcUrl"
Write-Output "deploy id  : $($res.deployId)"

$stateFile = Join-Path $env:TEMP 'render-service-info.txt'
@"
svcId=$svcId
url=$svcUrl
"@ | Set-Content $stateFile
Write-Output "Saved $stateFile"
