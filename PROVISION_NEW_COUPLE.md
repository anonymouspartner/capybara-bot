# Provision a New Capybara Couple — Runbook

> **Fastest path:** run **`deno run -A setup.ts`** (locally or in a GitHub Codespace) — the
> guided wizard automates Steps 4–9 below and fills the seed for you. This runbook remains
> the manual reference the wizard mirrors.

Stamp out a fresh Capybara instance for a new couple from the **canonical committed
files** — no per-couple code edits. The unit of reproduction is **one isolated
Supabase project + one Telegram bot per couple** (not multi-tenant); separate
projects give perfect data isolation for free.

Every instance is the **same language pair**: an English-native partner (learning
Ukrainian) and a Ukrainian-native partner (learning English). The **English-native
partner is the admin**.

Files this runbook uses (all already committed, deploy them unchanged):
- `supabase/migrations/20260601000000_init_schema.sql` — builds the empty database from zero.
- `seed_couple.sql` — seeds the two users + the default conversation.
- `supabase/functions/telegram-bot/index.ts` — the one canonical function. **Never fork it.**
- `deploy.ps1` / `predeploy-check.ps1` — the deploy spine (gate + CLI-from-disk + health smoke).

> **Only Step 6 (deploy) needs the Supabase CLI on your laptop.** Everything else is
> Dashboard, Telegram, or a single HTTP call, and can be done from anywhere.

---

## Before you start

- A couple's **own** API keys: Anthropic + OpenAI (one set per couple — keys are not shared).
- The two partners' **numeric Telegram IDs** (see Step 2).
- Decide who is admin: the **English-native** partner.

---

## Step 1 — Create the bot *(Telegram / @BotFather)*

1. Open a chat with **@BotFather** → `/newbot` → follow the prompts (display name + a
   username ending in `bot`).
2. **Save the HTTP API token** it gives you (looks like `123456789:AA…`). This is
   `TELEGRAM_BOT_TOKEN`.

## Step 2 — Get both partners' Telegram IDs *(Telegram)*

Each partner messages **@userinfobot** (or @RawDataBot) and reads their numeric **Id**.
Record:
- **admin** (English-native) → this is `ADMIN_TELEGRAM_ID` *and* one of the seed values.
- **partner** (Ukrainian-native) → the other seed value.

> **Fallback (the bot's built-in trick):** if you skip this step, your own bot will
> reply to any *unregistered* message with `Your Telegram user ID is: …`. But that
> only works **after** Steps 6 + 8 (deploy + webhook), so you'd then have to set
> `ADMIN_TELEGRAM_ID`, run the seed, and **redeploy** to pick up the admin secret.
> Getting the IDs now keeps provisioning linear and avoids the redeploy.

## Step 3 — Create the Supabase project *(Dashboard)*

1. New project. **Match the primary** so nothing surprises: **Region eu-west-1
   (Ireland)**, **Postgres 17**.
2. Set and save a strong DB password.
3. Note the **project ref** (the `abcd…` in the project URL / Settings → General). Call
   it `<NEW_REF>` below.

## Step 4 — Apply the schema *(CLI `db push` or Dashboard SQL editor)*

1. Apply the init migration `supabase/migrations/20260601000000_init_schema.sql`, either:
   - **CLI:** `supabase db push --project-ref <NEW_REF>` (records it as applied), or
   - **Dashboard:** **SQL Editor** → paste the entire contents of that file → **Run**.
2. It is idempotent (`IF NOT EXISTS` / `OR REPLACE`) and prepends the required
   extensions (`vector`, `pg_trgm`, `uuid-ossp`).
3. Sanity check (run after): expect **10 tables** and the **7 app functions**.
   (Don't `count(*)` functions in `public` — `vector` lives there and adds its own;
   check the app functions by name instead.)
   ```sql
   select count(*) from pg_tables where schemaname = 'public';            -- 10
   select proname from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and proname in ('upsert_recap_embedding','recap_semantic_search',
                     'recap_keyword_search','recap_backfill_remaining',
                     'recap_backfill_batch','refresh_vocabulary_counts',
                     'vocab_top_unlearned')
   order by proname;                                                      -- 7 rows
   ```

## Step 4b — Create the `voice-messages` storage bucket *(Dashboard)*

Voice notes upload their audio to a Supabase Storage bucket named **`voice-messages`**.
The migration builds only the database, not storage, so create the bucket separately:

Two equivalent ways — pick one:

- **As code (reproducible):** paste **`storage_setup.sql`** into the **SQL Editor** →
  **Run**. It creates the private bucket idempotently and verifies it.
- **By hand:** Dashboard → **Storage** → **New bucket** → name it exactly
  `voice-messages` → keep it **private** (not public) → **Create**.

The function writes with the service role, so a private bucket is correct.

> Skippable only if the couple won't use voice notes: without the bucket, voice
> transcription and translation still work, but the original audio isn't archived (the
> upload error is logged and ignored). Text messages are unaffected either way.

## Step 5 — Set the function secrets *(Dashboard or CLI) — BEFORE deploy*

Set these **five** secrets. `ADMIN_TELEGRAM_ID` **must be set before Step 6**, because
the function reads it once at boot; deploying without it leaves admin commands gated
shut (and the health route will report `adminConfigured: false`).

| Secret | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | the bot token from Step 1 |
| `WEBHOOK_SECRET` | freshly generated per instance — e.g. `openssl rand -hex 32` |
| `ANTHROPIC_API_KEY` | the couple's own Anthropic key |
| `OPENAI_API_KEY` | the couple's own OpenAI key (Whisper voice + recap embeddings) |
| `ADMIN_TELEGRAM_ID` | the **English-native** partner's numeric Telegram ID (Step 2) |

> `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are **auto-injected** by Supabase —
> do **not** set them yourself.

CLI form, from a file (recommended — one source of truth): copy **`.env.example`** to
`.env`, fill in the five values, then:
```bash
supabase secrets set --env-file .env --project-ref <NEW_REF>
# or: ./provision.sh secrets <NEW_REF>
```
CLI form, inline:
```powershell
supabase secrets set `
  TELEGRAM_BOT_TOKEN=<BOT_TOKEN> `
  WEBHOOK_SECRET=<WEBHOOK_SECRET> `
  ANTHROPIC_API_KEY=<ANTHROPIC_KEY> `
  OPENAI_API_KEY=<OPENAI_KEY> `
  ADMIN_TELEGRAM_ID=<ADMIN_TELEGRAM_ID> `
  --project-ref <NEW_REF>
```
Dashboard form: **Edge Functions → Secrets → Add new secret** (one per row).

> `.env` is gitignored — never commit real secret values. `.env.example` (committed)
> only documents the variable names.

## Step 6 — Deploy the function *(CLI — the only CLI step; you run it)*

From the repo root, against the new project:
```powershell
.\deploy.ps1 -ProjectRef <NEW_REF>
```
`deploy.ps1` runs `predeploy-check.ps1` (aborts on failure), deploys **from the
on-disk committed file** (never an inline string), then smoke-tests the health route
and asserts **200 + the BUILD_VERSION baked in `index.ts` + `adminConfigured: true`**.
On success it prints a `git tag` reminder.

> Unlike the primary's very first health-route deploy, a **new** instance ships the
> health route in the canonical file already, so this first deploy **is** auto-checked.

## Step 7 — Seed the couple *(Dashboard SQL editor)*

1. Open **`seed_couple.sql`**, fill the four values in the `with input as (…)` block:
   the two Telegram IDs (Step 2) and the two display names.
2. Paste into the **SQL Editor** → **Run**.
3. The trailing `SELECT` should show **two rows** — one `en` native (admin) and one
   `uk` native. If you still see the `<…>` placeholders or `000000000`, you didn't
   edit the input block; fix and re-run (it's `ON CONFLICT DO NOTHING`, so re-running
   is safe).

## Step 8 — Point Telegram at the function *(HTTP — browser or curl, not the CLI)*

Set the webhook to the function URL, with `secret_token` = your `WEBHOOK_SECRET`
(the function checks it on every update):
```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://<NEW_REF>.supabase.co/functions/v1/telegram-bot&secret_token=<WEBHOOK_SECRET>"
```
Verify:
```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
```
Expect `"url"` set, `"pending_update_count"` small, and no `"last_error_message"`.

## Step 9 — Smoke test *(Telegram + one HTTP check)*

1. **Health** (no Telegram): `GET https://<NEW_REF>.supabase.co/functions/v1/telegram-bot?health`
   → `{"status":"ok","version":"vNN","adminConfigured":true}`. Confirm `adminConfigured:true`.
   Add **`&seed`** to also check seeding *after* Step 7:
   `GET …/telegram-bot?health&seed` → adds `"userCount":2,"seeded":true`. If you see
   `"seeded":false` (userCount 0), Step 7 never ran — go seed before testing further.
   (Plain `?health` stays DB-free; `&seed` is the only variant that touches the DB.)
2. **/help** — bot replies with the command list in your native language.
3. **Translation both directions:**
   - English partner sends an English sentence → bot returns the Ukrainian translation.
   - Ukrainian partner sends a Ukrainian sentence → bot returns the English translation.
4. **/diag** (admin) — Anthropic / Whisper / embeddings reachable; the partner running
   `/diag` should get **"Not authorized."** (confirms `ADMIN_TELEGRAM_ID` gating).
5. **/pin** (reply to a translated message) → **/pinned** lists it → **/unpin** (reply again).
6. **/remember `a private note`**, wait a few seconds (background embedding), then
   **/recap `ask about that note`** → returns the note, cited *as a note*.

> **Recap gotcha — not a bug:** a freshly-sent **message** will **not** appear in
> `/recap` for **24 hours** (by-design cooling-off, messages only). `/remember` notes
> are exempt, which is why the recap smoke test uses a note. Don't read the 24h
> message delay as a broken deploy.

---

## Notes

- **Empty corpus.** New couples start with no history, so the backfill commands
  (`/backfill`, `/backfill_translations`, `/recap_backfill`) **do not apply** — skip
  them. They exist only for migrating an existing corpus.
- **Rollback point.** After a verified deploy, `git tag` the build (deploy.ps1 reminds
  you). Re-deploying a previous tag restores ground truth.
- **One canonical file.** Every couple deploys the same committed `index.ts`. If you
  ever need a change, edit the one file and re-deploy all instances from it — never
  fork per couple.
- **You run every deploy.** Build/commit happens on disk; you deploy and watch each
  instance yourself, one at a time, your own instance first.

---

## Troubleshooting

### Both partners see "…your Telegram ID hasn't been registered yet"

**Cause:** **Step 7 (seed) was never run**, so `public.users` is empty. With no rows,
every message fails the `lookupUser` check in `index.ts` and the bot replies with the
"not registered" notice for **everyone** — including the people who are supposed to be
registered. This is *not* a code, deploy, or webhook fault: the function can be healthy
and the webhook delivering updates (you'll see `POST … /telegram-bot → 200` in the
edge-function logs) and you'll still get this until the table is seeded.

**Confirm** — either hit the health route with the seed check (no Dashboard needed):
```
GET https://<REF>.supabase.co/functions/v1/telegram-bot?health&seed
→ {"status":"ok",…,"userCount":0,"seeded":false}   # 0 / false means the seed never ran
```
or query directly (Dashboard SQL editor, or `mcp__Supabase__execute_sql`):
```sql
select count(*) from public.users;   -- 0 means the seed never ran
```

**Fix:** run **Step 7** — seed the two users from `seed_couple.sql` (or insert their
real Telegram IDs + names directly), then have each partner message the bot once more.
The trailing `SELECT` must show **exactly two rows** — one `en` native (admin) and one
`uk` native.

> **Still "not registered" for just one partner after seeding?** That row's
> `telegram_id` doesn't match the number Telegram is actually sending — almost always a
> typo. Compare the seeded value against the `Your Telegram user ID is: …` the bot
> reports back, and re-seed (it's `ON CONFLICT DO NOTHING`, so correct the value or
> delete the bad row first).
