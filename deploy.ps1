# deploy.ps1 - deploy the telegram-bot edge function from the on-disk committed file.
#
# Parameterized for multiple instances (one Supabase project per couple):
#   .\deploy.ps1 -ProjectRef <ref> [-ExpectedVersion vNN]
#
# This is the deploy spine from docs/DEPLOY_SAFETY_HANDOFF.md section 4 (#1 + #5):
#   1. Run the pre-deploy sanity gate; abort if it fails.
#   2. Deploy from the on-disk file via the Supabase CLI - never an inline string.
#      The committed file is the only deploy origin.
#   3. Smoke-test the deployed function: GET the health route, assert 200, the
#      version baked into index.ts, AND adminConfigured:true (so a missing
#      ADMIN_TELEGRAM_ID secret on this instance fails the deploy loudly instead
#      of silently gating admin commands shut).
#   4. Remind the human to git tag this build as a rollback point.
#
# -ProjectRef is MANDATORY: with multiple instances there is no safe default
# target, and an explicit ref prevents deploying to the wrong project.
# -ExpectedVersion is OPTIONAL; if given it must equal the BUILD_VERSION in
# index.ts (a guard that you are shipping the version you think you are). The
# version actually asserted live is always read from the file, so it cannot drift.

param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectRef,

    [string]$ExpectedVersion
)

$ErrorActionPreference = "Stop"

$Function  = "telegram-bot"
$IndexPath = Join-Path $PSScriptRoot "supabase/functions/$Function/index.ts"
$HealthUrl = "https://$ProjectRef.supabase.co/functions/v1/$Function`?health"

# --- 1. Sanity gate -----------------------------------------------------------
Write-Host "==> Running pre-deploy sanity gate" -ForegroundColor Cyan
& (Join-Path $PSScriptRoot "predeploy-check.ps1")
if ($LASTEXITCODE -ne 0) {
    Write-Host "==> ABORT: predeploy-check failed. Nothing deployed." -ForegroundColor Red
    exit 1
}

# The version asserted post-deploy is read straight out of the file being
# deployed (no drift). If -ExpectedVersion was passed, it must match the file --
# a guard against deploying a version you didn't intend.
$verMatch = Select-String -LiteralPath $IndexPath -Pattern 'const BUILD_VERSION = "([^"]+)";'
if (-not $verMatch) {
    Write-Host "==> ABORT: could not find BUILD_VERSION in $IndexPath" -ForegroundColor Red
    exit 1
}
$FileVersion = $verMatch.Matches[0].Groups[1].Value
if ($ExpectedVersion -and ($ExpectedVersion -ne $FileVersion)) {
    Write-Host "==> ABORT: -ExpectedVersion '$ExpectedVersion' != BUILD_VERSION '$FileVersion' in index.ts." -ForegroundColor Red
    Write-Host "    Bump BUILD_VERSION or fix the argument before deploying." -ForegroundColor Yellow
    exit 1
}
Write-Host "==> Target project:        $ProjectRef" -ForegroundColor Cyan
Write-Host "==> Expected BUILD_VERSION: $FileVersion" -ForegroundColor Cyan

# --- 2. Deploy from disk via the CLI -----------------------------------------
# Run from the repo root ($PSScriptRoot): the supabase CLI resolves the function
# source (supabase/functions/<name>/index.ts) relative to the current directory,
# so the script must not depend on where the user invoked it from.
Write-Host "==> Deploying $Function from disk (CLI, no inline string)" -ForegroundColor Cyan
Push-Location -LiteralPath $PSScriptRoot
try {
    & supabase functions deploy $Function --project-ref $ProjectRef --no-verify-jwt
    $deployExit = $LASTEXITCODE
} finally {
    Pop-Location
}
if ($deployExit -ne 0) {
    Write-Host "==> ABORT: supabase functions deploy exited $deployExit" -ForegroundColor Red
    exit 1
}

# --- 3. Smoke test: health route returns 200 + version + adminConfigured ------
Write-Host "==> Smoke test: GET $HealthUrl" -ForegroundColor Cyan
try {
    $resp = Invoke-WebRequest -Uri $HealthUrl -Method GET -UseBasicParsing -TimeoutSec 30
} catch {
    Write-Host "==> SMOKE TEST FAILED: request error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

if ($resp.StatusCode -ne 200) {
    Write-Host "==> SMOKE TEST FAILED: status $($resp.StatusCode) (expected 200)" -ForegroundColor Red
    exit 1
}

try {
    $body = $resp.Content | ConvertFrom-Json
} catch {
    Write-Host "==> SMOKE TEST FAILED: response was not JSON: $($resp.Content)" -ForegroundColor Red
    exit 1
}

if ($body.version -ne $FileVersion) {
    Write-Host "==> SMOKE TEST FAILED: live version '$($body.version)' != expected '$FileVersion'" -ForegroundColor Red
    exit 1
}

if ($body.adminConfigured -ne $true) {
    Write-Host "==> SMOKE TEST FAILED: adminConfigured=$($body.adminConfigured) -- ADMIN_TELEGRAM_ID is not set on $ProjectRef." -ForegroundColor Red
    Write-Host "    Set the ADMIN_TELEGRAM_ID secret, then re-deploy so the function reads it at boot." -ForegroundColor Yellow
    exit 1
}

Write-Host "==> SMOKE TEST PASSED: 200, version = $($body.version), adminConfigured = true" -ForegroundColor Green

# --- 4. Rollback-point reminder ----------------------------------------------
Write-Host ""
Write-Host "==> Deploy complete and verified live on $ProjectRef." -ForegroundColor Green
Write-Host "    Remember to tag this build as a rollback point, e.g.:" -ForegroundColor Yellow
Write-Host "      git tag $FileVersion" -ForegroundColor Yellow
Write-Host "    (bump BUILD_VERSION in index.ts before the next deploy)." -ForegroundColor Yellow
exit 0
