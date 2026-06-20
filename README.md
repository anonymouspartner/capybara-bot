# Capybara

A private **English ↔ Ukrainian** Telegram translation bot for a couple, that doubles
as a bilingual **language-study corpus** and a shared, private **relationship-memory**
tool (`/recap`).

Send the bot a text or voice message and it replies with the translation and forwards
it to your partner — while quietly logging everything as study material (vocabulary,
flashcards) and as a searchable shared memory. Send a video and it forwards that to your
partner too.

> **Status:** in daily use. Self-hosted, one instance per couple, deployed by hand
> behind a deliberately strict deploy gate.

---

## Contents

- [What it does](#what-it-does)
- [How it works](#how-it-works)
- [The `/recap` memory pipeline](#the-recap-memory-pipeline)
- [The model: one instance per couple](#the-model-one-instance-per-couple)
- [Data model](#data-model)
- [Repository map](#repository-map)
- [Prerequisites](#prerequisites)
- [Quick start](#quick-start)
- [Secrets](#secrets-set-on-your-supabase-project)
- [Deploying](#deploying)
- [Bot commands](#bot-commands)
- [Privacy](#privacy)
- [Admin & maintenance commands](#admin--maintenance-commands)
- [Design philosophy](#design-philosophy)
- [Troubleshooting](#troubleshooting)
- [Tech stack](#tech-stack)

---

## What it does

Capybara wears three hats at once. Every message a partner sends flows through all of
them in a single turn.

**1. Translator (EN ↔ UK).**
- **Text and voice both work.** Voice notes are transcribed (OpenAI Whisper) and then
  translated; the original audio is archived to private storage.
- **Direction is auto-detected from script** (Cyrillic → Ukrainian, Latin → English),
  so either partner can write in either language — including the language they're
  *learning* — and it still routes correctly.
- **Gendered Ukrainian.** Translations into Ukrainian are told the speaker's and
  addressee's gender (English-native = male, Ukrainian-native = female) so past-tense
  verbs, adjectives, and participles agree with the real people. Names come from your
  `users` rows; the genders are fixed.
- **Never Russian.** Cyrillic in this project is *always* Ukrainian. The prompts
  enforce standard literary Ukrainian and reject Russian / surzhyk forms, even when the
  input is ambiguous. Whisper is retried forcing `language=uk` if it mishears a clip as
  a neighbouring Slavic language.
- **Forwards to your partner.** Each translation (and the original) is relayed to the
  other partner automatically, so the bot doubles as the chat channel itself.
- **Videos pass straight through.** Regular videos and round "video notes" are forwarded
  to your partner by Telegram `file_id` — no size limit, no transcription.

**2. Language-study corpus.**
- Every message is **annotated in the background** (Claude) into **vocabulary**
  (lemma + part of speech + gloss + cross-language translation), **grammar features**,
  **idioms**, and **register**.
- **Two decks of equal weight** — a 🇺🇦 Ukrainian deck and a 🇬🇧 English deck — built
  from the words that actually came up in *your* conversations.
- `/vocab` surfaces the top still-unlearned words; `/learn` / `/forget` curate a deck;
  `/export` produces a ready-to-import **Anki CSV** with both sub-decks and example
  sentences drawn from real messages.

**3. Private relationship memory.**
- `/recap <question>` answers questions about your shared history using hybrid
  semantic + keyword search over everything you've said, then a grounded synthesis
  (see [the pipeline below](#the-recap-memory-pipeline)).
- `/remember <note>` stores a private note that only *your* `/recap` can retrieve.
- `/pin` / `/pinned` / `/unpin` mark messages as meaningful (a small recall boost);
  `/reconcile` / `/restore` hide or restore a message from recap results.

## How it works

```
Telegram  ⇄  Supabase Edge Function (Deno, one index.ts)  ⇄  Postgres (Supabase)
                                                            +  Anthropic  (translation, annotation, /recap; Claude Sonnet & Haiku)
                                                            +  OpenAI     (Whisper voice transcription + embeddings)
```

- **One canonical file.** The entire bot is a single ~2,000-line
  `supabase/functions/telegram-bot/index.ts`. It is **couple-agnostic** — nothing about
  a specific couple is in the code; identity lives in secrets and seed data. **Never
  fork it.**
- **Webhook-driven.** Telegram POSTs updates to the function URL; an
  `x-telegram-bot-api-secret-token` header (your `WEBHOOK_SECRET`) gates every call.
  Unauthenticated requests get `401`.
- **Health route.** A side-effect-free `GET …/telegram-bot?health` returns
  `{status, version, adminConfigured}` — used to confirm a deploy actually landed (no
  DB/API/messaging side effects). It sits *before* the secret check so monitors can hit
  it.
- **Background work.** Annotation and embedding run after the reply is sent, via
  `EdgeRuntime.waitUntil` when available, so the user isn't kept waiting on study-corpus
  bookkeeping.
- **Admin gating.** Maintenance commands (`/diag`, `/backfill*`, `/recap_backfill`) are
  restricted to the `ADMIN_TELEGRAM_ID` (the English-native partner), read once at boot.

## The `/recap` memory pipeline

`/recap` is a small retrieval-augmented-generation loop, all inside the one function:

1. **Parse** the question (Claude Haiku) → dominant language, optional explicit time
   window, and a "shape" (narrow vs. broad) that sets how many items to retrieve.
2. **Embed** the question (OpenAI `text-embedding-3-small`, 1536-dim).
3. **Retrieve** a candidate pool two ways in parallel:
   - **Semantic** — cosine distance over `pgvector` (ivfflat index).
   - **Keyword** — trigram similarity (`pg_trgm`).
4. **Merge** the two rankings with **Reciprocal Rank Fusion** (RRF), then **filter and
   rank**:
   - **24-hour cooling-off on messages** — very recent messages don't surface (notes are
     exempt).
   - **Note privacy** — notes are only visible to their author.
   - **Pin boost** — pinned messages get a small score bump.
   - **Reconciled messages are excluded** entirely.
5. **Synthesize** (Claude Sonnet) a grounded answer: quotes appear in their original
   language, messages and notes are cited distinctly, and the model is instructed never
   to guess beyond the retrieved context or to play advisor/predictor/judge.

## The model: one instance per couple

Each couple runs **one isolated Supabase project + one Telegram bot** — not
multi-tenant. Separate projects give perfect data isolation for free. Every instance is
the **same pair**: an English-native partner (learning Ukrainian) and a Ukrainian-native
partner (learning English). The **English-native partner is the admin**.

**Self-hosted.** You run your own Supabase project, your own Anthropic/OpenAI keys, your
own bot, and your own deploys. The single canonical `index.ts` is couple-agnostic —
nothing about a specific couple is baked into the code; it all lives in secrets and seed
data. **Never fork `index.ts`** — one file deploys to every instance unchanged.

## Data model

The initial migration (`supabase/migrations/20260601000000_init_schema.sql`) builds the
whole database from zero — **10 tables, 7 application functions**, and the required
extensions (`vector`, `pg_trgm`, `uuid-ossp`). Row-level security is enabled on every
table; the bot connects as the service role.

| Table | Holds |
|---|---|
| `users` | The two partners — Telegram ID, display name, native + learning language. |
| `conversations` | The single default conversation every message is filed under. |
| `messages` | Every text/voice message: original + translation, languages, input type, voice metadata. |
| `message_annotations` | Per-message vocabulary / grammar / idiom / register findings. |
| `vocabulary` | Deduplicated lemmas with gloss, part of speech, cross-language translation, occurrence count. |
| `flashcards` | A user's chosen study cards (vocabulary + example message). |
| `notes` | `/remember` notes (private to their author). |
| `message_pins` | Pinned (meaningful) messages. |
| `message_reconciles` | Messages excluded from `/recap`. |
| `recap_embeddings` | Vector + text content for messages and notes, powering `/recap`. |

| Function | Purpose |
|---|---|
| `recap_semantic_search` | Vector (cosine) candidate search for `/recap`. |
| `recap_keyword_search` | Trigram candidate search for `/recap`. |
| `upsert_recap_embedding` | Store/update an embedding for a message or note. |
| `recap_backfill_batch` / `recap_backfill_remaining` | Embed an existing corpus in batches. |
| `refresh_vocabulary_counts` | Recompute `occurrence_count` from annotations. |
| `vocab_top_unlearned` | Top words not yet in a user's deck. |

Voice-note audio is archived to a **private Supabase Storage bucket named
`voice-messages`** (created by `storage_setup.sql` — the migration builds only the
database, not Storage).

## Repository map

| Path | What it is |
|---|---|
| `supabase/functions/telegram-bot/index.ts` | The entire bot — one canonical file. |
| `setup.ts` | **Guided setup wizard** — `deno run -A setup.ts` provisions a whole instance end to end. |
| `start.sh` | Interactive start-up menu for a freshly cloned repo (prereqs + common tasks). |
| `supabase/migrations/` | Versioned DB migrations; the init migration builds everything (10 tables, 7 functions, extensions). |
| `seed_couple.sql` | Seeds your two users + the default conversation. |
| `storage_setup.sql` | Creates the private `voice-messages` Storage bucket (bucket-as-code). |
| **`PROVISION_NEW_COUPLE.md`** | **The setup runbook — start here.** |
| `.env.example` | Template for the five function secrets (copy to `.env`). |
| `.github/workflows/deploy.yml` | **Primary deploy path:** CI, manual (`workflow_dispatch`), gated deploy from GitHub. |
| `.github/workflows/check.yml` | CI: runs the pre-deploy gate on every push/PR (never deploys). |
| `deploy.ps1` / `predeploy-check.ps1` | Fallback deploy spine: gate → CLI-from-disk deploy → health smoke. (Windows PowerShell.) |
| `deploy.sh` / `predeploy-check.sh` | Same fallback spine, ported to bash (macOS/Linux). |
| `provision.sh` | Scripts the automatable provisioning glue (secrets, webhook, health). |
| `deno.json` | Deno tasks (`check`, `lock`) + lockfile config for deterministic builds. |
| `.devcontainer/` | Codespaces config (Deno + Supabase CLI) for laptop-free setup. |
| `docs/` | Background & design history (deploy-safety + reproducibility handoffs). |
| `CLAUDE.md` | Working guidance for Claude Code in this repo (hard rules, deploy discipline). |

## Prerequisites

- A **Supabase** account + the **Supabase CLI** (`supabase`).
- An **Anthropic** API key and an **OpenAI** API key (each couple uses their own).
- A **Telegram** account (create the bot via **@BotFather**).
- **Deno** — the pre-deploy gate runs `deno check`.
- **Git**.
- **Docker Desktop** — *only* if you ever re-dump the schema (`supabase db dump`). Not
  needed for normal setup or deploys.
- **PowerShell** for the deploy wrapper (Windows). On macOS/Linux, run the equivalent
  commands under [Deploying](#deploying) — or ask and a bash port can be added.

## Quick start

**Easiest — start in a GitHub Codespace (no local install).** Click **Code → Codespaces →
Create codespace on `master`**. The devcontainer ships **Deno + the Supabase CLI**
preinstalled, so you can run the guided wizard right away:

```bash
deno run -A setup.ts
```

It walks you through the whole setup one question at a time: it guides the steps that must
be done in a browser/app (create the bot, create the Supabase project, get API keys) and
automates the rest (generates `WEBHOOK_SECRET`, writes `.env`, applies the migration,
creates the bucket, seeds the couple, sets secrets, deploys, sets the webhook, smoke-tests).
It's idempotent and resumable.

**Prefer a local machine?** Install **Deno** + the **Supabase CLI** and run the same
`deno run -A setup.ts`. Or do it by hand — follow
**[`PROVISION_NEW_COUPLE.md`](PROVISION_NEW_COUPLE.md)** end to end, or run **`./start.sh`**
for a menu. In brief:

1. Create the bot (**@BotFather**) → bot token.
2. Both partners get their Telegram IDs (e.g. via **@userinfobot**).
3. Create a Supabase project — **eu-west-1 / Postgres 17**.
4. Apply the database migration — `supabase db push` (or paste the init migration into the Dashboard SQL editor).
5. Create a **private storage bucket named `voice-messages`** (for voice-note audio).
6. Set the function secrets (below) — **`ADMIN_TELEGRAM_ID` before you deploy.**
7. Deploy (see below).
8. Seed with **`seed_couple.sql`**.
9. Set the Telegram webhook to the function URL with `secret_token = WEBHOOK_SECRET`.
10. Smoke-test (`/help`, a translation each way, `/remember` → `/recap`, `/pin`/`/pinned`).

> New couples start with an **empty corpus**, so the `/backfill*` commands don't apply.

## Secrets (set on your Supabase project)

| Secret | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | your bot token from @BotFather |
| `WEBHOOK_SECRET` | freshly generated, e.g. `openssl rand -hex 32` |
| `ANTHROPIC_API_KEY` | your Anthropic key |
| `OPENAI_API_KEY` | your OpenAI key (Whisper + embeddings) |
| `ADMIN_TELEGRAM_ID` | the **English-native** partner's numeric Telegram ID |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are **auto-injected** by Supabase — don't set them.

## Deploying

**Primary: deploy from GitHub Actions (no laptop needed).** **Actions → deploy → Run
workflow** (type `deploy` to confirm) runs the gate, deploys the committed file, and
smoke-tests the health route. It runs **only** on manual dispatch — never on push/PR — so
it stays safe on a public repo. It needs two repo secrets (Settings → Secrets and
variables → Actions): `SUPABASE_ACCESS_TOKEN` (from supabase.com/dashboard/account/tokens)
and `SUPABASE_PROJECT_REF`. The bot's function secrets stay on Supabase — a code deploy
never touches them. (The `setup.ts` wizard can set these two repo secrets for you if `gh`
is installed.)

### Fallback: deploy from your laptop (offline / first-time setup)

**Windows:**
```powershell
.\deploy.ps1 -ProjectRef <your-ref>
```

**macOS / Linux:**
```bash
./deploy.sh <your-ref>          # same gate → CLI-from-disk deploy → health smoke
```

**Any OS** (what the wrappers do, run from the repo root):
```bash
# 1. Gate: must compile and not be a stub
deno check supabase/functions/telegram-bot/index.ts        # exits clean
#    (index.ts should be well over 1500 lines — a stub would be a few hundred)

# 2. Deploy ONLY the committed file via the CLI (never an inline/reconstructed string)
supabase functions deploy telegram-bot --project-ref <your-ref> --no-verify-jwt

# 3. Smoke test: confirm the new build is actually live
curl "https://<your-ref>.supabase.co/functions/v1/telegram-bot?health"
#    expect {"status":"ok","version":"vNN","adminConfigured":true}

# 4. Tag the rollback point
git tag vNN
```

**Deploy discipline** (this project has been bitten by bad deploys — keep it):
- Deploy **only the committed file** — never a hand-assembled or reconstructed string.
- **Bump `BUILD_VERSION`** in `index.ts` before each deploy, so the health route proves
  the new build landed; **`git tag`** after.
- If a deploy misbehaves, redeploy the previous tag (it redeploys ground truth).
- The pre-deploy gate (`predeploy-check.ps1` / `predeploy-check.sh`) refuses to ship
  unless `deno check` passes, the file is well over its minimum line count, and key code
  anchors are present — a backstop against accidentally deploying a stub. The same gate
  runs in `.github/workflows/check.yml` on every push/PR, and as step one of the primary
  `deploy.yml` workflow.

### Self-deploy from Telegram (`/update`)

The admin can check for and ship new builds **from inside Telegram** with **`/update`**:
it reads the latest `BUILD_VERSION` from this repo on GitHub, compares it to the running
build, and — if the live bot is behind — offers a one-tap **Deploy** button that dispatches
the same `deploy.yml` workflow above. You stay in the loop (you tap the button) and the
predeploy gate + health smoke test still run. The feature is **inert** unless configured.

Each bot passes the workflow its **own** Supabase project ref (read from the injected
`SUPABASE_URL`), so one repo and one deploy token can serve several instances — every
`/update` deploys to *that* bot's project, never a shared default. Older builds that don't
send a ref fall back to the repo's `SUPABASE_PROJECT_REF` secret (the original
single-project behavior).

It relies on **two separate secret buckets** — mixing these up is the #1 source of trouble:

| Bucket | Where | Keys | Used by |
|---|---|---|---|
| **Supabase function secrets** | Supabase → Edge Functions → Secrets | `GITHUB_DEPLOY_TOKEN`, `GITHUB_REPO`, `GITHUB_DEPLOY_BRANCH` | the **bot** (to read the latest version + dispatch the deploy) |
| **GitHub Actions repo secrets** | repo Settings → Secrets and variables → Actions | `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` | the **workflow** (to authenticate to Supabase and deploy) |

The three function secrets:
- `GITHUB_DEPLOY_TOKEN` — a GitHub PAT, fine-grained with **Actions: write** on this repo
  (or a classic token with the `workflow` scope). Without it, `/update` only reports version
  status — no deploy button. Named to avoid colliding with Actions' built-in `GITHUB_TOKEN`.
- `GITHUB_REPO` — exactly `owner/name` (e.g. `anonymouspartner/capybara-bot`). No `https://`,
  no trailing slash, no spaces.
- `GITHUB_DEPLOY_BRANCH` — the deploy branch whose `BUILD_VERSION` is "latest" (default `main`).

**Gotchas (learned the hard way):**
- The bot fetches
  `https://raw.githubusercontent.com/<GITHUB_REPO>/<GITHUB_DEPLOY_BRANCH>/supabase/functions/telegram-bot/index.ts`.
  If `GITHUB_REPO` or `GITHUB_DEPLOY_BRANCH` is even slightly off (wrong owner, a stale/deleted
  branch, a stray trailing space) the fetch 404s and `/update` replies *"Couldn't read the
  latest version from GitHub."* Correct the value and redeploy.
- Function secrets are read **at boot**, so after changing any of them you must **redeploy**
  for the running bot to pick them up — updating the secret alone does nothing until the next deploy.
- Verify end-to-end by sending **`/update`**: a correct setup replies
  **"Up to date — running vNN, latest is vNN."** Once `main` moves ahead of what's live, the
  same command shows **"Update available …"** plus the one-tap **Deploy** button.

**Running several instances from one repo.** Because each bot passes its own project ref,
multiple deployments can share this single repo and one `GITHUB_DEPLOY_TOKEN`:

- The repo's `SUPABASE_ACCESS_TOKEN` must be **account-level** — able to reach every target
  project's org. Projects in *different* orgs are fine, as long as one token covers them all.
- Optionally set the repo **variable** `DEPLOY_ALLOWED_REFS` (Settings → Secrets and variables
  → Actions → Variables) to a comma-separated allowlist of permitted project refs. The workflow
  then refuses any target outside the list, so a leaked deploy token can't push to another
  project. Leave it unset to allow any ref the access token can reach.
- The read-only version *check* needs only `GITHUB_REPO` (a public repo's raw file needs no
  token), so it is always safe to share; only the **Deploy** button needs `GITHUB_DEPLOY_TOKEN`.

## Reproducibility & determinism

A few things keep a fresh instance reproducible from the committed files alone:

- **Pinned dependencies.** `index.ts` imports exact versions from esm.sh (no floating
  `@2` major), so the bytes you deploy don't drift over time. Generate the lockfile once
  with `deno task lock` (writes `deno.lock`) and commit it; from then on `deno check` —
  in the local gate and in CI — verifies dependencies against it automatically.
- **One config file for secrets.** Copy `.env.example` → `.env`, fill in the five
  values, and apply them in one shot: `supabase secrets set --env-file .env --project-ref <ref>`.
  `.env` is gitignored; `.env.example` is the source of truth for *what* must be set.
- **Bucket-as-code.** The private `voice-messages` Storage bucket is created by running
  `storage_setup.sql` (idempotent), instead of a manual Dashboard click.
- **Versioned schema.** The database lives in `supabase/migrations/` as a single init
  migration. `supabase db push` reproduces a fresh DB exactly, and future schema changes
  are added as new, ordered migration files rather than re-dumping by hand.
- **Cross-platform fallback deploy spine.** `deploy.sh` / `predeploy-check.sh` mirror the
  PowerShell scripts so the gate-and-deploy flow runs on any OS.
- **CI gate.** `.github/workflows/check.yml` runs the pre-deploy sanity gate on every
  push and PR. It **never deploys** — Capybara deploys are always human-run.
- **Scripted glue.** `provision.sh` automates the fiddly provisioning steps (set
  secrets, point the Telegram webhook, hit the health route), leaving only the
  genuinely interactive steps (create the project, create the bot) to you.

## Bot commands

Send **`/help`** in the bot for the full, language-aware list. Highlights:

| Command | Does |
|---|---|
| *(any text/voice)* | Translate EN↔UK and forward to your partner |
| *(any video / video note)* | Forward straight to your partner (no translation) |
| `/recap <question>` | Ask your shared conversation history (private to you) |
| `/remember <note>` | Add a private note that `/recap` can find |
| `/pin` · `/pinned` · `/unpin` | Mark / list / unmark meaningful messages (reply to one) |
| `/reconcile` · `/restore` | Hide / unhide a message from `/recap` (reply to one) |
| `/vocab` | Top still-unlearned words in each deck |
| `/learn <word>` · `/learn top N [uk\|en]` | Add a word (or the top N) to a deck |
| `/forget <word>` | Remove a word from the matching deck |
| `/export` | Export both decks as a single Anki CSV |
| `/help` · `/start` | Help / welcome |

> `/recap` has a 24-hour cooling-off on **messages** (recent messages don't surface),
> but `/remember` **notes** are searchable immediately.

## Privacy

- **Per-couple isolation.** Each couple is a separate Supabase project, database, and
  bot — there is no shared infrastructure and no cross-couple data path.
- **Private by default.** The storage bucket is private; the webhook is secret-gated;
  RLS is on for every table and the bot speaks only as the service role.
- **Notes are personal.** `/remember` notes are only ever returned to their author's
  own `/recap`. Messages are shared between the two partners by design (it's one
  conversation), but `/recap` answers are generated per-asker.
- **Your keys, your data.** You bring your own Anthropic and OpenAI keys; nothing is
  routed through a shared service.

## Admin & maintenance commands

These are gated to the admin (English-native partner) and exist mainly for **migrating
an existing corpus** — new couples can ignore them.

| Command | Does |
|---|---|
| `/diag` | Ping Anthropic, Whisper, and embeddings; report recent DB activity |
| `/backfill` | Annotate one batch of un-annotated messages |
| `/backfill_translations` | Fill in missing cross-language lemma translations, one batch |
| `/recap_backfill` | Embed one batch of existing messages for `/recap` |

Each backfill command is **idempotent and batched** — run it repeatedly until it reports
zero remaining.

## Design philosophy

- **One file, never forked.** Every instance ships the exact same committed `index.ts`.
  A change means editing the one file and re-deploying instances from it.
- **Claude builds and commits; a human deploys.** Deploys are always run by hand, one
  instance at a time, after the gate passes — past stub/bad deploys took the live bot
  down, hence the strictness.
- **No secrets in code or git.** Every credential is read via `Deno.env.get(...)` and
  set as a function secret; `.env` is gitignored.
- **Couple-agnostic core.** Identity (names, IDs, keys) lives entirely in secrets and
  seed data — never in the source.

See [`CLAUDE.md`](CLAUDE.md) for the full working rules and [`docs/`](docs) for the
deploy-safety and reproducibility handoffs that shaped them.

## Troubleshooting

- **Health route shows `adminConfigured: false`** — `ADMIN_TELEGRAM_ID` isn't set on
  that project. Set it and **redeploy** (it's read once at boot); admin commands stay
  gated shut until you do.
- **Bot doesn't recognize a partner** — an unregistered Telegram user gets a reply with
  their own numeric ID. Put both IDs in `seed_couple.sql` and run it.
- **A freshly-sent message doesn't appear in `/recap`** — expected: messages have a
  24-hour cooling-off. Use a `/remember` note to test recap immediately.
- **Voice transcription works but no audio is archived** — the `voice-messages` storage
  bucket is missing; the upload error is logged and ignored. Create the bucket.
- **`getWebhookInfo` shows a `last_error_message`** — usually a wrong webhook URL or a
  `secret_token` that doesn't match `WEBHOOK_SECRET`. Re-run `setWebhook`.
- **Deploy aborted by the gate** — `predeploy-check.ps1` failed (`deno check`, line
  count, or missing anchors). Fix the reported issue; nothing was deployed.

## Tech stack

- **Runtime:** Deno (Supabase Edge Functions).
- **Database:** Postgres (Supabase) with `pgvector`, `pg_trgm`, `uuid-ossp`.
- **AI:** Anthropic Claude (Sonnet for translation/annotation/recap synthesis, Haiku for
  query parsing); OpenAI Whisper (voice) and `text-embedding-3-small` (embeddings).
- **Messaging:** Telegram Bot API (webhook).
- **Tooling:** Supabase CLI, PowerShell deploy spine, Git.
</content>
</invoke>
