"""CLI: phrases in, .apkg out.

    # from a phrases.json the bot's /pronounce sent you
    python -m scripts.anki_pronunciation --phrases phrases.json

    # straight from the vocabulary table
    python -m scripts.anki_pronunciation --lang uk --limit 40

    # exercise the whole pipeline with silent audio, no API calls, no cost
    python -m scripts.anki_pronunciation --lang uk --dry-run

    # build and post the deck straight back to Telegram
    python -m scripts.anki_pronunciation --phrases phrases.json --send-to 12345678
"""

from __future__ import annotations

import argparse
import datetime as _dt
import os
import sys
from pathlib import Path

from .deck import build_deck
from .deliver import DeliveryError, send_document
from .phrases import ENGLISH_NAME, load_json, load_supabase
from .tts import AudioCache, TTSError, build_provider

DEFAULT_CACHE = Path(__file__).resolve().parent / ".cache"
DEFAULT_OUTDIR = Path(__file__).resolve().parent / "dist"


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="python -m scripts.anki_pronunciation",
        description="Build an AnkiPA-compatible pronunciation deck (.apkg).",
    )
    src = p.add_mutually_exclusive_group(required=True)
    src.add_argument("--phrases", metavar="FILE",
                     help="phrases.json from the bot's /pronounce command")
    src.add_argument("--lang", choices=sorted(ENGLISH_NAME),
                     help="pull phrases from the vocabulary table for this language")

    p.add_argument("--limit", type=int, default=40,
                   help="max cards when reading from the database (default: 40)")
    p.add_argument("--out", metavar="FILE", help="output .apkg path")
    p.add_argument("--provider", choices=["elevenlabs", "openai", "azure", "local", "silent"],
                   help="override CAPYBARA_TTS_PROVIDER")
    p.add_argument("--voice", help="override CAPYBARA_TTS_VOICE for this run")
    p.add_argument("--cache-dir", default=str(DEFAULT_CACHE),
                   help=f"audio cache directory (default: {DEFAULT_CACHE})")
    p.add_argument("--dry-run", action="store_true",
                   help="use silent placeholder audio; makes no API calls and costs nothing")
    p.add_argument("--send-to", metavar="CHAT_ID",
                   help="post the finished .apkg to this Telegram chat")
    return p.parse_args(argv)


def _default_out(lang: str) -> Path:
    today = _dt.date.today().isoformat()
    return DEFAULT_OUTDIR / f"capybara-pronunciation-{lang}-{today}.apkg"


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)

    if args.voice:
        os.environ["CAPYBARA_TTS_VOICE"] = args.voice

    # --- phrases ------------------------------------------------------------
    try:
        if args.phrases:
            phrase_set = load_json(args.phrases)
        else:
            phrase_set = load_supabase(args.lang, args.limit)
    except Exception as e:
        print(f"error: {e}", file=sys.stderr)
        return 1

    if len(phrase_set) == 0:
        print("error: no phrases found — nothing to build.", file=sys.stderr)
        return 1

    # --- provider -----------------------------------------------------------
    try:
        provider = build_provider(args.provider, dry_run=args.dry_run)
    except TTSError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1

    out_path = Path(args.out) if args.out else _default_out(phrase_set.lang)
    cache = AudioCache(args.cache_dir)

    print(f"deck      {phrase_set.deck_name}")
    print(f"locale    {phrase_set.locale}"
          f"{'' if phrase_set.assessable else '  (no Azure scoring — shadowing deck)'}")
    print(f"provider  {provider.identity}")
    print(f"phrases   {len(phrase_set)}")
    print()

    def progress(i: int, total: int, text: str, status: str) -> None:
        preview = text if len(text) <= 52 else text[:49] + "..."
        marker = "  " if status == "ok" else "!!"
        print(f"{marker} [{i:>3}/{total}] {preview}")

    # --- build --------------------------------------------------------------
    try:
        summary = build_deck(phrase_set, provider, cache, out_path, on_progress=progress)
    except Exception as e:
        print(f"\nerror: {e}", file=sys.stderr)
        return 1

    print()
    print(f"wrote {summary['path']}")
    print(f"  {summary['notes']} notes, {summary['media']} audio files "
          f"({summary['cache_hits']} cached, {summary['cache_misses']} synthesized)")

    if summary["failures"]:
        print(f"\n  {len(summary['failures'])} phrase(s) failed and were skipped:",
              file=sys.stderr)
        for text, err in summary["failures"][:5]:
            print(f"    - {text[:60]!r}: {err}", file=sys.stderr)
        if len(summary["failures"]) > 5:
            print(f"    ... and {len(summary['failures']) - 5} more", file=sys.stderr)

    if args.dry_run:
        print("\n  --dry-run: audio is SILENT placeholder. Re-run without it for real audio.")

    print("\nIn Anki: File → Import → this file.")
    print("Then Tools → AnkiPA Settings → Card fields: TargetText "
          "(extraction method: Fields only).")
    if not summary["assessable"]:
        print(f"Note: Azure has no pronunciation model for {summary['locale']}, so "
              "Ctrl+W won't score\nthese cards. They work as listen-and-repeat until it does.")

    # --- deliver ------------------------------------------------------------
    if args.send_to:
        caption = (
            f"{summary['deck_name']} — {summary['notes']} cards.\n\n"
            "Import: File → Import. AnkiPA → Card fields: TargetText."
        )
        if not summary["assessable"]:
            caption += f"\n\nNo Azure scoring for {summary['locale']} yet — shadowing deck."
        try:
            send_document(summary["path"], args.send_to, caption=caption)
            print(f"\nsent to Telegram chat {args.send_to}")
        except DeliveryError as e:
            print(f"\nerror: {e}", file=sys.stderr)
            return 1

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
