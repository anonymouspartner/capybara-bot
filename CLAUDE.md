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
| `.github/workflows/` | CI gate (`check.yml`) + **primary deploy path** (`deploy.yml`, manual `workflow_dispatch`) + `webhook-watch.yml` (scheduled outside-in check that this bot still owns its Telegram webhook) + `auto-learn.yml` (scheduled daily "add frequently used words," see "How cards reach the study app" below) + `rerecord-pronunciation.yml` (manual, after a pronunciation voice change); `.devcontainer/` for Codespaces. |
| `deploy.ps1` / `predeploy-check.ps1` | Fallback deploy spine for offline/local deploys (Windows PowerShell). |
| `deploy.sh` / `predeploy-check.sh` / `provision.sh` | Same fallback spine, ported to bash, + provisioning glue. |
| `docs/` | Background & design history (deploy-safety + reproducibility handoffs). |
| `README.md` | Human-facing overview. |

## Hard rules

- **Claude builds + commits only — never deploys.** The maintainer runs every deploy themselves. Past stub /
  bad deploys took the live bot down. Do **not** run `deploy.ps1`/`deploy.sh`, `supabase functions deploy`,
  **or trigger the `deploy.yml` GitHub Actions workflow** (its "type `deploy` to confirm" dispatch input
  ships straight to prod) — by any means, including `gh workflow run` — unless explicitly told to in that
  moment.
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

**Primary (default): GitHub Actions.** Actions → **deploy** → **Run workflow**, type `deploy` to confirm.
Runs the same gate → CLI-from-disk deploy → health smoke, no local machine needed. Requires repo secrets
`SUPABASE_ACCESS_TOKEN` and `SUPABASE_PROJECT_REF` (see README "Deploying").

**Fallback (offline / first deploy during setup): local scripts.** Windows: `.\deploy.ps1 -ProjectRef <ref>`.
macOS/Linux: `./deploy.sh <ref>`.

The admin `/update` command is an alternate trigger for the **same** `deploy.yml` workflow —
it just dispatches it from inside Telegram. The human stays in the loop (the admin taps the
deploy button), and the workflow's predeploy gate + health smoke test still run. It does not
bypass any of the discipline above. The feature is inert unless the optional `GITHUB_*` secrets
below are set.

## Secrets (set on the Supabase project, never in the repo)

`TELEGRAM_BOT_TOKEN`, `WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
`ADMIN_TELEGRAM_ID` (the English-native partner's numeric Telegram ID).
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected by Supabase — don't set them.

**One token, one consumer.** `TELEGRAM_BOT_TOKEN` belongs to this bot and nothing else —
not one *bot*, one *process*. Telegram serves a token to a single consumer, so any other
service configured with it takes this bot's updates. A second webhook consumer overwrites
the URL; a **polling** client is worse, because polling and webhooks are mutually exclusive
and those libraries call `deleteWebhook` on every startup. Either way Telegram stops
delivering here, the function is never invoked, and **nothing appears in its logs** — the
chat just goes quiet, which reads as the bot ignoring the couple. This has happened (a
job-triage bot on this token answered `/start` in the couple's chat). Never copy a `.env`
between projects; give the other service its own @BotFather bot. `getWebhookInfo` is the
only place the truth lives — `/diag`, `?health&webhook`, and the `webhook-watch` workflow
all read it.

This has now happened **twice**, so the bot repairs itself: `POST ?repair_webhook`
(authenticated by `WEBHOOK_SECRET` in the `x-capybara-internal-secret` header) re-registers
this function as the webhook. It is called by `webhook-watch`, which must live outside —
once the webhook is gone this function is never invoked, so it cannot notice on its own.
The route takes **no parameters** and only ever registers `EXPECTED_WEBHOOK_URL`, so the
worst anyone holding the secret can do is put the bot back where it belongs. The repairing
run still **fails**, on purpose: self-healing must never be silent, because a bot that
quietly recovers every few hours is a bot whose token is still shared.

Optional (enable the admin `/update` self-deploy command; the feature is inert if unset):
`GITHUB_DEPLOY_TOKEN` (GitHub PAT with `Actions: write` — dispatches `deploy.yml`; without it
`/update` only reports version status, no deploy button), `GITHUB_REPO` (`owner/name`),
`GITHUB_DEPLOY_BRANCH` (defaults to `main`).

Optional (enable `/study`, which opens capybara-anki's reviewer as a Telegram Mini App;
inert if unset): `ANKI_APP_URL` — that app's own https URL (a static site on GitHub Pages,
a separate deployment this function does not serve). Note this bot's `TELEGRAM_BOT_TOKEN`
is also what capybara-anki verifies the Mini App's signed `initData` against. That is an
HMAC key only — it makes no call to Telegram's API, so it does not make that app a second
*consumer* of the token in the sense warned about above.

## How cards reach the study app

`/export`'s CSV is no longer the road from this bot to capybara-anki. Cards are written
into `anki_notes` at the moment someone chooses them, which the Mini App (`/study`) reads
directly:

| Source | Writes | Deck |
|---|---|---|
| `/learn <word>`, `/learn top N` | the words just added to `flashcards` | `Ukrainian` / `English` |
| the grammar assistant (`/capybara`) | each correction, as a fill-in-the-blank card | `Grammar` |
| `.github/workflows/auto-learn.yml` (daily, automatic) | `/learn top N`'s own selection, run unattended for each person's own deck | `Ukrainian` / `English` |
| the same daily run (`runAutoPronounceCron`) | up to 5 of each person's own flashcard **words** a day as pronunciation cards (TTS audio in the public `pronunciation-audio` bucket; voice per language, `PRONUNCIATION_TTS_VOICE_BY_LANG` -- English `onyx`, else `nova`) | `Pronunciation` (uk) / `English Pronunciation` |
| `/syncanki` (admin) | the whole existing corpus, once | all of the above |

**Annotation deliberately does not create cards.** `vocabulary` is every word the
annotator has ever seen (11,329 rows); the deck is the subset someone deliberately chose
(`flashcards`, 776). Mirroring the first would mint ~15 cards for every one actually
asked for and empty `/learn` of meaning. An earlier version did exactly that — if you are
tempted to move the write back into `annotateMessage`, this is why not.

**`auto-learn.yml` is not that mistake, on purpose.** It's `/learn top N`'s own logic
(`runAutoLearnCron`, reusing `fetchTopUnlearned` unchanged) run once a day instead of by
hand, guarded two ways: `AUTO_LEARN_THRESHOLD` (10) requires a word to have genuinely kept
recurring, not merely appeared once, and `AUTO_LEARN_MAX_PER_RUN` (15) caps how many land
in a single day, so switching this on against months of existing `vocabulary` history
doesn't dump a huge backlog into the deck at once — it trickles in over several days, the
same shape a person occasionally running `/learn top 15` themselves would produce. Each
person's run only ever touches their own `learning_language` deck, never a partner's.
Sends a Telegram message listing what it added, same as `/learn` does, so it's never a
silent surprise. The pronunciation half is **words only, never example sentences**: those are lines
from the couple's conversations, and this run puts their audio in a public bucket with
nobody reviewing it first. Changing a voice leaves existing bot-made cards in the old
one until `rerecord-pronunciation.yml` is run (after the deploy): it re-records them in
place, keeping their review history, and never touches the imported deck's audio. Sentence cards stay a reviewed, manual
`scripts/anki_pronunciation --direct` run (preview, `--save-plan`, `--skip`). The
workflow logs counts only -- this repo's Actions logs are world-readable. The route (`POST ?internal_autolearn`) reuses `WEBHOOK_SECRET` as its
bearer credential (`x-capybara-internal-secret` header, the same trust
`internal_backfill_examples` already uses) — the workflow needs `WEBHOOK_SECRET` and
`SUPABASE_PROJECT_REF` added as **repo** secrets (Settings → Secrets and variables →
Actions) to actually run; missing either fails the scheduled run loudly rather than
silently doing nothing.

One builder shapes every card (`vocabCardFields` / `grammarCardFields`), used by the CSV,
the live writes, and the backfill alike. Two would drift, and the copy the app reads is
the one nobody is looking at while they review.

`/syncanki` is idempotent — `writeAnkiNotes` checks `anki_notes`' own
`(lemma, part_of_speech, language)` key with an explicit select before inserting,
excluding rows the original Anki import wrote (that key is only a *partial* unique
index on capybara-anki's side, `WHERE source <> 'anki-import'` — a real export can
hold two notes sharing that key, one plain and one a `Capybara+` revision, both
independently reviewed for months, so imported rows are exempted from uniqueness
rather than collapsed). A plain upsert against that index doesn't work: Postgres
only accepts a partial index as an `ON CONFLICT` target when the request repeats
its exact `WHERE` clause, which `supabase-js`'s `.upsert({ onConflict })` has no
way to supply — so re-running `/syncanki` matches rather than duplicates by
checking first, not by relying on the database to reject a conflict. `/export`
stays forever as the backup and escape hatch (capybara-anki's D-§2.3), just not
as the daily path.

Optional (enable the admin `/bug` report command; inert if unset): `GITHUB_ISSUE_TOKEN` (GitHub PAT
with `Issues: write` — files issues on `GITHUB_REPO`). Falls back to `GITHUB_DEPLOY_TOKEN`, which
then needs both `Issues: write` and `Actions: write`; keeping them separate means the issue-filing
token can't dispatch a production deploy. `/bug` sends only the text the reporter types — never
conversation content — but that text does leave the instance for GitHub.

## Repo topology (important)

Two repos exist under `anonymouspartner`:

| Repo | Visibility | State |
|---|---|---|
| `capybara-bot` | **public** | active — this is the one that ships, and what `GITHUB_REPO` names |
| `capybara` | private | **archived** (predecessor; archived repos can't take issues) |

**The working repo is public.** Never commit conversation content, a partner's real details, or
anything from the corpus — code, docs and `.env.example` placeholders only. It also means a `/bug`
issue is **world-readable**, which is why `/bug` is **admin-only**: the non-admin partner can't
judge where the text lands, and a warning in a prompt is not consent. If bug reports ever need to
be private, add a `GITHUB_ISSUE_REPO` secret pointing at a *new* private repo rather than reusing
the archived one.

## Environment notes (this laptop)

These notes describe the maintainer's local setup — relevant for the **fallback** local-script deploy path
and for running the pre-deploy gate during development.

- **Windows + PowerShell.** `deploy.ps1` / `predeploy-check.ps1` are PowerShell.
- **Stale-PATH gotcha:** CLIs may be installed but missing from the current shell's PATH. Known:
  `gh` lives at `C:\Program Files\GitHub CLI\gh.exe`. Call tools by full path if PATH lookup fails.
- **Deno** is required for the pre-deploy `deno check` gate.
