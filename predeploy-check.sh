#!/usr/bin/env bash
# predeploy-check.sh - POSIX/bash port of predeploy-check.ps1.
#
# Pre-deploy sanity gate for the telegram-bot edge function. Fails (non-zero exit)
# unless ALL of the following pass:
#   1. `deno check` on index.ts exits clean.
#   2. Line count of index.ts is >= 1500.
#   3. All required anchors are present in index.ts.
#
# This is the same backstop as the PowerShell version: an 11-char "PLACEHOLDER"
# payload fails all three checks instantly, catching a bad deploy even if the
# deploy-from-git discipline is bypassed.
#
# Requires deno installed:  curl -fsSL https://deno.land/install.sh | sh
#
# Does NOT deploy anything. Read-only.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INDEX_PATH="$SCRIPT_DIR/supabase/functions/telegram-bot/index.ts"
MIN_LINES=1500
ANCHORS=(
  "Deno.serve"
  "handleUpdate"
  "BACKFILL_ADMIN_TELEGRAM_ID"
  "handleRecap"
  "handleReconcile"
  "handlePinned"
)

failures=()

echo "predeploy-check: $INDEX_PATH"
echo

# --- Check 0: file exists -----------------------------------------------------
if [[ ! -f "$INDEX_PATH" ]]; then
  echo "FAIL  file not found: $INDEX_PATH"
  exit 1
fi

# --- Check 1: deno check ------------------------------------------------------
if ! command -v deno >/dev/null 2>&1; then
  failures+=("deno is not installed (curl -fsSL https://deno.land/install.sh | sh)")
  echo "FAIL  deno check        deno not found on PATH"
elif deno check "$INDEX_PATH"; then
  echo "PASS  deno check"
else
  failures+=("deno check failed")
  echo "FAIL  deno check"
fi

# --- Check 2: line count >= 1500 ---------------------------------------------
line_count="$(wc -l < "$INDEX_PATH" | tr -d '[:space:]')"
if (( line_count < MIN_LINES )); then
  failures+=("line count $line_count < $MIN_LINES")
  echo "FAIL  line count        $line_count (need >= $MIN_LINES)"
else
  echo "PASS  line count        $line_count (>= $MIN_LINES)"
fi

# --- Check 3: anchors present -------------------------------------------------
missing=()
for anchor in "${ANCHORS[@]}"; do
  if ! grep -qF -- "$anchor" "$INDEX_PATH"; then
    missing+=("$anchor")
  fi
done
if (( ${#missing[@]} > 0 )); then
  failures+=("missing anchors: ${missing[*]}")
  echo "FAIL  anchors           missing: ${missing[*]}"
else
  echo "PASS  anchors           all present (${#ANCHORS[@]})"
fi

# --- Verdict ------------------------------------------------------------------
echo
if (( ${#failures[@]} > 0 )); then
  echo "predeploy-check: FAILED"
  for f in "${failures[@]}"; do echo "  - $f"; done
  exit 1
fi

echo "predeploy-check: PASSED"
exit 0
