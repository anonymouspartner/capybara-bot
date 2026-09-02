# Privacy Policy

**Capybara Bot** — effective date: 2026-08-14

---

## 1. Who this policy applies to

This policy applies to every person who uses an instance of Capybara Bot ("the bot"), including both partners in a couple and any person who sets up ("deploys") an instance for themselves.

---

## 2. The self-hosted model: your data never touches our servers

Capybara is **self-hosted** software, not a hosted service. There is no central server, no shared database, and no data pipeline operated by the authors of this repository.

When you deploy an instance you provision:

- your own **Supabase project** (database, storage, and edge function runtime);
- your own **Anthropic API key**;
- your own **OpenAI API key**;
- your own **Telegram bot** (registered via @BotFather).

All data — messages, voice recordings, vocabulary, notes, memory embeddings, and metadata — is written exclusively to **your Supabase project**. The authors of this repository have no access to it, no visibility into it, and no ability to retrieve it. There is no telemetry, no analytics, and no logging to any service controlled by anyone other than you.

---

## 3. What data the bot stores

When you or your partner send a message to the bot, the following may be stored in **your own Supabase database**:

| Data | Where it goes |
|---|---|
| Message text (original and translation) | Your Supabase `messages` table |
| Voice note audio files | Your private Supabase Storage bucket (`voice-messages`) |
| Voice transcriptions | Your Supabase `messages` table |
| Videos and video notes | Forwarded via Telegram `file_id`; not archived |
| Vocabulary and grammar annotations | Your Supabase `vocabulary` / `message_annotations` tables |
| Study flashcards | Your Supabase `flashcards` table |
| Personal notes (`/remember`) | Your Supabase `notes` table (visible only to you) |
| Vector embeddings (for `/recap` search) | Your Supabase `recap_embeddings` table |
| Pinned / reconciled message flags | Your Supabase `message_pins` / `message_reconciles` tables |

All of these records live exclusively in the database you own and control. You can read, export, or delete any of them at any time using the Supabase Dashboard or standard SQL.

---

## 4. Third-party API calls — your keys, your relationship

The bot makes API calls to three external services in the course of normal operation. In every case **the API key used is your own**, which means you are the direct customer of each service — not a recipient of data forwarded by someone else.

| Service | Purpose | Your relationship |
|---|---|---|
| **Anthropic** (Claude) | Translation, annotation, `/recap` synthesis | You are the API key holder and account holder. Data is sent under your Anthropic account's terms. |
| **OpenAI** (Whisper + embeddings) | Voice transcription, semantic search embeddings | You are the API key holder and account holder. Data is sent under your OpenAI account's terms. |
| **Telegram** | Message delivery and webhook | You are the bot owner registered with @BotFather. |

Two further services are contacted **only when you explicitly invoke them**, never during normal message handling:

| Service | Purpose | Your relationship |
|---|---|---|
| **GitHub** | `/bug` files an issue on the repository named by your own `GITHUB_REPO` secret, using your own token | You are the token holder and the repository's owner or collaborator. |
| **A text-to-speech provider** (ElevenLabs, Azure Speech, or OpenAI TTS — whichever you configure) | The pronunciation-deck generator sends it the phrases you are practising, and it returns the reference audio | You are the API key holder and account holder. |

### The pronunciation-deck generator

`scripts/anki_pronunciation/` is a **local tool you run by hand**, not part of the bot. The bot's `/pronounce` command only assembles a phrase list and sends it to you in Telegram; nothing leaves your instance at that point.

When you then build a deck, two kinds of data can leave:

- **The phrases themselves** — drawn from your vocabulary, which is derived from your conversations — are sent to whichever TTS provider you configure, so it can speak them.
- **A voiceprint**, if you use a *cloned* voice. Training a clone means uploading recordings of a real person's speech to that vendor. That is a decision about **someone else's** voice: if the voice is your partner's, it is theirs to agree to, and a setting in a config file is not consent.

The `local` provider avoids both concerns for the audio: it reads recordings from a folder on your own machine and contacts no vendor at all. It is also the most faithful reference, being an actual person rather than a model's approximation of one.

Generated decks, cached audio, and exported phrase lists are all gitignored, because the working repository is public.

`/bug` sends **only the text you type in that command** — no messages, no translations, no vocabulary, no notes. It is the one path by which text you enter can leave your instance for a destination other than the three services above, and an issue is subject to the **visibility of that repository**: on a public repo it is world-readable.

For that reason `/bug` is **restricted to the admin** (the `ADMIN_TELEGRAM_ID` user), who owns the repository and can judge what belongs in a public issue. The other partner cannot file one; they are told to pass the problem to the admin instead. The command is inert unless `GITHUB_REPO` and an issue-capable token are both configured.

No data is sent to any service using a key, account, or intermediary controlled by the authors of this repository.

You should review the privacy policies and data processing agreements of Anthropic, OpenAI, and Telegram — of GitHub, if you enable `/bug` — and of your chosen text-to-speech provider, if you build pronunciation decks — to understand how those services handle data sent to them directly under your account.

---

## 5. No data sharing, sale, or disclosure

The authors of this repository:

- **do not receive** any data from any instance of the bot;
- **do not share** any data with any third party;
- **do not sell** any data;
- **do not have** any mechanism by which they could disclose data, because they have no access to it.

As the person who deployed the bot, you are the sole data controller for your instance. No data from your instance is shared with any other party except as described in Section 4 (your own API calls) and Section 6 (between the two partners, by design).

---

## 6. Data shared between the two partners

The bot is designed to serve a couple. By design:

- Each message one partner sends is **translated and forwarded** to the other partner.
- Messages are stored in a **shared conversation** visible to both partners via `/recap`.
- **Personal notes** created with `/remember` are **private** — they are only ever returned to the person who created them, even within `/recap`.

If you are the person who set up the bot, you are responsible for ensuring your partner understands what data the bot stores and forwards.

---

## 7. Your rights and control over your data

Because you control the Supabase project, you have full authority over your data:

- **Access:** Read any table directly via the Supabase Dashboard or SQL editor.
- **Export:** Run SQL queries to export data in any format you choose.
- **Deletion:** Delete individual records, entire tables, or the entire project at any time.
- **Portability:** The `/export` command produces an Anki CSV of your vocabulary decks. All other data is in standard Postgres tables.
- **Correction:** You can update any record directly in the database.

There is no need to make a request to anyone to exercise these rights — you already have direct access.

---

## 8. Data retention

**Data is retained until you delete it.** There is no automatic expiry and no scheduled deletion job. Everything listed in Section 3 — message text, voice recordings and transcriptions, personal notes, annotations, embeddings, pins, vocabulary and flashcards — stays in your Supabase project indefinitely, because the bot's `/recap`, `/pinned` and vocabulary features are built on that accumulated history.

Earlier versions of this software installed a `pg_cron` job that deleted message-level data 30 days after it was created. **That job has been removed.** If your instance was provisioned before this change, applying the current migrations unschedules the job and drops its deletion function; until you apply them, your instance continues to expire data on the old 30-day schedule.

Deletion is entirely in your hands, as described in Section 7. You own the Supabase project, so you can at any time:

- delete individual messages, notes, or voice files;
- delete whole tables, or empty the `voice-messages` storage bucket;
- delete the entire Supabase project, which destroys all of it at once.

If you prefer an automatic retention window, you can reinstate one yourself: the removed job is preserved in the repository's migration history (`supabase/migrations/20260626000000_pii_retention_30days.sql`) and can be re-applied, with the retention period set to any number of days you choose.

Because data is now kept indefinitely, both partners should understand that messages sent through the bot remain searchable via `/recap` for as long as the instance exists. If you set up the instance, you are responsible for making sure your partner knows this (see Section 6).

---

## 9. Security

Security of your instance is your responsibility. The bot is designed with security in mind:

- The Telegram webhook is secret-gated (`WEBHOOK_SECRET`).
- The Supabase storage bucket is private.
- Row-level security is enabled on every database table.
- All credentials are stored as Supabase function secrets, never in code or in this repository.

You are responsible for keeping your API keys, project credentials, and Telegram bot token secure.

---

## 10. Changes to this policy

This policy reflects the design of the software at the date shown above. If the software changes in a way that affects data handling, this document will be updated. Because this is self-hosted software, updates to this policy do not affect your running instance unless you choose to update your deployment.

---

## 11. Contact

This software is provided as open-source under the terms of its repository licence. If you have questions about how a specific deployed instance handles your data, contact the person who set up that instance — they are the data controller for it.

---

*This policy was written for the Capybara Bot open-source project. It describes the data practices of the software itself. It is not a substitute for legal advice. If you are subject to GDPR, CCPA, or another data protection regime, consult a lawyer about your obligations as a data controller.*
