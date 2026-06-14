# CLAUDE.md

Guidance for Claude Code working in this repo. Read this before changing or deploying anything.

## What this is

**Capybara** — a private **English ↔ Ukrainian** Telegram translation bot for one couple, which
also builds a bilingual **language-study corpus** (vocabulary, flashcards) and a searchable,
private **relationship memory** (`/recap`, `/remember`, `/pin`).

```
Telegram  ⇄  Supabase Edge Function (Deno, one index.ts)  ⇄  Postgres (Supabase)
                                                          +  Anthropic (translation + /recap)
                                                          +  OpenAI    (Whisper voice + embeddings)
```

The whole bot is **one canonical file**: `supabase/functions/telegram-bot/index.ts` (~1800 lines).
It is **couple-agnostic** — nothing about a specific couple is baked in; identity lives entirely in
function **secrets** and **seed data**. One instance = one Supabase project + one Telegram bot per
couple (not multi-tenant).

## Repository map

| Path | What it is |
|---|---|
| `supabase/functions/telegram-bot/index.ts` | The entire bot — one canonical file. **Never fork it.** |
| `setup.ts` | Guided cross-platform setup wizard (`deno run -A setup.ts`). |
| `supabase/migrations/` | Versioned DB migrations; the init migration builds the database from zero. |
| `seed_couple.sql` | Seeds the two users + default conversation. |
| `storage_setup.sql` | Creates the private `voice-messages` Storage bucket. |
| `PROVISION_NEW_COUPLE.md` | The setup runbook — start here for a new instance. |
| `.env.example` | Template for the five function secrets (copy to `.env`). |
| `deploy.ps1` / `predeploy-check.ps1` | Deploy spine (Windows PowerShell). |
| `deploy.sh` / `predeploy-check.sh` / `provision.sh` | Deploy spine + provisioning glue (bash). |
| `.github/workflows/` | CI gate (`check.yml`) + manual deploy (`deploy.yml`); `.devcontainer/` for Codespaces. |
| `docs/` | Background & design history (deploy-safety + reproducibility handoffs). |
| `README.md` | Human-facing overview. |

## Hard rules

- **Claude builds + commits only — never deploys.** The maintainer runs every deploy themselves. Past stub /
  bad deploys took the live bot down. Do **not** run `deploy.ps1`, `supabase functions deploy`, or
  any deploy step unless explicitly told to in that moment.
- **Do not touch Supabase** (no migrations, SQL, function deploys, dashboard changes) without an
  explicit, in-the-moment request.
- **Never fork `index.ts`.** One file deploys to every instance unchanged. Edit it in place.
- **No secrets in code or git.** All credentials are read via `Deno.env.get(...)` and set as
  function secrets. `.env` is gitignored. Never hardcode a token/key, never commit one.

## Deploy discipline (when a deploy IS authorized, run by the maintainer)

1. **Gate:** `predeploy-check.ps1` runs `deno check` and asserts `index.ts` isn't a stub.
2. **Deploy the committed file only** via the Supabase CLI — never an inline/reconstructed string.
3. **Bump `BUILD_VERSION`** in `index.ts` before deploying, so the health route proves the new
   build landed.
4. **Smoke-test** the health route: `GET …/telegram-bot?health` → `{status, version, adminConfigured}`
   (side-effect-free; no DB/API/messaging).
5. **`git tag vNN`** after a good deploy as the rollback point; redeploy a prior tag to roll back.

Windows: `.\deploy.ps1 -ProjectRef <ref>`.

The admin `/update` command is an alternate trigger for the **same** `deploy.yml` workflow —
it just dispatches it from inside Telegram. The human stays in the loop (the admin taps the
deploy button), and the workflow's predeploy gate + health smoke test still run. It does not
bypass any of the discipline above. The feature is inert unless the optional `GITHUB_*` secrets
below are set.

## Secrets (set on the Supabase project, never in the repo)

`TELEGRAM_BOT_TOKEN`, `WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
`ADMIN_TELEGRAM_ID` (the English-native partner's numeric Telegram ID).
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by Supabase — don't set them.

Optional (enable the admin `/update` self-deploy command; the feature is inert if unset):
`GITHUB_DEPLOY_TOKEN` (GitHub PAT with `Actions: write` — dispatches `deploy.yml`; without it
`/update` only reports version status, no deploy button), `GITHUB_REPO` (`owner/name`),
`GITHUB_DEPLOY_BRANCH` (defaults to `main`).

## Environment notes (this laptop)

- **Windows + PowerShell.** `deploy.ps1` / `predeploy-check.ps1` are PowerShell.
- **Stale-PATH gotcha:** CLIs may be installed but missing from the current shell's PATH. Known:
  `gh` lives at `C:\Program Files\GitHub CLI\gh.exe`. Call tools by full path if PATH lookup fails.
- **Deno** is required for the pre-deploy `deno check` gate.
