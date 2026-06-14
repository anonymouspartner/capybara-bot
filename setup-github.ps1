# setup-github.ps1 - one-time prep + publish of this repo to a NEW *private* GitHub repo.
#
# Codifies the manual steps used to publish Capybara. Safe by default: it runs the
# checks and local prep, then STOPS. Nothing leaves the machine unless you pass -Publish.
#
#   1. Confirm we're in the repo root (supabase/functions/telegram-bot/index.ts exists).
#   2. Confirm there's no 'origin' remote yet (already-published is detected, not an error).
#   3. Secret scan - ABORT if any .env is tracked, or if secret-shaped strings appear in
#      tracked files OR anywhere in full git history.
#   4. Verify gh is installed and authenticated.
#   5. Ensure .gitignore covers .env.
#   6. Create + commit CLAUDE.md if it's missing (the prep commit).
#   7. STOP and print a summary. Only with -Publish does it create the private repo + push.
#
# Usage:
#   .\setup-github.ps1                       # checks + local prep, STOP before push
#   .\setup-github.ps1 -Publish              # also create the private repo and push
#   .\setup-github.ps1 -Publish -RepoName x  # override repo name (default: repo folder name)

param(
    [switch]$Publish,
    [string]$RepoName
)

$ErrorActionPreference = "Stop"

function Section($text) { Write-Host "==> $text" -ForegroundColor Cyan }
function Ok($text)      { Write-Host "    [ok] $text" -ForegroundColor Green }
function Warn($text)    { Write-Host "    [!]  $text" -ForegroundColor Yellow }
function Die($text)     { Write-Host "==> ABORT: $text" -ForegroundColor Red; exit 1 }

# Resolve gh: PATH first, then the known install location (it's often not on PATH here).
function Resolve-Gh {
    $cmd = Get-Command gh -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $fallback = "C:\Program Files\GitHub CLI\gh.exe"
    if (Test-Path $fallback) { return $fallback }
    Die "gh (GitHub CLI) not found on PATH or at '$fallback'. Install it, then re-run."
}

# Run from the repo root regardless of caller's CWD.
Push-Location $PSScriptRoot
try {
    # --- 1. Repo root ---------------------------------------------------------
    Section "1. Confirm Capybara repo root"
    $top = (git rev-parse --show-toplevel 2>$null)
    if (-not $top) { Die "not inside a git repository." }
    $index = Join-Path $PSScriptRoot "supabase/functions/telegram-bot/index.ts"
    if (-not (Test-Path $index)) { Die "supabase/functions/telegram-bot/index.ts not found - wrong repo?" }
    Ok "repo root: $top"
    Ok "found supabase/functions/telegram-bot/index.ts"

    # --- 2. No origin remote yet ----------------------------------------------
    Section "2. Check for existing 'origin' remote"
    $originUrl = (git remote get-url origin 2>$null)
    $alreadyPublished = [bool]$originUrl
    if ($alreadyPublished) {
        Warn "origin already configured: $originUrl"
        Warn "repo looks already published - will skip create/push."
    } else {
        Ok "no 'origin' remote (good - first-time publish)."
    }

    # --- 3. Secret scan (tracked files AND full history) ----------------------
    Section "3. Secret scan (tracked files + full git history)"
    # .env must never be tracked.
    $envTracked = git ls-files | Select-String -Pattern '(^|/)\.env($|\.)' -CaseSensitive:$false
    if ($envTracked) { Die ".env file is TRACKED: $($envTracked -join ', '). Remove from git before publishing." }
    Ok "no .env file tracked."

    # Secret-shaped strings: sk-ant, sk-proj, JWTs (eyJ...eyJ...), Telegram tokens (digits:AA...),
    # AWS keys, GitHub tokens, PEM private keys.
    $secretRegex = 'sk-ant-[A-Za-z0-9_-]{16,}|sk-proj-[A-Za-z0-9_-]{16,}|eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}|[0-9]{8,10}:AA[A-Za-z0-9_-]{33}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36}|-----BEGIN [A-Z ]*PRIVATE KEY-----'

    $trackedHits = git ls-files | ForEach-Object {
        if (Test-Path $_) { Select-String -Path $_ -Pattern $secretRegex -List }
    }
    $historyHits = (git log -p --all --full-history) | Select-String -Pattern $secretRegex

    if ($trackedHits -or $historyHits) {
        Write-Host "    Secret-shaped matches found:" -ForegroundColor Red
        $trackedHits | ForEach-Object { Write-Host "      [tracked] $($_.Path):$($_.LineNumber)" -ForegroundColor Red }
        $historyHits | Select-Object -First 20 | ForEach-Object { Write-Host "      [history] $($_.Line.Trim())" -ForegroundColor Red }
        Die "potential secrets present. Scrub them (and rewrite history if needed) before publishing."
    }
    Ok "no secret-shaped strings in tracked files."
    Ok "no secret-shaped strings anywhere in git history."

    # --- 4. gh installed + authenticated --------------------------------------
    Section "4. Verify gh is installed and authenticated"
    $gh = Resolve-Gh
    $ghVersion = (& $gh --version | Select-Object -First 1)
    Ok "gh: $gh ($ghVersion)"
    & $gh auth status | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Die "gh is not authenticated. Run: & `"$gh`" auth login --hostname github.com --git-protocol https --web"
    }
    Ok "gh is authenticated."

    # --- 5. .gitignore covers .env --------------------------------------------
    Section "5. Ensure .gitignore covers .env"
    $gitignore = Join-Path $PSScriptRoot ".gitignore"
    $covered = (Test-Path $gitignore) -and ((Get-Content $gitignore) -match '^\s*\.env\b')
    if ($covered) {
        Ok ".gitignore already covers .env"
    } else {
        Add-Content -Path $gitignore -Value "`n# Environment / secrets - never commit these`n.env`n.env.*`n!.env.example" -Encoding utf8
        Ok "added .env / .env.* to .gitignore"
    }

    # --- 6. Create + commit CLAUDE.md if missing ------------------------------
    Section "6. Ensure CLAUDE.md exists (prep commit)"
    $claudeMd = Join-Path $PSScriptRoot "CLAUDE.md"
    if (Test-Path $claudeMd) {
        Ok "CLAUDE.md already present."
    } else {
        @"
# CLAUDE.md

Guidance for Claude Code in this repo. **Capybara** is a private EN<->UK Telegram
translation bot for one couple, deployed as a single Supabase Edge Function
(Deno, one canonical ``supabase/functions/telegram-bot/index.ts``).

## Hard rules
- **Claude builds + commits only - never deploys.** The maintainer runs every deploy themselves.
- **Do not touch Supabase** (migrations/SQL/function deploys) without an explicit request.
- **Never fork ``index.ts``** - one file deploys to every instance unchanged.
- **No secrets in code or git.** Credentials are read via ``Deno.env.get(...)`` and set as
  function secrets; ``.env`` is gitignored.
"@ | Set-Content -Path $claudeMd -Encoding utf8
        Ok "created CLAUDE.md"
    }

    # Stage + commit ONLY the prep files, if they have pending changes.
    git add CLAUDE.md .gitignore 2>$null | Out-Null
    $staged = git diff --cached --name-only
    if ($staged) {
        git commit -m "Add CLAUDE.md and ignore .env files (prep for GitHub publish)" | Out-Null
        Ok "committed prep changes: $($staged -join ', ')"
    } else {
        Ok "no prep changes to commit (already committed)."
    }

    # --- 7. STOP, or publish with -Publish ------------------------------------
    Section "7. Publish"
    if ($alreadyPublished) {
        Ok "already published to $originUrl - nothing to push from here."
        Pop-Location
        return
    }
    if (-not $Publish) {
        Write-Host ""
        Warn "Local prep complete. Stopping BEFORE anything leaves the machine."
        Warn "Re-run with -Publish to create the private repo and push:"
        Write-Host "      .\setup-github.ps1 -Publish" -ForegroundColor Yellow
        Pop-Location
        return
    }

    if (-not $RepoName) { $RepoName = Split-Path -Leaf $top }
    Section "Creating PRIVATE repo '$RepoName' and pushing"
    & $gh repo create $RepoName --private --source=$top --remote=origin --push
    if ($LASTEXITCODE -ne 0) { Die "gh repo create failed." }
    Ok "published: https://github.com/$(& $gh api user --jq .login)/$RepoName (private)"
}
finally {
    Pop-Location -ErrorAction SilentlyContinue
}
