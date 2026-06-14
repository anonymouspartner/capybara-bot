# predeploy-check.ps1 - pre-deploy sanity gate for the telegram-bot edge function.
#
# Fails (non-zero exit) unless ALL of the following pass:
#   1. `deno check` on index.ts exits clean.
#   2. Line count of index.ts is >= 1500.
#   3. All required anchors are present in index.ts.
#
# This is the backstop from docs/DEPLOY_SAFETY_HANDOFF.md section 4 (#2): an 11-char
# "PLACEHOLDER" payload fails all three checks instantly, catching a bad
# deploy even if the deploy-from-git discipline is bypassed.
#
# Requires deno installed:  irm https://deno.land/install.ps1 | iex
#
# Does NOT deploy anything. Read-only.

$ErrorActionPreference = "Stop"

$IndexPath = Join-Path $PSScriptRoot "supabase/functions/telegram-bot/index.ts"
$MinLines  = 1500
$Anchors   = @(
    "Deno.serve",
    "handleUpdate",
    "BACKFILL_ADMIN_TELEGRAM_ID",
    "handleRecap",
    "handleReconcile",
    "handlePinned"
)

$failures = @()

Write-Host "predeploy-check: $IndexPath"
Write-Host ""

# --- Check 0: file exists -----------------------------------------------------
if (-not (Test-Path $IndexPath)) {
    Write-Host "FAIL  file not found: $IndexPath" -ForegroundColor Red
    exit 1
}

# --- Check 1: deno check ------------------------------------------------------
$deno = Get-Command deno -ErrorAction SilentlyContinue
if (-not $deno) {
    $failures += "deno is not installed (irm https://deno.land/install.ps1 | iex)"
    Write-Host "FAIL  deno check        deno not found on PATH" -ForegroundColor Red
} else {
    & deno check $IndexPath
    if ($LASTEXITCODE -ne 0) {
        $failures += "deno check exited $LASTEXITCODE"
        Write-Host "FAIL  deno check        exit $LASTEXITCODE" -ForegroundColor Red
    } else {
        Write-Host "PASS  deno check" -ForegroundColor Green
    }
}

# --- Check 2: line count >= 1500 ---------------------------------------------
# Use array length, not `Measure-Object -Line`, which counts blank lines as 0.
$lineCount = @(Get-Content -LiteralPath $IndexPath).Count
if ($lineCount -lt $MinLines) {
    $failures += "line count $lineCount < $MinLines"
    Write-Host "FAIL  line count        $lineCount (need >= $MinLines)" -ForegroundColor Red
} else {
    Write-Host "PASS  line count        $lineCount (>= $MinLines)" -ForegroundColor Green
}

# --- Check 3: anchors present -------------------------------------------------
$content = Get-Content -LiteralPath $IndexPath -Raw
$missing = @()
foreach ($anchor in $Anchors) {
    if ($content -notmatch [regex]::Escape($anchor)) {
        $missing += $anchor
    }
}
if ($missing.Count -gt 0) {
    $failures += "missing anchors: $($missing -join ', ')"
    Write-Host "FAIL  anchors           missing: $($missing -join ', ')" -ForegroundColor Red
} else {
    Write-Host "PASS  anchors           all present ($($Anchors.Count))" -ForegroundColor Green
}

# --- Verdict ------------------------------------------------------------------
Write-Host ""
if ($failures.Count -gt 0) {
    Write-Host "predeploy-check: FAILED" -ForegroundColor Red
    foreach ($f in $failures) { Write-Host "  - $f" -ForegroundColor Red }
    exit 1
}

Write-Host "predeploy-check: PASSED" -ForegroundColor Green
exit 0
