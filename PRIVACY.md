# Privacy Policy

**Capybara Bot** — effective date: 2026-06-26

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

No data is sent to any service using a key, account, or intermediary controlled by the authors of this repository.

You should review the privacy policies and data processing agreements of Anthropic, OpenAI, and Telegram to understand how those services handle data sent to them directly under your account.

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

Data is retained for as long as you choose to keep your Supabase project running. You are responsible for your own retention and deletion practices. The authors of this repository impose no retention period and cannot enforce one.

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
