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
# Which edge function to gate. Defaults to the original single-tenant bot; the
# multi-tenant fork is gated by passing "telegram-bot-saas" (as an argument or via
# FUNCTION_NAME). Both builds share this gate so neither can be deployed as a stub.
FUNCTION_NAME="${1:-${FUNCTION_NAME:-telegram-bot}}"
INDEX_PATH="$SCRIPT_DIR/supabase/functions/$FUNCTION_NAME/index.ts"
# The floor and the anchors are per-function: they exist to prove a specific file is
# still itself, so a single shared set would either be too weak for the bots or reject
# the billing function for being the size it is meant to be.
case "$FUNCTION_NAME" in
  telegram-bot)
    MIN_LINES=1500
    ANCHORS=(
      "Deno.serve" "handleUpdate" "ADMIN_TELEGRAM_ID"
      "handleRecap" "handleReconcile" "handlePinned"
    )
    ;;
  telegram-bot-saas)
    MIN_LINES=1500
    ANCHORS=(
      "Deno.serve" "handleUpdate" "ADMIN_TELEGRAM_ID"
      "handleRecap" "handleReconcile" "handlePinned"
      # The tenant-scoping layer. This is the one thing that must never be missing from a
      # build shipped to the shared project: without it every query reads across all
      # tenants, and such a build would otherwise pass every other check here, because it
      # is a perfectly valid single-tenant bot.
      "tenantDb" "dbAdmin" "tenant_id"
      # The paid surface. A build missing these serves everyone for free.
      "consume_message_quota" "claim_tenant_seat"
    )
    ;;
  stripe-billing)
    # Roughly a fifth of the real file. Small enough that a stub still fails, large
    # enough that the floor never fights normal edits.
    MIN_LINES=120
    ANCHORS=(
      "Deno.serve"
      # Signature verification and its replay window. A billing webhook that has lost
      # either one accepts forged events -- including "subscription reactivated" -- so
      # these are the anchors that matter most in the whole repo.
      "verifyStripeSignature" "timingSafeEqual" "stripe-signature"
      "provisionFromCheckoutSession" "pairing_code"
    )
    ;;
  *)
    echo "FAIL  unknown function '$FUNCTION_NAME'"
    exit 1
    ;;
esac

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
