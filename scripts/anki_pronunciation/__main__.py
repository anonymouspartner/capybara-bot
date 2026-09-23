"""CLI: phrases in, .apkg out.

    # from a phrases.json the bot's /pronounce sent you
    python -m scripts.anki_pronunciation --phrases phrases.json

    # straight from the vocabulary table
    python -m scripts.anki_pronunciation --lang uk --limit 40

    # exercise the whole pipeline with silent audio, no API calls, no cost
    python -m scripts.anki_pronunciation --lang uk --dry-run

    # build and post the deck straight back to Telegram
    python -m scripts.anki_pronunciation --phrases phrases.json --send-to 12345678

    # skip Anki entirely: write cards straight into capybara-anki's live tables
    python -m scripts.anki_pronunciation --lang en --limit 40 --provider openai --direct
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
from .write_direct import write_direct

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
    p.add_argument("--direct", action="store_true",
                   help="write notes + audio straight into capybara-anki's anki_notes and "
                        "Storage instead of building an .apkg (needs SUPABASE_URL and "
                        "SUPABASE_SERVICE_ROLE_KEY)")
    args = p.parse_args(argv)
    if args.direct and (args.out or args.send_to):
        p.error("--direct writes to the database, not a file: drop --out/--send-to")
    return args


def _default_out(lang: str) -> Path:
    today = _dt.date.today().isoformat()
    return DEFAULT_OUTDIR / f"capybara-pronunciation-{lang}-{today}.apkg"


def _run_direct(phrase_set, provider, cache, progress, *, dry_run: bool) -> int:
    print(f"target    capybara-anki anki_notes ({phrase_set.lang})")
    print(f"provider  {provider.identity}")
    print(f"phrases   {len(phrase_set)}")
    print()

    # --dry-run's silent audio is for exercising a local .apkg build. Here it would
    # land in the live app as real cards with no sound, so a dry run writes nothing.
    if dry_run:
        for i, phrase in enumerate(phrase_set.phrases, start=1):
            progress(i, len(phrase_set), phrase.text, "ok")
        print("\n  --dry-run: nothing synthesized, uploaded or inserted.")
        return 0

    base_url = os.environ.get("SUPABASE_URL", "")
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not base_url or not service_key:
        print("error: --direct needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY", file=sys.stderr)
        return 1

    try:
        summary = write_direct(phrase_set, provider, cache, base_url=base_url,
                               service_key=service_key, on_progress=progress)
    except Exception as e:
        print(f"\nerror: {e}", file=sys.stderr)
        return 1

    print()
    print(f"inserted {summary['written']} pronunciation notes "
          f"({summary['skipped_existing']} already there, "
          f"{summary['cache_hits']} audio cached, {summary['cache_misses']} synthesized)")
    if summary["failures"]:
        print(f"\n  {len(summary['failures'])} phrase(s) failed and were skipped:", file=sys.stderr)
        for text, err in summary["failures"][:5]:
            print(f"    - {text[:60]!r}: {err}", file=sys.stderr)
    print(f"\nOpen /study -> {summary['deck_name']} to see them.")
    return 0 if not summary["failures"] else 1


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

    cache = AudioCache(args.cache_dir)

    def progress(i: int, total: int, text: str, status: str) -> None:
        preview = text if len(text) <= 52 else text[:49] + "..."
        marker = {"ok": "  ", "exists": "= "}.get(status, "!!")
        print(f"{marker} [{i:>3}/{total}] {preview}")

    if args.direct:
        return _run_direct(phrase_set, provider, cache, progress, dry_run=args.dry_run)

    out_path = Path(args.out) if args.out else _default_out(phrase_set.lang)

    print(f"deck      {phrase_set.deck_name}")
    print(f"locale    {phrase_set.locale}"
          f"{'' if phrase_set.assessable else '  (no Azure scoring — shadowing deck)'}")
    print(f"provider  {provider.identity}")
    print(f"phrases   {len(phrase_set)}")
    print()

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
