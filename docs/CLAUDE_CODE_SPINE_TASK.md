# Claude Code Task — Build the Capybara Deploy-Safety Spine

Read `DEPLOY_SAFETY_HANDOFF.md` in this repo first. It explains why this exists.
This task is **build-on-disk only. Do NOT deploy.** The human (the maintainer) runs and
watches every deploy themselves.

## Repo state you're starting from
- Git repo at the project root; HEAD is tag `v-recovered-baseline`.
- `supabase/functions/telegram-bot/index.ts` — the live, ground-truth source
  (1787 lines, recap layer shipped). **This file is ground truth. Edit it in
  place with minimal diffs. Do NOT rewrite, reformat, or reconstruct it.**

## What to build

### 1. Version constant + health route (in index.ts)
- Add a `BUILD_VERSION` constant near the other top-level constants. Value: a
  short identifier the human bumps each deploy (mirror the git tag, e.g.
  `"v-recovered-baseline"` to start).
- Add a route inside `Deno.serve(...)` that responds to a health probe and
  returns `200` with JSON `{ status: "ok", version: BUILD_VERSION }`.
- **Place this branch BEFORE the `WEBHOOK_SECRET` check.** A monitor won't send
  Telegram's secret header, so a health check placed after the secret check would
  get 401. Telegram only sends POST webhooks, so a `GET` (or a `?health` query
  param) is safe to repurpose and won't collide.
- **The route MUST be side-effect-free: no DB query, no Anthropic/OpenAI call, no
  message to the partner or anyone.** Just return the version. (Dependency checks stay in
  the admin-gated `/diag`; do not add them here.)
- Supabase path routing for edge functions varies — prefer detecting a `?health`
  query param over a hardcoded path, and note that the human must test the exact
  trigger against the deployed URL.

### 2. Pre-deploy sanity gate (PowerShell script, Windows)
Create `predeploy-check.ps1` that fails (non-zero exit) unless ALL pass:
- `deno check supabase/functions/telegram-bot/index.ts` exits clean.
  (Requires deno installed: `irm https://deno.land/install.ps1 | iex`.)
- Line count of index.ts ≥ 1500.
- All anchors present: `Deno.serve`, `handleUpdate`, `BACKFILL_ADMIN_TELEGRAM_ID`,
  `handleRecap`, `handleReconcile`, `handlePinned`.
An 11-char "PLACEHOLDER" must fail all three. This is the backstop that catches a
bad payload even if the deploy-from-git discipline is bypassed.

### 3. Deploy wrapper (PowerShell script, Windows)
Create `deploy.ps1` that:
- Runs `predeploy-check.ps1`; aborts if it fails.
- Deploys **from the on-disk committed file via the CLI** — never an inline
  string:
  `supabase functions deploy telegram-bot --project-ref <project-ref> --no-verify-jwt`
- After deploy, hits the health route and asserts `200` + the expected version
  (automatic smoke test).
- Prints a reminder to `git tag` the new version as a rollback point.

## Hard constraints (do not violate)
- **Do NOT deploy.** Build, commit. the maintainer deploys and watches it.
- **Deploy path is CLI-from-disk only.** Never assemble or pass file content as an
  inline string. The committed file is the only deploy origin.
- **Do NOT reconstruct any part of index.ts from memory.** Edit the existing file
  with minimal diffs.
- **Health route is side-effect-free.** No DB, no external API, no messaging.
- Match the existing single-file code conventions; add constants near the other
  constants, the route inside the existing `Deno.serve`.
- If you touch anything involving model strings, verify them at
  https://docs.claude.com/en/docs/about-claude/models/overview — they drift.
  (This task should not need to.)
- Never produce Russian text anywhere (project-wide rule).

## Bootstrapping note (for the human, not Claude Code)
The FIRST deploy introduces the health route, so it can't be smoke-tested by the
health route — it doesn't exist live yet. That first deploy: run the sanity gate,
deploy, then manually confirm (a) the bot still answers a normal message and
(b) the health route returns the version. Every deploy after that is auto-checked
by `deploy.ps1`.

## Out of scope (do not build now)
- External uptime monitor (#4) — separate task, after the spine is proven live.
- Any recap/translation feature work. This task is infra only.
