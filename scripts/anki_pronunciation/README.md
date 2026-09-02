# `scripts/anki_pronunciation/` — pronunciation decks for Anki + AnkiPA

Turns a phrase list into an Anki `.apkg` whose note type is laid out for the
[**AnkiPA**](https://github.com/warleysr/ankipa) add-on, so you press <kbd>Ctrl</kbd>+<kbd>W</kbd>
on a card, read it aloud, and get an Azure pronunciation score — with a reference
recording of the phrase on the same card.

Like everything else in `scripts/`, this is **off to the side**: the bot never imports
it, CI never runs it, and it is not on the deploy path.

---

## Read this first: two things that constrain the design

### 1. Azure cannot score Ukrainian

AnkiPA is a client for Azure AI Speech **Pronunciation Assessment**. Azure supports
34 locales for that feature, and `uk-UA` is **not** one of them — there is no Ukrainian
phoneme model. (`ru-RU` is on the list and is deliberately *not* treated as a substitute:
different phoneme inventory, so the scores would be noise.)

So:

| Deck | Reference audio | <kbd>Ctrl</kbd>+<kbd>W</kbd> scoring |
|---|---|---|
| `Capybara::Pronunciation::English` | a cloned/preset EN voice, or a real recording | ✅ works (`en-US`) |
| `Capybara::Pronunciation::Ukrainian` | Vika's voice | ❌ no Azure model — listen-and-repeat only |

A Ukrainian deck still builds and is still worth studying; the card template just drops
the "Ctrl+W to score" cue and adds an honest note instead. The moment Microsoft adds
`uk-UA`, the only edit needed is `AZURE_ASSESSABLE_LOCALES` in `phrases.py` (and its twin
in `index.ts`).

### 2. OpenAI has no public custom-voice API

OpenAI's `/v1/audio/speech` takes a **preset** voice name. Its voice-cloning work
(Voice Engine) has stayed in limited preview and is not a generally available developer
API — there is no way to pass a trained voice id. The `openai` provider here is therefore
a *preset* fallback, useful for English, and it is **not Vika's voice**.

For a cloned voice, use `elevenlabs` (the default). For the most faithful reference of
all, use `local` and have Vika read the phrases herself.

---

## Install

```bash
python3 -m pip install -r scripts/anki_pronunciation/requirements.txt
```

`genanki` is the only third-party dependency; everything else is stdlib.

## Use

```bash
# 1. In Telegram: /pronounce            (or "/pronounce uk 60")
#    The bot replies with phrases-uk-YYYY-MM-DD.json — download it.

# 2. Build the deck with real audio:
python -m scripts.anki_pronunciation --phrases phrases-uk-2026-09-02.json

# ...or skip Telegram and read the vocabulary table directly:
python -m scripts.anki_pronunciation --lang uk --limit 40

# ...or exercise the whole pipeline with silent audio — no API calls, no cost:
python -m scripts.anki_pronunciation --lang uk --dry-run

# ...or build it and post it straight back to your Telegram chat:
python -m scripts.anki_pronunciation --phrases phrases-uk-2026-09-02.json --send-to <chat_id>
```

Then in Anki: **File → Import** the `.apkg`, and **Tools → AnkiPA Settings →
Card fields: `TargetText`** (leave *Text extraction method* on **Fields only**).

### Options

| Flag | Meaning |
|---|---|
| `--phrases FILE` | phrase list from `/pronounce` (mutually exclusive with `--lang`) |
| `--lang CODE` | read phrases from the `vocabulary` table instead |
| `--limit N` | max cards when reading the database (default 40) |
| `--out FILE` | output path (default `dist/capybara-pronunciation-<lang>-<date>.apkg`) |
| `--provider` | override `CAPYBARA_TTS_PROVIDER` for one run |
| `--voice` | override `CAPYBARA_TTS_VOICE` for one run |
| `--dry-run` | silent placeholder audio; makes **no API calls** |
| `--send-to ID` | upload the finished deck to a Telegram chat |

---

## Configuration

None of this belongs in Supabase function secrets — the bot never runs this code.
Put it in a local `.env` or your shell. See the matching block in `.env.example`.

| Variable | Needed when | Notes |
|---|---|---|
| `CAPYBARA_TTS_PROVIDER` | always | `elevenlabs` \| `openai` \| `azure` \| `local` \| `silent` |
| `CAPYBARA_TTS_VOICE` | all but `local` | ElevenLabs `voice_id`, Azure voice name, or OpenAI preset |
| `CAPYBARA_TTS_MODEL` | optional | sensible default per provider |
| `CAPYBARA_TTS_INSTRUCTIONS` | `openai`, optional | steers tone/pacing; does **not** clone identity |
| `ELEVENLABS_API_KEY` | `elevenlabs` | |
| `OPENAI_API_KEY` | `openai` | the key the bot already uses |
| `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` | `azure` | you need these for AnkiPA anyway |
| `CAPYBARA_RECORDINGS_DIR` | `local` | folder + `manifest.json` mapping phrase → filename |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `--lang` only | not needed with `--phrases` |
| `TELEGRAM_BOT_TOKEN` | `--send-to` only | same token the bot uses |

---

## The AnkiPA field contract

AnkiPA's *Text extraction method* defaults to **Fields only**, and its *Card fields*
setting is a **priority-ordered** list of field names. That dictates the note type:

| # | Field | Example | Why |
|---|---|---|---|
| 1 | `TargetText` | `Доброго ранку, як справи?` | **AnkiPA reads this.** Plain text — no HTML, no `[sound:]` |
| 2 | `ReferenceAudio` | `[sound:capy_pron_55bb4770cc95.mp3]` | kept out of field 1 on purpose |
| 3 | `Translation` | `Good morning, how are you?` | shown on the back |
| 4 | `Language` | `uk-UA` | the locale to set AnkiPA to |
| 5 | `Hint` | `ранок` | the lemma the phrase came from |
| 6 | `SourceId` | `vocab:<uuid>` | stable identity for re-imports |

If the audio tag lived in `TargetText`, AnkiPA would hand the literal string
`[sound:capy_pron_55bb4770cc95.mp3]` to the Azure assessor. That separation is the
whole point of the layout.

The target text sits on the **front** deliberately: this is a pronunciation drill, not
a recall test — you read it aloud, hear the reference, then flip for meaning.

## Regenerating is safe

Three things are deterministic, so rebuilding a deck **updates** it instead of
duplicating it:

- the **note type id** is a fixed constant (a fresh id per run would create a new,
  non-merging note type on every import);
- the **deck id** is derived from the deck name;
- each **note GUID** comes from `SourceId`, and each **media filename** is a digest of
  the phrase text plus the provider identity.

That last digest is also the audio cache key (`.cache/`), so re-running after editing
three phrases re-synthesizes three phrases, not forty. Switching voices changes the
provider identity and correctly invalidates the cache.

## Privacy

Phrase lists are derived from your conversations, and the audio is a real person's
voice. **This repository is public.** `.gitignore` covers `.cache/`, `dist/`, `*.apkg`
and `phrases-*.json`; keep it that way, and don't move deck generation into GitHub
Actions — a public repo's runner logs and artifacts are world-readable.

Using a cloning vendor also means uploading Vika's voice samples to that vendor. The
`local` provider avoids that entirely, and gives you her actual prosody rather than a
model's approximation of it.
