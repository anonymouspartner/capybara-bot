<#
Daily scheduled pull for the Capybara Ukrainian pronunciation deck.

Grows the deck by a fixed step each run (default +20), pulling the current
top-N Ukrainian vocabulary straight from Supabase, building real audio via
ElevenLabs, then importing + syncing into Anki if it's currently running
(AnkiConnect on localhost:8765).

If Anki isn't open, the built .apkg is simply left in dist/ -- nothing is
lost. Each run does a full rebuild from the new (larger) limit, and import
is idempotent (existing notes get updated by SourceId, not duplicated), so
the next run that finds Anki open will catch everything up at once.

Like the rest of scripts/, this is off to the side: the bot never runs this,
and it is not on the deploy path.

Registered as a Windows Scheduled Task ("Capybara Pronunciation AutoPull").
Run manually to test:
    powershell -ExecutionPolicy Bypass -File autopull.ps1
#>

$ErrorActionPreference = 'Stop'

$toolDir   = $PSScriptRoot
$repoRoot  = (Get-Item $toolDir).Parent.Parent.FullName
$stateFile = Join-Path $toolDir '.autopull-state.json'
$logFile   = Join-Path $toolDir '.autopull.log'
$outFile   = Join-Path $toolDir 'dist\capybara-pronunciation-uk-autopull.apkg'

$STEP = 20
$LANG = 'uk'

function Log($msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    Add-Content -Path $logFile -Value $line -Encoding utf8
}

# --- figure out this run's limit --------------------------------------------
$state = if (Test-Path $stateFile) {
    Get-Content $stateFile -Raw | ConvertFrom-Json
} else {
    [PSCustomObject]@{ limit = 100 }   # matches what was already built by hand on 2026-09-03
}
$newLimit = [int]$state.limit + $STEP
Log "starting run: limit $($state.limit) -> $newLimit"

# --- credentials, pulled from the registry at run time, never logged -------
# All of these come from the machine's own User environment (set once with setx), never
# from a file in the repo -- this repo is public, so neither the credentials nor the
# project URL that identifies this instance belong in it.
$env:ELEVENLABS_API_KEY        = [Environment]::GetEnvironmentVariable('ELEVENLABS_API_KEY', 'User')
$env:CAPYBARA_TTS_VOICE        = [Environment]::GetEnvironmentVariable('CAPYBARA_TTS_VOICE', 'User')
$env:CAPYBARA_TTS_PROVIDER     = 'elevenlabs'
$env:SUPABASE_URL              = [Environment]::GetEnvironmentVariable('SUPABASE_URL', 'User')
$env:SUPABASE_SERVICE_ROLE_KEY = [Environment]::GetEnvironmentVariable('SUPABASE_SERVICE_ROLE_KEY', 'User')
$env:PYTHONUTF8                = '1'
$env:PYTHONIOENCODING          = 'utf-8'

if (-not $env:ELEVENLABS_API_KEY -or -not $env:CAPYBARA_TTS_VOICE -or
    -not $env:SUPABASE_URL -or -not $env:SUPABASE_SERVICE_ROLE_KEY) {
    Log 'ERROR: required values missing from the User environment. Set them with setx: ELEVENLABS_API_KEY, CAPYBARA_TTS_VOICE, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY. Aborting.'
    exit 1
}

# --- build -------------------------------------------------------------------
Set-Location $repoRoot
$buildOutput = & python -m scripts.anki_pronunciation --lang $LANG --limit $newLimit --out $outFile 2>&1
# the "provider" line embeds the ElevenLabs voice_id -- keep it out of the log
$buildOutput | Where-Object { $_ -notmatch '^provider' } | ForEach-Object { Log $_ }

if ($LASTEXITCODE -ne 0) {
    Log "BUILD FAILED (exit $LASTEXITCODE) -- state not advanced, will retry the same limit next run."
    exit 1
}

# state only advances on a successful build
(@{ limit = $newLimit } | ConvertTo-Json) | Set-Content -Path $stateFile
Log "build OK, state advanced to limit=$newLimit"

# --- import + sync, best-effort ----------------------------------------------
function Invoke-AnkiConnect($action, $params) {
    $body = @{ action = $action; version = 6; params = $params } | ConvertTo-Json -Depth 5
    Invoke-RestMethod -Uri 'http://localhost:8765' -Method Post -Body $body -TimeoutSec 60
}

try {
    $imp = Invoke-AnkiConnect 'importPackage' @{ path = $outFile }
    Log "importPackage result: $imp"
    Invoke-AnkiConnect 'sync' @{} | Out-Null
    Log 'sync triggered'
} catch {
    Log "Anki/AnkiConnect not reachable ($($_.Exception.Message)) -- apkg built at $outFile; will import next run (or open Anki and re-run manually)."
}

Log 'run complete'
