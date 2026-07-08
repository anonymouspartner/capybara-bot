#!/usr/bin/env bash
# SessionStart hook — install Deno in Claude Code on the web sessions so the
# predeploy gate (./predeploy-check.sh, which runs `deno check` on index.ts) can
# run IN-SESSION before pushing, instead of only in CI. Local dev already ships
# Deno (see .devcontainer + CLAUDE.md "Environment notes"), so this runs only in
# the remote/web environment. It installs a dev tool; it does not deploy or touch
# prod — deploy discipline is unchanged.
#
# PREREQUISITE: the environment's network (egress) policy must allow deno.land,
# dl.deno.land, and objects.githubusercontent.com. If those hosts are blocked
# (403), the hook can't install Deno; it warns and exits 0 (never blocks the
# session), and CI still runs the same gate on every PR.
set -euo pipefail

# Web-only: local machines already provide their own toolchain (Windows + Deno).
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

export DENO_INSTALL="${DENO_INSTALL:-$HOME/.deno}"
DENO_BIN="$DENO_INSTALL/bin/deno"

install_deno() {
  local target
  case "$(uname -m)" in
    x86_64|amd64)  target="x86_64-unknown-linux-gnu" ;;
    aarch64|arm64) target="aarch64-unknown-linux-gnu" ;;
    *) echo "session-start: unsupported arch $(uname -m)" >&2; return 1 ;;
  esac
  local url="https://github.com/denoland/deno/releases/latest/download/deno-${target}.zip"
  local zip; zip="$(mktemp)"
  curl -fsSL "$url" -o "$zip" || { rm -f "$zip"; return 1; }
  mkdir -p "$DENO_INSTALL/bin"
  # Extract with python3 (present in the web env) to avoid an unzip dependency.
  python3 -c "import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" "$zip" "$DENO_INSTALL/bin" \
    || { rm -f "$zip"; return 1; }
  rm -f "$zip"
  chmod +x "$DENO_BIN"
}

# Idempotent: only install if deno isn't already on PATH or already installed.
# A failed install must not abort the session, so tolerate a non-zero return.
if ! command -v deno >/dev/null 2>&1 && [ ! -x "$DENO_BIN" ]; then
  install_deno || true
fi

if command -v deno >/dev/null 2>&1 || [ -x "$DENO_BIN" ]; then
  # Persist deno on PATH for every Bash tool shell in this session.
  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    {
      echo "export DENO_INSTALL=\"$DENO_INSTALL\""
      echo "export PATH=\"$DENO_INSTALL/bin:\$PATH\""
    } >> "$CLAUDE_ENV_FILE"
  fi
  ver="$("$DENO_BIN" --version 2>/dev/null | head -1 || command -v deno)"
  echo "session-start: ${ver} ready — run ./predeploy-check.sh to gate index.ts"
else
  echo "session-start: Deno not installed. The environment egress policy is blocking" >&2
  echo "  deno.land / dl.deno.land / objects.githubusercontent.com (403). Allow those" >&2
  echo "  hosts in the environment's network policy to enable in-session 'deno check'." >&2
  echo "  Continuing without it — CI still runs ./predeploy-check.sh on every PR." >&2
fi

exit 0
