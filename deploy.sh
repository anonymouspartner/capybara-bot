#!/usr/bin/env bash
# deploy.sh - POSIX/bash port of deploy.ps1.
#
# Deploys the telegram-bot edge function from the on-disk committed file.
#
#   ./deploy.sh <project-ref> [expected-version]
#
# Mirrors deploy.ps1 exactly:
#   1. Run the pre-deploy sanity gate (predeploy-check.sh); abort if it fails.
#   2. Deploy from the on-disk file via the Supabase CLI - never an inline string.
#   3. Smoke-test the health route: assert 200, the BUILD_VERSION baked into
#      index.ts, AND adminConfigured:true.
#   4. Remind the human to git tag this build as a rollback point.
#
# <project-ref> is MANDATORY: with multiple instances there is no safe default target.
# [expected-version] is OPTIONAL; if given it must equal the BUILD_VERSION in index.ts.
# The version asserted live is always read from the file, so it cannot drift.

set -euo pipefail

PROJECT_REF="${1:-}"
EXPECTED_VERSION="${2:-}"

if [[ -z "$PROJECT_REF" ]]; then
  echo "usage: ./deploy.sh <project-ref> [expected-version]" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FUNCTION="telegram-bot"
INDEX_PATH="$SCRIPT_DIR/supabase/functions/$FUNCTION/index.ts"
HEALTH_URL="https://$PROJECT_REF.supabase.co/functions/v1/$FUNCTION?health"

# --- 1. Sanity gate -----------------------------------------------------------
echo "==> Running pre-deploy sanity gate"
if ! bash "$SCRIPT_DIR/predeploy-check.sh"; then
  echo "==> ABORT: predeploy-check failed. Nothing deployed." >&2
  exit 1
fi

# Version read straight out of the file being deployed (no drift).
FILE_VERSION="$(sed -n 's/.*const BUILD_VERSION = "\([^"]*\)".*/\1/p' "$INDEX_PATH" | head -1)"
if [[ -z "$FILE_VERSION" ]]; then
  echo "==> ABORT: could not find BUILD_VERSION in $INDEX_PATH" >&2
  exit 1
fi
if [[ -n "$EXPECTED_VERSION" && "$EXPECTED_VERSION" != "$FILE_VERSION" ]]; then
  echo "==> ABORT: expected-version '$EXPECTED_VERSION' != BUILD_VERSION '$FILE_VERSION' in index.ts." >&2
  echo "    Bump BUILD_VERSION or fix the argument before deploying." >&2
  exit 1
fi
echo "==> Target project:         $PROJECT_REF"
echo "==> Expected BUILD_VERSION:  $FILE_VERSION"

# --- 2. Deploy from disk via the CLI -----------------------------------------
# Run from the repo root so the CLI resolves supabase/functions/<name>/index.ts.
echo "==> Deploying $FUNCTION from disk (CLI, no inline string)"
( cd "$SCRIPT_DIR" && supabase functions deploy "$FUNCTION" --project-ref "$PROJECT_REF" --no-verify-jwt )

# --- 3. Smoke test: health route returns 200 + version + adminConfigured ------
echo "==> Smoke test: GET $HEALTH_URL"
http_body="$(mktemp)"
trap 'rm -f "$http_body"' EXIT
http_code="$(curl -s -o "$http_body" -w '%{http_code}' --max-time 30 "$HEALTH_URL" || echo "000")"
body="$(cat "$http_body")"

if [[ "$http_code" != "200" ]]; then
  echo "==> SMOKE TEST FAILED: status $http_code (expected 200). Body: $body" >&2
  exit 1
fi

# Minimal JSON field extraction (avoids a jq dependency).
live_version="$(printf '%s' "$body" | sed -n 's/.*"version":"\([^"]*\)".*/\1/p')"
admin_ok="$(printf '%s' "$body" | grep -o '"adminConfigured":[ ]*true' || true)"

if [[ "$live_version" != "$FILE_VERSION" ]]; then
  echo "==> SMOKE TEST FAILED: live version '$live_version' != expected '$FILE_VERSION'" >&2
  exit 1
fi
if [[ -z "$admin_ok" ]]; then
  echo "==> SMOKE TEST FAILED: adminConfigured is not true -- ADMIN_TELEGRAM_ID is not set on $PROJECT_REF." >&2
  echo "    Set the ADMIN_TELEGRAM_ID secret, then re-deploy so the function reads it at boot." >&2
  exit 1
fi

echo "==> SMOKE TEST PASSED: 200, version = $live_version, adminConfigured = true"

# --- 4. Rollback-point reminder ----------------------------------------------
echo
echo "==> Deploy complete and verified live on $PROJECT_REF."
echo "    Remember to tag this build as a rollback point, e.g.:"
echo "      git tag $FILE_VERSION"
echo "    (bump BUILD_VERSION in index.ts before the next deploy)."
exit 0
