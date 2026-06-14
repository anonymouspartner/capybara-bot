#!/usr/bin/env bash
# start.sh - interactive start-up menu for a freshly cloned Capybara repo.
#
# Run `./start.sh` after cloning. It checks your local prerequisites and offers the
# common tasks, dispatching to the scripts that already live in this repo (the gate,
# deploy, provisioning glue). It never does anything destructive on its own — each
# action is an explicit menu choice, and deploys still go through the pre-deploy gate.
#
# New here? The full walkthrough is PROVISION_NEW_COUPLE.md; this menu is just a
# friendlier front door to it.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
dim()  { printf '\033[2m%s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m[ok]\033[0m %s\n' "$1"; }
miss() { printf '  \033[33m[--]\033[0m %s\n' "$1"; }

have() { command -v "$1" >/dev/null 2>&1; }

prereqs() {
  bold "Prerequisites"
  have git      && ok "git"                       || miss "git — required"
  have deno     && ok "deno ($(deno --version 2>/dev/null | head -1))" \
                                                  || miss "deno — needed for the pre-deploy gate (curl -fsSL https://deno.land/install.sh | sh)"
  have supabase && ok "supabase CLI"              || miss "supabase CLI — needed to deploy / set secrets (https://supabase.com/docs/guides/cli)"
  have curl     && ok "curl"                      || miss "curl — needed for webhook / health steps"
  if [[ -f .env ]]; then ok ".env present"; else miss ".env missing — copy from .env.example (menu option 1)"; fi
  echo
}

ask_ref() {
  # Prompt for a Supabase project ref; echoes it on stdout, empty if blank.
  local ref
  read -r -p "  Supabase project ref: " ref
  printf '%s' "$ref"
}

setup_env() {
  if [[ -f .env ]]; then
    echo "  .env already exists — leaving it untouched."
  elif [[ -f .env.example ]]; then
    cp .env.example .env
    ok "created .env from .env.example — now edit it and fill in the five secrets."
  else
    miss ".env.example not found (unexpected)."
  fi
}

menu() {
  bold "Capybara — start-up menu"
  dim  "A private EN<->UK Telegram translation bot. See README.md / PROVISION_NEW_COUPLE.md."
  echo
  cat <<'MENU'
  Setup
    W) Run the GUIDED SETUP WIZARD (recommended for first-time setup)
    1) Create .env from the template (then edit it)
    2) Re-check prerequisites

  Build & verify
    3) Run the pre-deploy gate (deno check + line/anchor checks)
    4) Generate deno.lock (deterministic deps)

  Provision an instance  (needs a Supabase project ref)
    5) Set function secrets from .env
    6) Deploy the function   (runs the gate first, then deploys — this is live)
    7) Point the Telegram webhook at the function
    8) Health check the deployed function

  Docs
    9) Show the provisioning runbook
    0) Quit
MENU
  echo
}

run() {
  case "$1" in
    w|W) if have deno; then deno run -A setup.ts || true; else miss "deno not installed — needed for the wizard."; fi ;;
    1) setup_env ;;
    2) prereqs ;;
    3) bash ./predeploy-check.sh || true ;;
    4) if have deno; then deno task lock; ok "wrote deno.lock — commit it."; else miss "deno not installed."; fi ;;
    5) ref="$(ask_ref)"; [[ -n "$ref" ]] && ./provision.sh secrets "$ref" || echo "  (no ref given)" ;;
    6) ref="$(ask_ref)"; [[ -n "$ref" ]] && ./deploy.sh "$ref"          || echo "  (no ref given)" ;;
    7) ref="$(ask_ref)"; [[ -n "$ref" ]] && ./provision.sh webhook "$ref" || echo "  (no ref given)" ;;
    8) ref="$(ask_ref)"; [[ -n "$ref" ]] && ./provision.sh health "$ref"  || echo "  (no ref given)" ;;
    9) ${PAGER:-less} PROVISION_NEW_COUPLE.md 2>/dev/null || cat PROVISION_NEW_COUPLE.md ;;
    0|q|quit|exit) return 1 ;;
    *) echo "  Unknown choice: $1" ;;
  esac
  return 0
}

prereqs
while true; do
  menu
  read -r -p "Choose an option: " choice
  echo
  run "$choice" || { echo "Bye."; break; }
  echo
done
