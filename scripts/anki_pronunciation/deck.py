"""genanki model, card templates, and .apkg packaging.

Field layout is dictated by the AnkiPA add-on, which reads its target text from
note FIELDS (its "Text extraction method" defaults to "Fields only", and its
"Card fields" setting is a priority-ordered list of field names).

Two consequences shape the model below:

  1. `TargetText` holds the phrase and NOTHING else -- no [sound:] tag, no HTML.
     If audio shared that field, AnkiPA would hand the literal string
     "[sound:capy_pron_ab12cd34.mp3]" to the Azure assessor.
  2. `TargetText` is field #1, because AnkiPA's field list is priority-ordered.

After importing, set AnkiPA's "Card fields" to `TargetText` and leave extraction
on "Fields only".
"""

from __future__ import annotations

import hashlib
from pathlib import Path

import genanki

from .phrases import PhraseSet
from .tts import AudioCache, TTSProvider

# Fixed forever. genanki keys the note type on this id; generating a fresh one per
# run would make every export a brand-new note type, so re-imports would stack up
# duplicate "Capybara Pronunciation-a1b2c" models instead of merging.
MODEL_ID = 1742395011

FIELDS = ["TargetText", "ReferenceAudio", "Translation", "Language", "Hint", "SourceId"]

CARD_CSS = """
.card {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 20px;
  text-align: center;
  color: #1a1a1a;
  background: #fdfdfc;
  padding: 18px;
}
.nightMode.card, .card.nightMode { color: #e8e8e6; background: #1f1f1f; }

.target {
  font-size: 30px;
  line-height: 1.35;
  font-weight: 600;
  margin: 12px auto 18px;
  max-width: 30em;
}
.audio { margin: 8px 0 14px; }
.cue {
  font-size: 14px;
  color: #6b7280;
  letter-spacing: .02em;
}
.nightMode .cue { color: #9ca3af; }
.cue kbd {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 13px;
  background: rgba(127, 127, 127, .16);
  border-radius: 4px;
  padding: 1px 5px;
}
hr#answer { border: none; border-top: 1px solid rgba(127,127,127,.35); margin: 18px 0; }
.translation { font-size: 21px; margin-bottom: 10px; }
.hint {
  font-size: 15px;
  color: #6b7280;
  font-style: italic;
}
.nightMode .hint { color: #9ca3af; }
.shadow-only {
  font-size: 13px;
  color: #92400e;
  background: rgba(251, 191, 36, .16);
  border-radius: 6px;
  padding: 6px 10px;
  display: inline-block;
  margin-top: 12px;
}
.nightMode .shadow-only { color: #fcd34d; }
"""

# The target text sits on the FRONT on purpose: this is a pronunciation drill,
# not a recall test. You read it aloud, hear the reference, then flip for meaning.
FRONT_TEMPLATE = """
<div class="target">{{TargetText}}</div>
<div class="audio">{{ReferenceAudio}}</div>
<div class="cue">Say it out loud — <kbd>Ctrl</kbd>+<kbd>W</kbd> to record and score</div>
"""

BACK_TEMPLATE = """
{{FrontSide}}
<hr id=answer>
<div class="translation">{{Translation}}</div>
{{#Hint}}<div class="hint">{{Hint}}</div>{{/Hint}}
"""

# Same as BACK_TEMPLATE but swaps the scoring cue for an honest one, used when the
# deck's locale has no Azure pronunciation-assessment model (e.g. uk-UA).
SHADOW_FRONT_TEMPLATE = """
<div class="target">{{TargetText}}</div>
<div class="audio">{{ReferenceAudio}}</div>
<div class="cue">Listen, then say it out loud</div>
"""

SHADOW_NOTICE = """
<div class="shadow-only">No Azure scoring for this language yet — rate yourself.</div>
"""


def build_model(assessable: bool) -> genanki.Model:
    """The note type. `assessable` only swaps the on-card cue text.

    The model ID and field list stay identical either way, so the Ukrainian and
    English decks share one note type in Anki and AnkiPA needs configuring once.
    """
    return genanki.Model(
        MODEL_ID,
        "Capybara Pronunciation",
        fields=[{"name": name} for name in FIELDS],
        templates=[{
            "name": "Listen and Speak",
            "qfmt": (FRONT_TEMPLATE if assessable else SHADOW_FRONT_TEMPLATE).strip(),
            "afmt": (BACK_TEMPLATE if assessable
                     else (BACK_TEMPLATE + SHADOW_NOTICE)).strip(),
        }],
        css=CARD_CSS,
        sort_field_index=0,
    )


def _deck_id(deck_name: str) -> int:
    """Deterministic per-deck id, so rebuilding a deck targets the same deck."""
    digest = hashlib.sha256(deck_name.encode("utf-8")).digest()
    return int.from_bytes(digest[:4], "big") % (2 ** 31 - 1) or 1


def build_deck(
    phrase_set: PhraseSet,
    provider: TTSProvider,
    cache: AudioCache,
    out_path: str | Path,
    *,
    on_progress=None,
) -> dict:
    """Synthesize audio for every phrase and write the .apkg.

    Returns a small summary dict for the CLI to print.
    """
    if len(phrase_set) == 0:
        raise ValueError("no phrases to build a deck from")

    model = build_model(phrase_set.assessable)
    deck = genanki.Deck(_deck_id(phrase_set.deck_name), phrase_set.deck_name)

    media_paths: list[str] = []
    seen_media: set[str] = set()
    failures: list[tuple[str, str]] = []

    for index, phrase in enumerate(phrase_set.phrases, start=1):
        try:
            audio_path = cache.get_or_synthesize(
                phrase.text, provider, locale=phrase_set.locale
            )
        except Exception as e:  # one bad phrase must not lose the whole run
            failures.append((phrase.text, str(e)))
            if on_progress:
                on_progress(index, len(phrase_set), phrase.text, "FAILED")
            continue

        # De-dupe media: two phrases with identical text hash to the same file,
        # and genanki would otherwise write the same bytes into the zip twice.
        if audio_path.name not in seen_media:
            seen_media.add(audio_path.name)
            media_paths.append(str(audio_path))

        deck.add_note(genanki.Note(
            model=model,
            fields=[
                phrase.text,                       # TargetText  -- plain, AnkiPA reads this
                f"[sound:{audio_path.name}]",      # ReferenceAudio
                phrase.translation,
                phrase_set.locale,                 # Language
                phrase.hint,
                phrase.source_id,
            ],
            # Stable GUID => re-importing a rebuilt deck updates the existing note
            # rather than creating a duplicate.
            guid=genanki.guid_for(phrase.source_id),
            tags=[f"capybara::pronunciation::{phrase_set.lang}"],
        ))

        if on_progress:
            on_progress(index, len(phrase_set), phrase.text, "ok")

    if not deck.notes:
        raise RuntimeError(
            "every phrase failed to synthesize; no deck written. "
            f"First error: {failures[0][1] if failures else 'unknown'}"
        )

    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    genanki.Package(deck, media_files=media_paths).write_to_file(str(out_path))

    return {
        "deck_name": phrase_set.deck_name,
        "locale": phrase_set.locale,
        "assessable": phrase_set.assessable,
        "notes": len(deck.notes),
        "media": len(media_paths),
        "cache_hits": cache.hits,
        "cache_misses": cache.misses,
        "failures": failures,
        "path": str(out_path),
    }
