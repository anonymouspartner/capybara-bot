#!/usr/bin/env bash
# provision.sh - scripts the automatable parts of PROVISION_NEW_COUPLE.md.
#
# It does NOT create the Supabase project or the Telegram bot (those are interactive:
# Dashboard + @BotFather), and it does NOT deploy the function (deploys are run by a
# human via ./deploy.sh, on their own instance first). It automates the fiddly,
# error-prone glue around those steps.
#
# Reads secrets from a local .env file (copy .env.example -> .env and fill it in).
#
# Usage:
#   ./provision.sh secrets <project-ref>   # supabase secrets set --env-file .env
#   ./provision.sh webhook <project-ref>   # point Telegram at the function URL
#   ./provision.sh health  <project-ref>   # GET the health route and print it
#   ./provision.sh all     <project-ref>   # secrets -> (you deploy) -> webhook -> health
#
# Typical order for a new instance:
#   1) ./provision.sh secrets <ref>
#   2) ./deploy.sh <ref>            # human-run; see deploy.sh
#   3) seed via seed_couple.sql     # Dashboard SQL editor
#   4) ./provision.sh webhook <ref>
#   5) ./provision.sh health <ref>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
FUNCTION="telegram-bot"

CMD="${1:-}"
PROJECT_REF="${2:-}"

usage() {
  sed -n '3,24p' "$0" | sed 's/^# \{0,1\}//'
  exit 2
}

[[ -z "$CMD" || -z "$PROJECT_REF" ]] && usage

load_env() {
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "error: $ENV_FILE not found. Copy .env.example to .env and fill it in." >&2
    exit 1
  fi
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
}

do_secrets() {
  echo "==> Setting function secrets on $PROJECT_REF from .env"
  ( cd "$SCRIPT_DIR" && supabase secrets set --env-file "$ENV_FILE" --project-ref "$PROJECT_REF" )
  echo "==> Secrets set. Next: deploy with ./deploy.sh $PROJECT_REF"
}

do_webhook() {
  load_env
  : "${TELEGRAM_BOT_TOKEN:?TELEGRAM_BOT_TOKEN missing in .env}"
  : "${WEBHOOK_SECRET:?WEBHOOK_SECRET missing in .env}"
  local url="https://$PROJECT_REF.supabase.co/functions/v1/$FUNCTION"
  echo "==> Pointing Telegram webhook at $url"
  curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
    --get --data-urlencode "url=${url}" --data-urlencode "secret_token=${WEBHOOK_SECRET}"
  echo
  echo "==> getWebhookInfo:"
  curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"; echo
}

do_health() {
  local url="https://$PROJECT_REF.supabase.co/functions/v1/$FUNCTION?health"
  echo "==> GET $url"
  curl -s --max-time 30 "$url"; echo
}

case "$CMD" in
  secrets) do_secrets ;;
  webhook) do_webhook ;;
  health)  do_health ;;
  all)
    do_secrets
    echo
    echo "==> PAUSE: now deploy before continuing:  ./deploy.sh $PROJECT_REF"
    echo "    (and seed via seed_couple.sql). Then re-run: ./provision.sh webhook $PROJECT_REF"
    ;;
  *) usage ;;
esac
