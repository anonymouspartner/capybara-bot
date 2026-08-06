#!/usr/bin/env bash
# Make a fresh checkout able to run the gate and the tests.
#
# WHY THIS EXISTS
#
# Development for this repo sometimes happens in ephemeral containers that are reclaimed
# without warning. One of them took the whole toolchain with it mid-task: `deno` vanished
# from PATH, predeploy-check.sh reported "deno is not installed", and the guard tests --
# which at the time lived outside the repo -- were deleted outright.
#
# The tests moved into tests/ so they cannot be lost that way again. This script covers
# the other half: getting a runnable toolchain back in one command.
#
# Deno is installed from npm rather than deno.land because the usual installer
# (curl https://deno.land/install.sh) is blocked by the egress proxy in some of those
# environments, while the npm registry is reachable. Same binary, reachable host.
#
# Safe to re-run. Does nothing if deno is already on PATH.
set -euo pipefail
cd "$(dirname "$0")"

if command -v deno >/dev/null 2>&1; then
  echo "deno already on PATH: $(deno --version | head -1)"
else
  echo "==> deno not found; installing from npm into ./node_modules"
  npm install --no-save deno@2 >/dev/null
  echo "==> add it to PATH for this shell:"
  echo "    export PATH=\"$(pwd)/node_modules/.bin:\$PATH\""
  export PATH="$(pwd)/node_modules/.bin:$PATH"
fi

echo
echo "==> pre-deploy gate (telegram-bot)"
./predeploy-check.sh telegram-bot

echo
echo "==> guard tests"
deno test --allow-read tests/

echo
echo "Ready. Both the gate and the tests also run in CI on every push"
echo "(.github/workflows/check.yml), so neither depends on this machine."
