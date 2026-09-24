"""Phrase sources for the pronunciation deck.

Two ways in:

  * `load_json(path)`   -- the `phrases.json` the bot's /pronounce command sends
                           you in Telegram (schema "capybara.pronunciation.v1").
  * `load_supabase(...)` -- query the `vocabulary` table directly, for running
                           the generator without going through Telegram.

Both yield the same `Phrase` objects, so `deck.py` never learns where they came
from.
"""

from __future__ import annotations

import hashlib
import json
import os
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

SCHEMA = "capybara.pronunciation.v1"

# BCP-47 locale per bot language code. AnkiPA passes this straight to Azure.
LOCALE_BY_LANG = {
    "en": "en-US",
    "uk": "uk-UA",
    "es": "es-ES",
    "fr": "fr-FR",
    "de": "de-DE",
    "it": "it-IT",
    "pt": "pt-PT",
    "pl": "pl-PL",
}

# Locales Azure AI Speech can actually score with Pronunciation Assessment, as of
# 2026-09. Verified against the Microsoft language-support table:
# articles/ai-services/speech-service/includes/language-support/pronunciation-assessment.md
#
# uk-UA is NOT on that list -- there is no Ukrainian phoneme model. A Ukrainian deck
# still builds and is fully usable as listen-and-repeat (reference audio + self-rating);
# it just cannot be graded. Ctrl+W in Anki will report an unsupported language until
# Microsoft adds uk-UA, at which point this set is the only thing that needs editing.
#
# ru-RU is on Azure's list and is deliberately NOT treated as a stand-in for Ukrainian:
# different phoneme inventory, so the scores would be noise.
AZURE_ASSESSABLE_LOCALES = frozenset({
    "ar-EG", "ar-SA", "ca-ES", "zh-HK", "zh-CN", "zh-TW", "da-DK", "nl-NL",
    "en-AU", "en-CA", "en-IN", "en-GB", "en-US", "fi-FI", "fr-CA", "fr-FR",
    "de-DE", "hi-IN", "it-IT", "ja-JP", "ko-KR", "ms-MY", "nb-NO", "pl-PL",
    "pt-BR", "pt-PT", "ru-RU", "es-MX", "es-ES", "sv-SE", "ta-IN", "th-TH",
    "vi-VN",
})

ENGLISH_NAME = {
    "en": "English", "uk": "Ukrainian", "es": "Spanish", "fr": "French",
    "de": "German", "it": "Italian", "pt": "Portuguese", "pl": "Polish",
}


def locale_for(lang: str) -> str:
    return LOCALE_BY_LANG.get(lang, lang)


def is_assessable(locale: str) -> bool:
    """True if Azure (and therefore AnkiPA) can grade this locale."""
    return locale in AZURE_ASSESSABLE_LOCALES


def deck_name_for(lang: str) -> str:
    """Mirrors the bot's existing Capybara::<Language> deck convention."""
    return f"Capybara::Pronunciation::{ENGLISH_NAME.get(lang, lang)}"


@dataclass(frozen=True)
class Phrase:
    """One card's worth of text. Audio is attached later, by deck.py."""

    text: str
    translation: str = ""
    hint: str = ""
    source_id: str = ""
    source: str = "manual"  # "example" | "lemma" | "manual"

    def __post_init__(self) -> None:
        if not self.text or not self.text.strip():
            raise ValueError("Phrase.text must be non-empty")
        # A stable id keeps Anki note GUIDs stable across regenerations, so
        # re-importing a rebuilt deck updates cards instead of duplicating them.
        if not self.source_id:
            digest = hashlib.sha256(self.text.encode("utf-8")).hexdigest()[:16]
            object.__setattr__(self, "source_id", f"text:{digest}")


@dataclass
class PhraseSet:
    lang: str
    phrases: list[Phrase] = field(default_factory=list)

    @property
    def locale(self) -> str:
        return locale_for(self.lang)

    @property
    def assessable(self) -> bool:
        return is_assessable(self.locale)

    @property
    def deck_name(self) -> str:
        return deck_name_for(self.lang)

    def __len__(self) -> int:
        return len(self.phrases)


def _dedupe(phrases: Iterable[Phrase]) -> list[Phrase]:
    """Drop repeats by normalized text, keeping first occurrence order.

    The corpus routinely surfaces the same sentence through two different lemmas;
    without this you pay for the same TTS call twice and get a duplicate card.
    """
    seen: set[str] = set()
    out: list[Phrase] = []
    for p in phrases:
        key = " ".join(p.text.split()).casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(p)
    return out


# Longest example sentence load_supabase keeps by default. A pronunciation card is
# something you say in one breath; the corpus's examples are whole chat messages,
# and the long ones read as dictation, not drill.
DEFAULT_MAX_WORDS = 12


def word_count(text: str) -> int:
    return len(text.split())


def in_expected_script(text: str, lang: str) -> bool:
    """False if `text` has letters from the wrong alphabet for `lang`.

    The vocabulary table is only as accurate as the language detection that filled
    it, and a chat that mixes languages leaks: a Serbo-Croatian line tagged `en`
    would otherwise become an "English" card read by an English voice. Only checks
    the two alphabets this corpus actually has (Latin for en, Cyrillic for uk);
    other languages pass unchecked.
    """
    for ch in text:
        # Modifier letters (Ukrainian's apostrophe U+02BC among them) count as
        # alphabetic but belong to no one alphabet.
        if not ch.isalpha() or unicodedata.category(ch) == "Lm":
            continue
        if lang == "en" and not ("a" <= ch.lower() <= "z"):
            return False
        if lang == "uk" and not unicodedata.name(ch, "").startswith("CYRILLIC"):
            return False
    return True


def save_json(phrase_set: PhraseSet, path: str | Path) -> None:
    """Write `phrase_set` in the same schema `load_json` reads.

    This is how a reviewed list gets frozen: preview with `--save-plan`, then run
    the real thing from that file (`--phrases`, optionally `--skip`), so the
    numbers you picked from are the numbers that get skipped -- the live
    occurrence ordering can shift between two runs. The file holds conversation
    text: name it `phrases-*.json` (gitignored) -- this repo is public.
    """
    doc = {
        "schema": SCHEMA,
        "language": phrase_set.lang,
        "phrases": [
            {"id": p.source_id, "text": p.text, "translation": p.translation,
             "hint": p.hint, "source": p.source}
            for p in phrase_set.phrases
        ],
    }
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load_json(path: str | Path) -> PhraseSet:
    """Load the phrases.json produced by the bot's /pronounce command."""
    raw = json.loads(Path(path).read_text(encoding="utf-8"))

    schema = raw.get("schema")
    if schema != SCHEMA:
        raise ValueError(
            f"{path}: expected schema {SCHEMA!r}, got {schema!r}. "
            "Regenerate the file with /pronounce on a current build."
        )

    lang = raw.get("language")
    if not lang:
        raise ValueError(f"{path}: missing 'language'")

    phrases = [
        Phrase(
            text=item["text"],
            translation=item.get("translation", "") or "",
            hint=item.get("hint", "") or "",
            source_id=item.get("id", "") or "",
            source=item.get("source", "manual"),
        )
        for item in raw.get("phrases", [])
        if (item.get("text") or "").strip()
    ]
    return PhraseSet(lang=lang, phrases=_dedupe(phrases))


def load_supabase(lang: str, limit: int = 40, *, max_words: int = DEFAULT_MAX_WORDS,
                  url: str | None = None, service_key: str | None = None) -> PhraseSet:
    """Pull phrases straight from the `vocabulary` table.

    Prefers `example` (the short model-extracted sentence) and falls back to the
    bare lemma for rows annotated before that column existed. Ordered by
    occurrence_count so you drill what you actually say.

    Drops examples longer than `max_words` (0 = no limit) and anything in the wrong
    alphabet for `lang` (`in_expected_script`). Those filters can reject most of
    the top rows, hence the deeper over-fetch.
    """
    url = url or os.environ.get("SUPABASE_URL")
    service_key = service_key or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not service_key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to read "
            "phrases from the database (or pass --phrases <file> instead)."
        )

    query = urllib.parse.urlencode({
        "select": "id,lemma,lemma_translation,example,example_translation,occurrence_count",
        "language": f"eq.{lang}",
        "order": "occurrence_count.desc",
        "limit": str(max(limit * 10, limit)),  # over-fetch; filters + dedupe trim below
    })
    req = urllib.request.Request(
        f"{url.rstrip('/')}/rest/v1/vocabulary?{query}",
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            rows = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raise RuntimeError(
            f"vocabulary query failed: HTTP {e.code} {e.read().decode('utf-8', 'replace')[:200]}"
        ) from e

    def keep(text: str) -> bool:
        if not in_expected_script(text, lang):
            return False
        return not max_words or word_count(text) <= max_words

    phrases: list[Phrase] = []
    for row in rows:
        example = (row.get("example") or "").strip()
        if example and not keep(example):
            continue
        if example:
            phrases.append(Phrase(
                text=example,
                translation=(row.get("example_translation") or "").strip(),
                hint=(row.get("lemma") or "").strip(),
                source_id=f"vocab:{row['id']}",
                source="example",
            ))
        elif (row.get("lemma") or "").strip() and keep(row["lemma"].strip()):
            phrases.append(Phrase(
                text=row["lemma"].strip(),
                translation=(row.get("lemma_translation") or "").strip(),
                source_id=f"vocab:{row['id']}",
                source="lemma",
            ))

    return PhraseSet(lang=lang, phrases=_dedupe(phrases)[:limit])
