"""Pronunciation-deck generator for capybara-bot.

Turns a phrase list (from `/pronounce` in Telegram, or a hand-written JSON file)
into an Anki `.apkg` whose note type is laid out for the AnkiPA add-on.

Nothing here is imported by the bot (`supabase/functions/telegram-bot/index.ts`)
or the deploy path -- this is an off-to-the-side tool you run by hand, same as
`scripts/model_latency_bench.py`.
"""

__all__ = ["deck", "phrases", "tts"]
