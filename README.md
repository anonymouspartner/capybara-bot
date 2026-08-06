# Capybara

A private **two-language** Telegram translation bot for two people who don't share a
first language — or for one person learning another — that doubles as a bilingual
**language-study corpus** and a searchable, private **conversation-memory** tool (`/recap`).

**Any language pair, not just English↔Ukrainian.** Each instance is configured at setup for
whatever two languages you need — **English, Ukrainian, Spanish, French, German, Italian,
Portuguese, or Polish** out of the box (and easily extended in `index.ts`), in any
combination: English↔Ukrainian, English↔Spanish, Spanish↔French, and so on. Same-script
pairs (e.g. English↔Spanish) are handled as well as cross-script ones. Run it for **two
people**, or **solo** as a personal translator + tutor.

Send the bot a text or voice message and it replies with the translation and (in a
two-person instance) forwards it to the other person — while quietly logging everything as
study material (vocabulary, flashcards) and as a searchable memory. It also relays photos,
videos, files, stickers, GIFs, audio, locations, and contacts (and whole photo albums) to
the other person, translating any caption along the way.

> **Status:** in daily use. Self-hosted, one instance per pair, deployed by hand
> behind a deliberately strict deploy gate.
>
> There is also a **multi-tenant paid build** of the same product in this repo — one bot
> and one database serving many subscribing people, with Stripe billing and self-serve
> onboarding. It is **wired to live Stripe** and taking real cards: two plans
> (**Standard $10/mo, 750 messages**; **Pro $39/mo, 2,500**), a five-message free trial,
> and onboarding that starts inside Telegram rather than with a payment link. Its
> customer-facing copy is translated into all eight registry languages, so a Ukrainian
> speaker signs up in Ukrainian. See [Two products](#two-products) and
> [Localization](#localization).

---

## Contents

- [What it does](#what-it-does)
- [How it works](#how-it-works)
- [The `/recap` memory pipeline](#the-recap-memory-pipeline)
- [The model: one instance per pair](#the-model-one-instance-per-pair)
- [Two products](#two-products)
- [Customer onboarding (paid service)](#customer-onboarding-paid-service)
- [Localization](#localization)
- [Data model](#data-model)
- [Repository map](#repository-map)
- [Prerequisites](#prerequisites)
- [Quick start](#quick-start)
- [Secrets](#secrets-set-on-your-supabase-project)
- [Deploying](#deploying)
- [Verifying what a deploy cannot verify for itself](#verifying-what-a-deploy-cannot-verify-for-itself)
- [Flashcard examples are chosen on evidence](#flashcard-examples-are-chosen-on-evidence)
- [Reproducibility & determinism](#reproducibility--determinism)
- [Bot commands](#bot-commands)
- [Privacy](#privacy)
- [Admin & maintenance commands](#admin--maintenance-commands)
- [Design philosophy](#design-philosophy)
- [Troubleshooting](#troubleshooting)
- [Tech stack](#tech-stack)

---

## What it does

Capybara wears three hats at once. Every message a user sends flows through all of
them in a single turn.

**1. Translator (the configured pair).**
- **Text and voice both work.** Voice notes are transcribed (OpenAI Whisper) and then
  translated; the original audio is archived to private storage.
- **Direction is auto-detected.** Either person can write in either language — including
  the one they're *learning* — and it routes correctly. Cross-script pairs (anything with
  Ukrainian, the only Cyrillic language in the default registry) use a free script check;
  same-script pairs (e.g. English ↔ Spanish) are disambiguated by a cheap Claude Haiku
  classification, defaulting to the sender's language when unsure.
- **Grammatical gender.** For target languages that mark it (Ukrainian, Spanish, French,
  …), translations are told the speaker's and addressee's gender — stored per user
  (`users.gender`) — so past-tense verbs, adjectives, and participles agree with the real
  people. Names come from your `users` rows.
- **Per-language discipline.** Language-specific translation rules live in the language
  registry. For Ukrainian that means standard literary Ukrainian with Russian / surzhyk
  forms rejected even on ambiguous input, and Whisper retried forcing the sender's
  language if it mishears a clip as a neighbouring language.
- **Forwards to the other person.** Each translation (and the original) is relayed to the
  other person automatically, so the bot doubles as the chat channel itself.
- **Any attachment passes through.** Photos, videos and round "video notes",
  files/documents, stickers, GIFs, audio, locations/venues, and contacts are all
  forwarded to the other person by Telegram `file_id` — no size limit, no download. A
  multi-photo **album** is regrouped and delivered as a single album, not a burst of
  separate messages.
- **Captions are translated too.** A caption on a photo/file/GIF/audio is translated for
  the other person and folded into the study corpus, exactly like a text message. (Video
  captions are left as-is.)

**2. Language-study corpus.**
- Every message — and every media **caption** — is **annotated in the background** (Claude)
  into **vocabulary**: lemma, part of speech, gloss, and cross-language translation.
- **Only what something reads.** The schema once also asked for grammar features, idioms
  and register. Those rows were written on every message and consumed by nothing —
  `message_annotations` has exactly one reader, the vocabulary view. Output tokens are
  ~70% of an annotation's cost, so dropping the fields nobody looked at cut the cost per
  message from **$0.015 to $0.007** without changing anything a user sees. The CHECK
  constraint still permits all three types, so restoring one is a prompt change with no
  migration.
- **Two decks of equal weight** — one per language of your pair (e.g. 🇺🇦 Ukrainian and
  🇬🇧 English) — built from the words that actually came up in *your* conversations. Each
  word's gloss is given in the learner's own language.
- `/vocab` surfaces the top still-unlearned words; `/learn` / `/forget` curate a deck;
  `/export` produces a ready-to-import **Anki CSV** with both sub-decks and example
  sentences drawn from real messages.
- **On-demand grammar coaching (`/capybara`).** An opt-in, per-person switch: when it's
  on and you write in the language you're *learning*, the bot checks the message and, if
  something's off, replies **privately to you** with the corrected sentence and a one- or
  two-sentence explanation **in your own language** — a correct sentence just gets a ✓.
  The note is never forwarded to the other person, and your message still translates and
  relays exactly as normal. Each person toggles their own (`/capybara`, `/capybara on|off`);
  it's off by default. Text messages for now.
- **Your mistakes become flashcards.** Every correction is stored and exported by
  `/export` as a third **`Capybara::Grammar`** deck. Where the mistake was a single word,
  the card is **fill-in-the-blank**: the front is the *corrected* sentence with that word
  removed, so you recall the right form rather than re-reading your own error, and the
  wrong form appears on the back as contrast. The blank is captioned with the word's
  dictionary form and meaning, so the card is answerable — you're told *which* word is
  wanted and asked to produce the right **form**, which is the skill being tested:

  ```
  Front:  Я дуже _____ тобою.  (пишатися — to be proud · agreement)
  Back:   пишаюся    …must agree with «я»  (you wrote: пишаємося)
  ```

  Where the mistake wasn't a single word (word order, a missing word), the card falls
  back to showing the whole sentence and its correction. Cards are tagged
  `capybara::grammar::<error type>` — *case*, *aspect*, *gender*, *spelling* and so on —
  so you can build a filtered deck for whichever mistake you make most, and see at a
  glance where your errors actually cluster.

**3. Private shared memory.**
- `/ask <question>` answers questions about your shared history using hybrid
  semantic + keyword search over everything you've said, then a grounded synthesis
  (see [the pipeline below](#the-recap-memory-pipeline)).
- `/note <note>` stores a private note that only *your* `/ask` can retrieve.
- Both have long-form aliases — `/recap` and `/remember` — which keep working. The short
  names are what the `/` menu shows: a command you want to add text to has to be *typed*,
  since tapping a menu entry sends it immediately.
- `/pin` / `/pinned` / `/unpin` mark messages as meaningful (a small recall boost);
  `/reconcile` / `/restore` hide or restore a message from recap results.

## How it works

```
Telegram  ⇄  Supabase Edge Function (Deno, one index.ts)  ⇄  Postgres (Supabase)
                                                            +  Anthropic  (translation, annotation, /recap; Claude Sonnet & Haiku)
                                                            +  OpenAI     (Whisper voice transcription + embeddings)
```

- **One canonical file.** The entire bot is a single ~3,500-line
  `supabase/functions/telegram-bot/index.ts`. It is **instance-agnostic** — nothing about
  a specific pair is in the code; identity lives in secrets and seed data. **Never
  fork it.**
- **Webhook-driven.** Telegram POSTs updates to the function URL; an
  `x-telegram-bot-api-secret-token` header (your `WEBHOOK_SECRET`) gates every call.
  Unauthenticated requests get `401`.
- **Health route.** A side-effect-free `GET …/telegram-bot?health` returns
  `{status, version, adminConfigured}` — used to confirm a deploy actually landed (no
  DB/API/messaging side effects). It sits *before* the secret check so monitors can hit
  it. The paid build adds the configuration a deploy cannot verify for itself:
  `paymentLinksConfigured`, `pricesConfigured`, and the **effective** quotas with a
  `quotaSource` saying whether each came from a secret or a code default.
- **`stripe-billing` reports which Stripe *world* it is in** — `stripeMode`
  (`live` / `test` / `unset` / `unknown`, from the key's public `sk_live_` / `sk_test_`
  prefix) plus `priceTails`, the last six characters of each configured price id. This
  exists because a boolean "is a key present" cannot tell a completed go-live from one
  where nothing was saved: a test key is exactly as present as a live one. A cutover once
  reported fully green while every Stripe secret was still the test value, and a test card
  bought a real-looking subscription. The deploy smoke test now prints the mode and calls
  out live versus test — reported, not asserted, since a test-mode instance is how the
  flow gets rehearsed.
- **Background work.** Annotation and embedding run after the reply is sent, via
  `EdgeRuntime.waitUntil` when available, so the user isn't kept waiting on study-corpus
  bookkeeping.
- **Admin gating.** Maintenance commands (`/diag`, `/backfill*`, `/recap_backfill`) are
  restricted to the `ADMIN_TELEGRAM_ID` user, read once at boot.

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

## The model: one instance per pair

Each instance runs **one isolated Supabase project + one Telegram bot** — not
multi-tenant. Separate projects give perfect data isolation for free. Every instance is
**two people with complementary languages**, chosen at provisioning (native + learning,
plus each person's gender): English ↔ Ukrainian by default, or any pair from the
registry. Whichever user's Telegram ID is set as `ADMIN_TELEGRAM_ID` is the **admin**.

**Self-hosted.** You run your own Supabase project, your own Anthropic/OpenAI keys, your
own bot, and your own deploys. The single canonical `index.ts` is instance-agnostic —
nothing about a specific pair is baked into the code; it all lives in secrets and seed
data. **Within a product, never fork `index.ts`** — one file deploys to every instance of
that product unchanged. (The paid service is a separate product with its own file; see
[Two products](#two-products).)

## Two products

The repo builds **two separate products** from a shared core. They are different
products, not different instances, and each has its own file and its own Supabase project.

| | Personal (`telegram-bot`) | Paid service (`telegram-bot-saas` + `stripe-billing`) |
|---|---|---|
| Tenancy | One couple per project | Many couples, one project |
| Isolation | The project boundary | `tenant_id` on every table, plus a scoped DB client |
| Onboarding | Edit `seed_couple.sql`, run it by hand | Stripe Checkout → Telegram deep link → three taps, one for the partner |
| Billing | None | Stripe subscription (live), two tiers, per-period message quota |
| Plans | n/a | **Standard** $10/mo, 750 messages, annotates what *you* write · **Pro** $39/mo, 2,500, annotates **both** sides |
| Trial | n/a | Five free messages before any card, with a real flashcard on the first |
| Interface language | English | The reader's own, across eight languages |
| Admin | The couple's own `ADMIN_TELEGRAM_ID` | `SUPERADMIN_TELEGRAM_ID` — the operator, never a customer |
| Deploys | `/update` self-deploy from Telegram, or Actions | Actions only — **no `/update`** (one tap would redeploy every tenant) |
| Retention | 30-day PII cron | Kept while the account exists; `/delete_account` removes everything |

The fork was deliberate. Roughly 90% is shared core — translation, annotation, `/recap`,
the language registry — so **a fix to one is not a fix to the other**; it has to be
ported, and the commit should say which file it came from.

The multi-tenant build's whole safety story is that scoping is structural rather than
remembered: the raw Supabase client is named `dbAdmin` and every ordinary query goes
through `tenantDb`, which adds the tenant filter to reads, stamps it into writes, and
passes it to every RPC. Crossing the tenant boundary has to be spelled out, and the two
places that legitimately do are commented as such. The `SECURITY DEFINER` SQL functions
take a tenant argument too — scoping the TypeScript alone would not have reached them.

Wiring up the paid service (BotFather, Stripe products, Payment Links, secrets, deploy
order, an end-to-end test) is documented in **`LAUNCH_SAAS.md`**.

## Customer onboarding (paid service)

Self-serve end to end — no website, no email, no manual provisioning step. **It starts in
Telegram**, not with a payment link: a stranger who messages the bot gets an explanation
and buttons, and can try it before paying. Handing out a bare Stripe link asked people to
buy something they had never seen.

```
stranger messages the bot  →  intro + plan buttons, in THEIR language
                                      │
                     ┌────────────────┴────────────────┐
                     ▼                                 ▼
            "Try it free"                        Standard / Pro
       5 messages, real translation              Stripe Checkout
       + a real flashcard on the 1st                   │
                     │                                 ▼
                     └──── paywall ──────►  success_url hits stripe-billing
                                                       │  verifies session, creates tenant
                                                       ▼
                                            302 → t.me/<bot>?start=<code>
                                                       │  Telegram sends "/start <code>"
                                                       ▼
                                  3 taps: native language, learning language, he/she
                                                       │
                                                       ▼
                                        invite link for their partner
                                                       │  partner taps, picks he/she
                                                       ▼
                                            both set up, code retired
```

**The trial** is five messages, tracked in `trial_users` by `telegram_id`, with a daily cap
and a length limit. It runs the real translation path and shows a real flashcard on the
first message, so what is being demonstrated is the product rather than a description of
it. Trial messages are never written to `messages` — a trial is not a corpus, and someone
who never subscribes leaves nothing behind. The gate **fails closed**: if the database
cannot be reached the message is refused rather than served free.

**Leaving is possible for both seats.** The partner can `/leave` under their own steam;
the owner can remove and replace them from `/management`. Both run the same SQL function,
because the data work is identical and two copies would drift — silently, since one path
forgetting to clear private notes leaves them readable by whoever inherits the account.

It is a *soft* leave. `messages.sender_id` is `ON DELETE RESTRICT`, which is the schema
saying a shared conversation is not one participant's to erase: the other person paid for
that corpus and `/recap` is grounded in it. So access is revoked and what is genuinely
personal goes — decks, notes, corrections — while the history stays with the account that
owns it. `users.telegram_id` is unique only among *active* members, so leaving does not
lock someone out of ever using the product again with somebody else.

**Plans differ in annotation depth**, which is the thing a customer actually feels:
Standard annotates the side *you wrote*, Pro annotates **both** — so on Pro you also study
your partner's language from their own words, not only from your attempts at it. It is a
single predicate (`annotatesBothSides`) read from the plan carried out of the quota gate.

**Commands that cost nothing to serve don't consume quota.** `/help`, `/vocab`, `/learn`,
`/forget` and the pin commands are pure database reads; billing a message for them charges
the customer for our disk, and the people who pay that tax are the ones who just subscribed
and are still exploring. `/recap` and `/note` stay metered — one synthesises, the other
classifies and embeds.

**Payment → tenant** (`stripe-billing`, the `GET ?session_id=` route):

1. The Checkout session is retrieved from Stripe and must be `mode: "subscription"` **and**
   carry a price matching `STRIPE_PRICE_STANDARD` or `STRIPE_PRICE_ULTIMATE`. There is
   deliberately **no fallback plan** — an unrelated paid session provisions nothing.
2. Provisioning is **idempotent**, keyed on `stripe_checkout_session_id`: refreshing the
   success page returns the same code rather than minting a second tenant, and a unique
   violation re-reads instead of failing.
3. The tenant row is written with its plan, quota, Stripe ids, a random `pairing_code` and
   a **14-day** `pairing_code_expires_at`, then the customer is 302'd into Telegram.

This runs on the **redirect, not the webhook**. Stripe fires both simultaneously with no
ordering guarantee, so provisioning on the webhook would sometimes redirect a paying
customer to a code that does not exist yet.

**The in-chat wizard** (`telegram-bot-saas`): the payer picks their native language, then
the language they're learning (their own is excluded from the second picker), then how the
bot should refer to them. That last question explains itself in the copy — gendered verb
and adjective agreement is not cosmetic, and a question that looks decorative gets skipped.
The partner opens the invite link and answers **one** question: the pair is read off the
payer's row and inverted, so it cannot contradict what was already chosen.

Three things hold it together:

- **Every step re-validates** `claim_tenant_seat(<code>)` against the database — on the
  `/start` and again on each button tap. Nothing is trusted from the callback payload;
  Telegram's own clients only send `callback_data` the bot issued, but MTProto's
  `getBotCallbackAnswer` accepts an arbitrary one.
- **Seats gate the flow.** Owner steps require zero seats taken, the partner step exactly
  one, and `owner_user_id` is write-once at the database. Ownership is the authority behind
  cancelling the card and deleting the couple's corpus, so it must not be reachable by any
  route that isn't deliberate — including the honest race where the code reaches the
  partner before the payer has finished.
- **Refusals are specific** — expired, seats full, subscription inactive, unrecognised
  code, or "this Telegram account is already linked to a subscription" — because each is a
  different real situation with a different fix.

The payer can use the bot **solo** in the gap before their partner joins. Once the second
seat is filled the `pairing_code` is cleared, so a forwarded link is inert from then on,
and the payer is told their partner arrived.

## Localization

The paid build talks to each person **in their own language** — all eight in the registry,
across every customer-facing surface: the intro a stranger sees, the trial, onboarding,
`/start`, `/help`, `/management`, quota warnings, the study commands, the grammar assistant,
media and voice errors, the account-deletion goodbyes — and the **"/" command menu itself**.
**185 keys x 8 languages**, in `supabase/functions/telegram-bot-saas/strings.ts`.

The menu was the last holdout and the most visible one: its descriptions were hardcoded
English literals and `setMyCommands` took no `language_code`, so the list of what the
product does could never render in anything else, however carefully every message body had
been translated. Telegram picks a set by matching `language_code` against the reader's
**Telegram app language** — not the language they chose here — so a chat-scoped list in
their own choice is registered too, lazily, once per customer per warm instance.

This existed because of a real signup: a Ukrainian speaker, with Telegram in Ukrainian,
was offered a language picker with eight options and then addressed in English whichever
one she picked. On a product whose whole claim is "write in your language and be read in
yours", opening in the wrong language is not cosmetic.

**Resolving the reader's language** — `viewerLang(from, user?, trialRow?)`, most
authoritative first:

1. A registered user's `native_language`. They chose it.
2. A trial user's chosen pair.
3. Telegram's own `from.language_code`, normalised (`uk-UA` → `uk`, `pt-BR` → `pt`) and
   kept only if it is one of the eight. **This is what fixes the first screen** — Telegram
   sends it on every update, so a stranger's very first message is already in their
   language, before they have told the bot anything.
4. English.

Two details that are easy to get backwards:

- **Messages addressed to the *other* person resolve from that person's row**, not the
  sender's. A partner-forward, the "your partner joined" greeting, and the deletion notice
  are all read by someone other than whoever triggered them. Getting this wrong is
  invisible in a same-language test pair and wrong for every real one.
- **Deck ownership is two keys, not an interpolated possessive.** English forms one by
  appending `'s` to any noun; Ukrainian and Polish inflect the noun, German and Italian
  restructure the phrase. `"Added to {owner}'s deck"` is correct in exactly one of the
  eight languages, so own-deck and partner-deck are separate strings throughout.

**Provenance, stated plainly.** English and Ukrainian are reviewed. **Spanish, French,
German, Italian, Portuguese and Polish are machine-written and unreviewed** — nobody who
speaks them has read them. That is recorded in the file's header rather than glossed over,
because this product sells language quality, and a *missing* translation degrades safely
to English while a *wrong* one does not announce itself.

The catalog is covered by tests that exist because each caught a real bug: every key has
all eight languages; no entry renders empty or leaks `undefined`; every interpolating key
is exercised with real variables; no key is defined twice (`Object.keys` dedupes, so a
duplicate silently shadows the earlier definition); and no entry contains CJK, kana or
hangul — a stray Chinese glyph reached the French copy twice.

**The single-tenant build is localized too, in two languages.** It used to say here that
it deliberately was not — that it served one pair fluent in its English UI. That reasoning
did not survive contact with the pair: it had run an English interface at a Ukrainian
native speaker for a year, which is the same defect this section describes, just with an
audience of one. It now carries **128 keys x 2 languages** in
`supabase/functions/telegram-bot/strings.ts`.

Two, not eight, and that is the actual difference between the builds: the paid service
sells to strangers whose language is unknown until they arrive, so it must carry every
language it offers. A personal instance is provisioned by hand for a known pair. Adding a
language there is a column, not a rewrite.

## Data model

The initial migration (`supabase/migrations/20260601000000_init_schema.sql`) builds the
core of the database from zero — **10 tables, 7 application functions**, and the required
extensions (`vector`, `pg_trgm`, `uuid-ossp`); later migrations add a few more (including
`pending_media_group`, below). Row-level security is enabled on every table; the bot
connects as the service role.

| Table | Holds |
|---|---|
| `users` | The two people — Telegram ID, display name, native + learning language, gender, and a per-person grammar-assistant toggle. |
| `conversations` | The single default conversation every message is filed under. |
| `messages` | Every text/voice message and media caption: original + translation, languages, input type, voice metadata. |
| `message_annotations` | Per-message vocabulary / grammar / idiom / register findings. |
| `vocabulary` | Deduplicated lemmas with gloss, part of speech, cross-language translation, occurrence count. |
| `flashcards` | A user's chosen study cards (vocabulary + example message). |
| `notes` | `/remember` notes (private to their author). |
| `grammar_corrections` | Mistakes the `/capybara` assistant caught: the fix, the explanation, the wrong and corrected forms, that word's dictionary form and meaning, and the error category (added by later migrations). |
| `message_pins` | Pinned (meaningful) messages. |
| `message_reconciles` | Messages excluded from `/recap`. |
| `recap_embeddings` | Vector + text content for messages and notes, powering `/recap`. |
| `pending_media_group` | Short-lived buffer that regroups the items of a photo album before forwarding (added by a later migration). |

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
| `supabase/functions/telegram-bot/index.ts` | The entire personal bot — one canonical file. |
| `supabase/functions/telegram-bot-saas/index.ts` | The multi-tenant paid build (tenant scoping, onboarding, quotas). |
| `supabase/functions/telegram-bot-saas/strings.ts` | Every customer-facing string, in eight languages. Imported by `index.ts`; ships in the same deploy. |
| `supabase/functions/stripe-billing/index.ts` | Paid build only: Stripe webhook + the Checkout claim route that provisions a tenant. |
| `setup.ts` | **Guided setup wizard** — `deno run -A setup.ts` provisions a whole instance end to end. |
| `start.sh` | Interactive start-up menu for a freshly cloned repo (prereqs + common tasks). |
| `supabase/migrations/` | Base DB migrations, applied to **both** products; the init migration builds everything (10 tables, 7 functions, extensions). |
| `supabase/migrations-saas/` | Multi-tenant migrations — commercial project **only**. |
| `seed_couple.sql` | Seeds your two users + the default conversation. |
| `storage_setup.sql` | Creates the private `voice-messages` Storage bucket (bucket-as-code). |
| **`PROVISION_NEW_COUPLE.md`** | **The setup runbook — start here.** |
| **`LAUNCH_SAAS.md`** | **The paid-service runbook** — BotFather, Stripe, secrets, deploy order. |
| `.env.example` | Template for the five function secrets (copy to `.env`). |
| `.github/workflows/deploy.yml` | **Primary deploy path:** CI, manual (`workflow_dispatch`), gated deploy from GitHub. |
| `.github/workflows/check.yml` | CI: runs the pre-deploy gate on every push/PR (never deploys). |
| `deploy.ps1` / `predeploy-check.ps1` | Fallback deploy spine: gate → CLI-from-disk deploy → health smoke. (Windows PowerShell.) |
| `deploy.sh` / `predeploy-check.sh` | Same fallback spine, ported to bash (macOS/Linux). |
| `provision.sh` | Scripts the automatable provisioning glue (secrets, webhook, health). |
| `supabase/functions/telegram-bot/strings.ts` | The personal build's copy, in English and Ukrainian. |
| `tests/` | Guard tests for both builds, run by CI on every push (`deno test --allow-read tests/`). |
| `bootstrap-dev.sh` | Restores a runnable toolchain (deno + the gate + the tests) in one command. |
| `deno.json` | Deno tasks (`check`, `lock`) + lockfile config for deterministic builds. |
| `.devcontainer/` | Codespaces config (Deno + Supabase CLI) for laptop-free setup. |
| `docs/` | Background & design history (deploy-safety + reproducibility handoffs). |
| `CLAUDE.md` | Working guidance for Claude Code in this repo (hard rules, deploy discipline). |

## Prerequisites

- A **Supabase** account + the **Supabase CLI** (`supabase`).
- An **Anthropic** API key and an **OpenAI** API key (each instance uses its own).
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
creates the bucket, seeds the two users, sets secrets, **optionally wires up one-tap `/update`
self-deploy**, deploys, sets the webhook, smoke-tests). It's idempotent and resumable.

**Prefer a local machine?** Install **Deno** + the **Supabase CLI** and run the same
`deno run -A setup.ts`. Or do it by hand — follow
**[`PROVISION_NEW_COUPLE.md`](PROVISION_NEW_COUPLE.md)** end to end, or run **`./start.sh`**
for a menu. In brief:

1. Create the bot (**@BotFather**) → bot token.
2. Both people get their Telegram IDs (e.g. via **@userinfobot**).
3. Create a Supabase project — **eu-west-1 / Postgres 17**.
4. Apply the database migration — `supabase db push` (or paste the init migration into the Dashboard SQL editor).
5. Create a **private storage bucket named `voice-messages`** (for voice-note audio).
6. Set the function secrets (below) — **`ADMIN_TELEGRAM_ID` before you deploy.**
7. Deploy (see below).
8. Seed with **`seed_couple.sql`**.
9. Set the Telegram webhook to the function URL with `secret_token = WEBHOOK_SECRET`.
10. Smoke-test (`/help`, a translation each way, `/remember` → `/recap`, `/pin`/`/pinned`).
11. _(Optional)_ Enable one-tap **`/update`** self-deploy from Telegram — see the
    **Self-deploy from Telegram (`/update`)** section below.

> New instances start with an **empty corpus**, so the `/backfill*` commands don't apply.

## Secrets (set on your Supabase project)

| Secret | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | your bot token from @BotFather |
| `WEBHOOK_SECRET` | freshly generated, e.g. `openssl rand -hex 32` |
| `ANTHROPIC_API_KEY` | your Anthropic key |
| `OPENAI_API_KEY` | your OpenAI key (Whisper + embeddings) |
| `ADMIN_TELEGRAM_ID` | the **admin** user's numeric Telegram ID |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are **auto-injected** by Supabase — don't set them.

## Deploying

**Primary: deploy from GitHub Actions (no laptop needed).** **Actions → deploy → Run
workflow** (type `deploy` to confirm) runs the gate, deploys the committed file, and
smoke-tests the health route. It runs **only** on manual dispatch — never on push/PR — so
it stays safe on a public repo. It needs two repo secrets (Settings → Secrets and
variables → Actions): `SUPABASE_ACCESS_TOKEN` (from supabase.com/dashboard/account/tokens)
and `SUPABASE_PROJECT_REF`. The bot's function secrets stay on Supabase — a code deploy
never touches them. (The `setup.ts` wizard can set these two repo secrets — and the rest of
`/update` self-deploy — for you when `gh` is installed; it's an optional step in the wizard.)

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

> **Single-tenant build only.** `/update` is deliberately absent from `telegram-bot-saas`,
> where one tap would redeploy the function serving every subscribing couple at once. The
> paid service deploys through the Actions workflow and nothing else, and sets no `GITHUB_*`
> secrets.

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

## Verifying what a deploy cannot verify for itself

A deploy proves the function boots. It cannot prove the bot is reachable, or that the
things it configured on Telegram's side actually took. Several of those failures are
**silent by construction**, so the health route reads them back from Telegram rather than
reporting what the bot believes it sent.

| Probe | Answers |
|---|---|
| `?health` | Function up, version, admin secret present. No DB, no API — stays green when an upstream is down. |
| `?seed` | Is there anything to serve (users, or tenants on the paid build). |
| `?commands` | What Telegram **holds** for the "/" menu: the fallback set and each language, with a sample line. |
| `?webhook` | `allowedUpdates`, `deliversCallbacks`, pending count, last delivery error. |

Each is opt-in, because each costs an external call and the plain probe must stay
dependency-free for the deploy smoke test.

**Why read back rather than report a flag.** `setMyCommands` runs as background work: if it
fails, the webhook still returns 200 and the request log is clean. A flag saying "we
registered the menu" would go green on exactly the failure it exists to catch. The same
reasoning produced `stripeMode` on the billing function, after a Stripe cutover reported
fully green while every secret was still a test value.

**A sample line, not just a count.** A count proves a list exists; only reading one line
proves it is in the right *language* — and on an eight-language build, a customer served
the wrong one cannot tell you which set is missing.

**`allowed_updates` is sticky, and this is the trap.** `setWebhook`'s contract is *"If not
specified, the previous setting will be used"* — omitting it does **not** mean "use the
default", it preserves whatever the webhook already had. A webhook narrowed to
`["message"]` once stays narrow through every later registration, and Telegram then simply
stops delivering `callback_query` with no error, no retry and no request. From inside the
bot, "nobody tapped anything" and "taps are not being delivered" are identical.

That is not hypothetical: it silently disabled every inline button on the personal instance
— including the deploy button — and went unnoticed because the symptom is nothing
happening. `provision.sh` and `setup.ts` now pass the list explicitly so a new instance
cannot start in that state, and both builds widen it at boot if they find it narrow,
reusing the URL Telegram already holds and re-sending `secret_token` (which `setWebhook`
drops when the parameter is omitted).

**The paid build's `?commands` deliberately reports less.** The personal one lists its two
per-chat menus; on the paid service the number of chat scopes *is* the customer count, and
this route is unauthenticated by necessity — the deploy smoke test calls it before anything
is signed in. A health endpoint is not the place to publish that.

## Flashcard examples are chosen on evidence

Each card shows a real sentence from your own conversation. Choosing that sentence used to
mean "the first message this word ever appeared in", with nothing checking that the card's
own taught translation survives into it. It frequently does not, because good translation
is idiomatic: *"Enjoy work"* becomes «Гарної роботи», so a card teaching *насолоджуватися*
would display a sentence that does not contain the word. The learner is tested on one thing
and shown evidence for another.

Measured on a live 466-card deck before anything was changed: ~19% failed a mechanical
check, and hand-classifying a sample put the real rate near **12%**. **66.5% of all
examples came from the corpus's first week** — vocabulary accumulates fastest at the start,
so "first seen" anchors the whole deck to the earliest days, exactly when messages are
shortest and most idiomatic.

`pick_example_messages()` now takes the shortest message between 40 and 250 characters
whose lemma side contains the word **and** whose other side contains its taught
translation. Checking both sides is the point. The 40-character floor is not arbitrary: at
25, the best match for `сьогодні` was a message with the word misspelt.

Matching is deliberately crude — prefix stems over apostrophe-folded text — and falls back
to the old behaviour when it finds nothing, so it can only improve a card or leave it
alone. Trigram similarity was tried and rejected: on a hand-labelled set the score ranges
overlapped (a wrong pair at 0.429 sat above a right pair at 0.375), so no threshold
separates them. Detecting an inflected Slavic word by string similarity is not reliably
solvable that way; a lemmatiser is the real upgrade.

On the paid build the same function takes a tenant and scopes every read to it. That is not
bookkeeping: unscoped, a customer's flashcard could draw its example sentence from another
couple's private conversation — and it would look like the feature working.

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

Send **`/help`** in the bot for the full, language-aware list — the everyday commands
also appear in Telegram's **`/` menu** (admin commands show only to the admin). Highlights:

| Command | Does |
|---|---|
| *(any text/voice)* | Translate between your two languages and forward to the other person (solo: just translate) |
| *(photo / video / file / sticker / GIF / audio / location / contact / album)* | Forward to the other person; a caption is translated and added to your corpus (video captions kept as-is) |
| `/ask <question>` | Ask your shared conversation history (private to you). Long form: `/recap` |
| `/note <note>` | Add a private note that `/ask` can find. Long form: `/remember` |
| `/pin` · `/pinned` · `/unpin` | Mark / list / unmark meaningful messages (reply to one) |
| `/reconcile` · `/restore` | Hide / unhide a message from `/recap` (reply to one) |
| `/vocab` | Top still-unlearned words in each deck |
| `/learn <word>` · `/learn top N [uk\|en]` | Add a word (or the top N) to a deck |
| `/forget <word>` | Remove a word from the matching deck |
| `/export` | Export vocabulary decks **and your grammar corrections** as a single Anki CSV |
| `/capybara` · `/capybara on\|off` | Toggle a private grammar coach for your learning language (per person, off by default) |
| `/help` · `/start` | Help / welcome |

> `/recap` has a 24-hour cooling-off on **messages** (recent messages don't surface),
> but `/remember` **notes** are searchable immediately.

## Privacy

- **Per-instance isolation.** Each instance is a separate Supabase project, database, and
  bot — there is no shared infrastructure and no cross-instance data path.
- **Private by default.** The storage bucket is private; the webhook is secret-gated;
  RLS is on for every table and the bot speaks only as the service role.
- **Notes are personal.** `/remember` notes are only ever returned to their author's
  own `/recap`. Messages are shared between the two people by design (it's one
  conversation), but `/recap` answers are generated per-asker.
- **Your keys, your data.** You bring your own Anthropic and OpenAI keys; nothing is
  routed through a shared service.

## Admin & maintenance commands

These are gated to the admin user and exist mainly for **migrating
an existing corpus** — new instances can ignore them.

| Command | Does |
|---|---|
| `/diag` | Ping Anthropic, Whisper, and embeddings; report recent DB activity |
| `/backfill` | Annotate one batch of un-annotated messages |
| `/backfill_translations` | Fill in missing cross-language lemma translations, one batch |
| `/backfill_senses` | Re-derive flashcard translations so each matches its example sentence |
| `/backfill_grammar` | Fill in card fields (blank target, dictionary form, meaning) for older corrections |
| `/recap_backfill` | Embed one batch of existing messages for `/recap` |
| `/annotate_ab` | Compare annotation models on recent messages — reports quality, tokens, cost. Writes nothing |

Each backfill command is **idempotent and batched** — run it repeatedly until it reports
zero remaining.

### On the paid service

The same commands exist in `telegram-bot-saas`, gated to `SUPERADMIN_TELEGRAM_ID` — the
operator of the service, never a customer — with two differences worth knowing:

- **The grinds run against the operator's own tenant.** They go through the tenant-scoped
  client like everything else, so there is no in-chat lever to backfill a *customer's*
  corpus; that is a SQL job against the commercial project.
- **`/tenants` is the one command that crosses tenants.** It reads the `tenants` table and
  seat counts only — never message content — and reports signups needing attention first
  (paid but never set up, waiting on a partner, over quota, failed payment), then
  subscription and plan counts, then usage and estimated API spend. Revenue is deliberately
  absent: it lives in Stripe, and a copy here would only go stale.

The operator's own messages **bypass the subscription and quota gate**, which is why their
`messages_used` stays at zero.

Denials are uniform — a flat *"Not authorized."* that says nothing about whether the
command exists, so a customer probing operator commands learns nothing.

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
  gated shut until you do. On the paid build the same flag reads `SUPERADMIN_TELEGRAM_ID`,
  falling back to `ADMIN_TELEGRAM_ID` — so renaming the secret is safe, but a typo in the
  numeric id turns every operator command into *"Not authorized."* while the health route
  still reports `true`. `/tenants` is the real test.
- **Bot doesn't recognize a user** — an unregistered Telegram user gets a reply with
  their own numeric ID. Put both IDs in `seed_couple.sql` and run it.
- **A freshly-sent message doesn't appear in `/recap`** — expected: messages have a
  24-hour cooling-off. Use a `/remember` note to test recap immediately.
- **Voice transcription works but no audio is archived** — the `voice-messages` storage
  bucket is missing; the upload error is logged and ignored. Create the bucket.
- **`getWebhookInfo` shows a `last_error_message`** — usually a wrong webhook URL or a
  `secret_token` that doesn't match `WEBHOOK_SECRET`. Re-run `setWebhook`.
- **Inline buttons do nothing at all** — no reply, no error, nothing in the logs. Check
  `?health&webhook`: if `deliversCallbacks` is `false`, Telegram is dropping every
  `callback_query` before it reaches the bot, because `allowed_updates` was narrowed at
  some point and is sticky. Both builds self-heal at boot; sending the bot any message
  triggers it. See *Verifying what a deploy cannot verify for itself*.
- **The "/" menu is in the wrong language** — Telegram matches its command sets against
  the reader's **Telegram app language**, not the language they chose in the bot. Check
  `?health&commands` to confirm the set for that language is registered; if it is, the
  chat-scoped list (which follows their chosen language and outranks the default) lands on
  their next message, and their client may need a restart to refresh.
- **Deploy aborted by the gate** — `predeploy-check.ps1` failed (`deno check`, line
  count, or missing anchors). Fix the reported issue; nothing was deployed.

## Tech stack

- **Runtime:** Deno (Supabase Edge Functions).
- **Database:** Postgres (Supabase) with `pgvector`, `pg_trgm`, `uuid-ossp`.
- **AI:** Anthropic Claude (Sonnet for translation/annotation/recap synthesis, Haiku for
  query parsing); OpenAI Whisper (voice) and `text-embedding-3-small` (embeddings).
- **Messaging:** Telegram Bot API (webhook).
- **Billing (paid build):** Stripe — Payment Links, Checkout, subscriptions and webhooks,
  hit over plain `fetch` with signature verification in ~20 lines of WebCrypto. No SDK, so
  the one function that decides whether paying customers can start using the product has
  no CDN dependency.
- **Tooling:** Supabase CLI, GitHub Actions (primary deploy path), a PowerShell and bash
  deploy spine for offline use, Git.

**Cost per message: ~$0.007** on the current build, down from $0.015 — measured against
real spend rather than modelled. That is what makes Standard viable at $10 for 750
messages; both plans are profitable at the cap, not merely on average.
</content>
</invoke>
