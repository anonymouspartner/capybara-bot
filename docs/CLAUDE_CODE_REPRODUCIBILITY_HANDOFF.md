# Claude Code Task — Build the Capybara Reproducibility Kit

Read `DEPLOY_SAFETY_HANDOFF.md` and `CLAUDE_CODE_SPINE_TASK.md` in this repo first.
They explain the ground-truth and deploy discipline that this task must not violate.

This task is **build-on-disk only. Do NOT deploy.** The human (the maintainer) runs and
watches every deploy themselves, on their own instance first, one at a time.

The goal: produce a repeatable kit that stamps out a new Capybara instance for a
second couple — same English↔Ukrainian language pair — from the *one* canonical
`index.ts`, with **zero per-couple file edits**. Everything couple-specific moves
into config, secrets, and seed data.

---

## 0. TL;DR

- The unit of reproduction is **one isolated Supabase project + one Telegram bot
  per couple.** Not multi-tenant. The code assumes exactly two users per database
  (`lookupPartner` does `.neq("id", userId).maybeSingle()`), and the recap layer's
  "shared corpus, private queries" model assumes a single couple's data. Multi-tenant
  is a real refactor with downside and no upside for a few friends; separate projects
  give perfect data isolation for free.
- The new couple is the **same pair**: male English-native (learning uk) + female
  Ukrainian-native (learning en). Because the pair is identical to the couple,
  **the entire script-detection layer, the Russian/Ukrainian language rules, the
  flags, and the `Capybara::Ukrainian` / `Capybara::English` deck names all carry
  over untouched.** No detection rewrite. No language-prompt parameterization. The
  only couple-specific things in the *code* are two values (see §3).
- Decisions already locked by the human: separate API keys per couple (Anthropic +
  OpenAI), and the maintainer services all instances (they hold the service role for each).
- Fresh couples start with an **empty corpus**, so none of the backfill commands
  (`/backfill`, `/backfill_translations`, `/recap_backfill`) apply. Onboarding is
  simpler than the original migration.
- **You build and commit. The human deploys and watches.** Do not run
  `supabase functions deploy`.

---

## 1. Step zero — verify the baseline before touching anything

Do not start until you confirm the trusted on-disk baseline exists. This mirrors
§3 of `DEPLOY_SAFETY_HANDOFF.md`.

```bash
git log --oneline -5
git tag
wc -l supabase/functions/telegram-bot/index.ts
```

- **Expected:** the `v-recovered-baseline` tag present, and a file around 1787 lines
  (recap layer shipped). If so, this file is ground truth. Proceed.
- **If the tag or the line count is missing:** STOP. You are in the hole §3 of the
  deploy-safety handoff exists to climb out of. Run the recovery first
  (`supabase functions download telegram-bot`, verify with `deno check`, commit and
  tag), then return to this task. **Do NOT reconstruct the file from the project's
  v26 + memory** — that is the documented reconstruction trap.

---

## 2. Hard constraints (do not violate)

- **Do NOT deploy.** Build, commit, stop. the maintainer deploys and watches.
- **One canonical `index.ts`. No forks.** The same committed file must deploy to
  every couple's instance unchanged. Forking per couple reintroduces the exact
  divergence/stub risk the deploy-safety spine eliminated.
- **Edit `index.ts` in place with minimal diffs.** Do not rewrite, reformat, or
  reconstruct it. Read the real lines off disk and patch them.
- **Read the live recap code off disk before patching it.** Do not work from the
  spec in `CLAUDE_CODE_HANDOFF.md` §4 — that is a design doc, not the shipped bytes.
  `grep -n "buildSynthesisPrompt\|the maintainer\|the partner" supabase/functions/telegram-bot/index.ts`
  to find the real lines, then patch those.
- **Never produce Russian text anywhere** — no translations, examples, comments,
  prompt text, or seed data. Project-wide rule. Cyrillic in this project is always
  Ukrainian.
- **Verify any model strings** you touch against
  https://docs.claude.com/en/docs/about-claude/models/overview — they drift. This
  task should not need to change them; if you find yourself editing one, stop and
  confirm it first.
- **Work approval-gated.** Build the deliverables one at a time. After each, pause
  and let the maintainer review before starting the next. Do not barrel through all five
  unreviewed. ("Debug first, then deploy" — propose, get approval, proceed.)

---

## 3. The two code edits to `index.ts`

These are the *only* code changes. Everything else is new standalone files. Keep
both diffs minimal.

### Edit A — `BACKFILL_ADMIN_TELEGRAM_ID` → environment variable

Currently hardcoded near the top of the file:

```ts
const BACKFILL_ADMIN_TELEGRAM_ID = <admin-telegram-id>;
```

Change it to read from an env var, so each instance's admin (the English-native
partner's Telegram ID) is set via function secrets rather than baked into the file:

```ts
const BACKFILL_ADMIN_TELEGRAM_ID = Number(Deno.env.get("ADMIN_TELEGRAM_ID"));
```

- Match the existing `Deno.env.get(...)` convention at the top of the file.
- The admin gate is compared against `msg.from?.id` (a number), so coerce to
  `Number`. Confirm the existing comparison sites still typecheck.
- For the maintainer's own instance, the secret is set to `<admin-telegram-id>`, so behavior is
  unchanged after they set it.

### Edit B — recap synthesis prompt names → dynamic from the `users` table

The synthesis prompt currently hardcodes the couple's identity. Per
`CLAUDE_CODE_HANDOFF.md` §4 the framing is, in spirit:

> "...between two people in a relationship: the maintainer (en native, learning uk) and
> the partner (uk native, learning en)..."

**Read the actual shipped `buildSynthesisPrompt` (or wherever this string lives) off
disk** and make the two-person framing dynamic, built at query time from the two
rows in `public.users`. Those rows already carry `display_name`, `native_language`,
and `learning_language`, so the names and roles can be assembled rather than
hardcoded.

Scope notes that *reduce* this edit:
- **Do NOT parameterize the language rules.** Because the new couple is the same
  en↔uk pair, the "never Russian / standard literary Ukrainian" block and all
  Cyrillic-vs-Latin logic stay exactly as written. Only the *names and native/learning
  roles* become dynamic.
- The existing `{asker_name}` / `{answer_language}` substitution logic stays. You are
  only replacing the hardcoded "the maintainer... and the partner..." identity clause with one
  built from the `users` rows.
- Fetch the two users once per `/recap` call (or reuse an existing lookup if the
  handler already has them in scope — check first). Match the existing error-handling
  pattern; if the lookup fails, degrade gracefully rather than throwing.

After both edits: `deno check` must pass, line count stays in the same ballpark, and
the spine's anchors (`Deno.serve`, `handleUpdate`, `BACKFILL_ADMIN_TELEGRAM_ID`,
`handleRecap`, `handleReconcile`, `handlePinned`) must all still be present.

---

## 4. The standalone deliverables

### Deliverable 1 — `schema.sql` (dumped, not reconstructed)

The base schema (`users`, `messages`, `vocabulary`, `flashcards`,
`message_annotations`, `conversations`, plus functions `refresh_vocabulary_counts`
and `vocab_top_unlearned`) was applied piecemeal via MCP across many conversations
and does not exist as a single file. The recap DDL/RPCs exist in
`CLAUDE_CODE_HANDOFF.md` §7.

Produce a clean, single init script that builds an empty project from zero:

```bash
supabase db dump --schema public > schema.sql
```

- Scrub it: remove anything environment-specific, owner/role grants that won't
  exist in a fresh project, and any data rows (it should be schema only).
- It must include the recap layer (the four tables + five RPCs). If the dump is
  schema-complete it already does; verify against §7 of `CLAUDE_CODE_HANDOFF.md`.
- **Do NOT hand-write this from memory.** Extract the real bytes — same principle as
  the index.ts ground-truth rule. Commit it beside `index.ts`.
- If `supabase db dump` isn't usable in this environment, STOP and leave a note for
  the maintainer to run it; do not substitute a reconstructed schema.

### Deliverable 2 — the two `index.ts` edits

Covered in §3. Minimal diffs, in place.

### Deliverable 3 — `seed_couple.sql` (parameterized template)

A template that seeds a fresh instance's two `users` rows and the default
conversation row. Use clear placeholders the human fills in per couple — e.g.
`:admin_telegram_id`, `:admin_display_name`, `:partner_telegram_id`,
`:partner_display_name`.

- One user is English-native learning Ukrainian; the other is Ukrainian-native
  learning English. Set `native_language` / `learning_language` accordingly.
- The conversation row can reuse `DEFAULT_CONVERSATION_ID`
  (`00000000-0000-0000-0000-000000000001`) — it's a separate database per couple,
  so no collision.
- Include a short comment block at the top explaining the onboarding trick: the
  unregistered-user code path replies with the sender's Telegram ID, so both
  partners message the bot once, read their IDs off the replies, fill them into this
  template, run it, then message again and it works.
- **No Russian anywhere**, including example display names — use neutral placeholders.

### Deliverable 4 — `PROVISION_NEW_COUPLE.md` (the runbook)

An ordered, copy-pasteable runbook in this repo's house style. The provisioning
order, with which surface each step uses:

1. Create the bot via @BotFather → bot token. *(Telegram)*
2. Create a new Supabase project; match region/PG version to the primary
   (eu-west-1 / PG17) so nothing surprises. *(Dashboard)*
3. Apply `schema.sql`. *(Dashboard SQL editor or CLI)*
4. Set function secrets (see the secret list below). *(Dashboard or CLI)*
5. **Deploy the function — CLI-from-disk, human-run, see §5.**
6. Seed via `seed_couple.sql` after the two partners have surfaced their Telegram
   IDs. *(Dashboard SQL editor)*
7. Set the Telegram webhook to the new function URL, with `secret_token` = the new
   `WEBHOOK_SECRET`. *(a single `setWebhook` HTTP call — browser/curl, not Supabase
   CLI)*
8. Smoke test: `/help`, a translation round-trip both directions, `/recap` on a
   freshly-sent message, `/pin` → `/pinned` → `/unpin`, `/remember` then `/recap`.

Secret list per instance (the runbook should enumerate these):
- `TELEGRAM_BOT_TOKEN` — the new couple's bot token
- `WEBHOOK_SECRET` — freshly generated per instance
- `ANTHROPIC_API_KEY` — the couple's own key
- the OpenAI key — **see the open verification item in §6; confirm the exact var
  name before writing it into the runbook**
- `ADMIN_TELEGRAM_ID` — the English-native partner's Telegram ID (new in Edit A)
- the standard Supabase-provided vars (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`)

State plainly in the runbook that **only the deploy step requires the CLI**;
everything else is Dashboard/Telegram/HTTP and can be done from anywhere.

### Deliverable 5 — parameterized `deploy.ps1`

The spine's `deploy.ps1` hardcodes `--project-ref <project-ref>`. With
multiple instances, parameterize it:

- Accept a project ref and the expected `BUILD_VERSION` as arguments
  (e.g. `-ProjectRef`, `-ExpectedVersion`).
- Keep the existing behavior otherwise: run `predeploy-check.ps1` first and abort on
  failure; deploy from the on-disk committed file via the CLI (never an inline
  string); after deploy, hit the health route and assert `200` + the expected
  version; print the `git tag` reminder.
- `predeploy-check.ps1` stays as-is — its anchors are couple-agnostic, so it does
  not need parameterizing.
- The script must still **never** assemble or pass file content as an inline string.
  CLI-from-disk only.

---

## 5. The human's deploy path (for context — not yours to run)

Once you've built and committed the above, the maintainer will, per their discipline:

1. Deploy-and-prove the two edits on **their own instance first** (they are the safe test
   couple), confirm translation + `/recap` still work and `ADMIN_TELEGRAM_ID` gating
   is correct, then tag.
2. Only then stamp the first friend couple from that same proven file.

You do not perform either. Build the kit; stop.

---

## 6. Open verification item

There is a documented discrepancy: the v26 source reads
`Deno.env.get("OPENAI_API_KEY")`, while `CLAUDE_CODE_HANDOFF.md` §8 warns the var is
`OPENAI_KEY`. These contradict. **Grep the live file** and report which it actually
is, so `PROVISION_NEW_COUPLE.md` lists the correct secret name. Do not trust either
doc over the deployed bytes.

```bash
grep -n "OPENAI" supabase/functions/telegram-bot/index.ts
```

---

## 7. Build order

Stick to this. Pause for review after each numbered item.

1. **Verify baseline** (§1). If it fails, stop and recover first.
2. **Resolve the OpenAI var name** (§6) — quick grep, feeds the runbook.
3. **Dump and scrub `schema.sql`** (Deliverable 1). Commit.
4. **Edit A** — admin ID → env var. `deno check`. Commit.
5. **Edit B** — recap names dynamic from `users`, read off disk first. `deno check`.
   Commit.
6. **`seed_couple.sql`** (Deliverable 3). Commit.
7. **`PROVISION_NEW_COUPLE.md`** (Deliverable 4). Commit.
8. **Parameterize `deploy.ps1`** (Deliverable 5). Commit.

After 8: report what was built, confirm `deno check` is clean and all spine anchors
are present, and **stop and wait.** Do not deploy. Do not suggest further features.

---

## 8. Do-not list

- **Do not deploy.** That verb is the human's, on their instance first, one at a time.
- **Do not fork `index.ts`.** One canonical file for all couples.
- **Do not reconstruct `index.ts` or `schema.sql` from memory.** Read/dump real
  bytes. Reconstruction is the documented trap.
- **Do not patch the recap prompt from the §4 spec** — read the shipped function off
  disk and patch the real lines.
- **Do not parameterize the language rules or script detection** — the pair is
  identical; they carry over untouched. Only names/roles become dynamic.
- **Do not produce Russian text** in code, prompts, comments, or seed data.
- **Do not build a multi-tenant variant**, RLS-per-couple, or any of the deferred
  ideas. One project per couple is the design.
- **Do not verify model strings from memory** — confirm at the docs URL if you touch
  one (you shouldn't need to).

---

## 9. Key identifiers

- Primary (the couple) project ref: `<project-ref>`
- Edge function: `telegram-bot` (entrypoint `index.ts`)
- the maintainer's Telegram ID (primary admin): `<admin-telegram-id>`
- Baseline tag / ground-truth file: `v-recovered-baseline` /
  `supabase/functions/telegram-bot/index.ts` (~1787 lines)
- Default conversation UUID (reusable per separate DB):
  `00000000-0000-0000-0000-000000000001`
- Deploy command (human-run, from disk):
  `supabase functions deploy telegram-bot --project-ref <ref> --no-verify-jwt`
- Language pair for all instances in scope: English (native: the male partner,
  learning uk) ↔ Ukrainian (native: the female partner, learning en)

---

*End of handoff. First action is one safe, read-only check:* `git tag` *and*
`wc -l supabase/functions/telegram-bot/index.ts` *— confirm the baseline, then
proceed through §7 one step at a time, pausing for review.*
