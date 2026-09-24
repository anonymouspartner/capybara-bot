"""Write pronunciation notes straight into capybara-anki's live tables.

`deck.py` builds an `.apkg` for Anki to import, which made sense while AnkiDroid was
the collection of record: build, import by hand, and the cards reached capybara-anki
on the next export. capybara-anki's docs/MIGRATION.md Phase 6.1 has since started
freezing AnkiDroid, so routing new cards through it now would work against the
cutover. This writes to the two places capybara-anki's own
`migration/upload_pronunciation_audio.py` already writes instead:

  * the public `pronunciation-audio` Storage bucket (the reviewer's `<audio src>`
    fetches with no Authorization header, so a signed URL would expire mid-review);
  * `anki_notes`, `kind = 'pronunciation'`, with D18's field mapping --
    TargetText -> lemma, Translation -> lemma_translation, Hint -> gloss,
    ReferenceAudio -> audio_url -- in a per-language deck (DECK_BY_LANG).

`source = 'bot'`, the value every other non-import capture uses. Re-running is safe:
notes already captured for the language are skipped (checked with an explicit select,
because anki_notes' uniqueness is a partial index that a REST upsert can't target --
same reason capybara-bot's writeAnkiNotes selects first), and audio uploads overwrite
by path. Only `/pronounce` scoring in the app needs no change: it reads `lemma` and
works for any language.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request

from .phrases import PhraseSet
from .tts import AudioCache, TTSProvider

BUCKET = "pronunciation-audio"

# capybara-anki shows both people the whole shared collection and keeps one schedule
# per card (see its postgresStore.ts class docstring), so each person's separation
# rests on opening only their own deck. The 191 imported Ukrainian notes already
# live in "Pronunciation"; English gets its own deck rather than joining them there.
DECK_BY_LANG = {"uk": "Pronunciation", "en": "English Pronunciation"}


def _request(method: str, url: str, *, key: str, body: bytes | None = None,
             headers: dict[str, str] | None = None) -> tuple[int, bytes]:
    all_headers = {"authorization": f"Bearer {key}", "apikey": key}
    if body is not None:
        all_headers["content-type"] = "application/json"
    all_headers.update(headers or {})
    req = urllib.request.Request(url, data=body, method=method, headers=all_headers)
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            return res.status, res.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def _ensure_bucket(base_url: str, key: str) -> None:
    status, body = _request(
        "POST", f"{base_url}/storage/v1/bucket", key=key,
        body=json.dumps({"id": BUCKET, "name": BUCKET, "public": True}).encode(),
    )
    if status in (200, 201, 409) or b"already exists" in body.lower():
        return
    raise RuntimeError(f"could not create bucket {BUCKET!r}: {status} {body.decode(errors='replace')}")


PAGE_SIZE = 1000


def _normalize(text: str) -> str:
    """Whitespace-insensitive lemma key -- the same normalisation the bot's daily run
    applies (normalizeSpaces), so a phrase written by either path is recognised by both."""
    return " ".join(text.split())


def _existing_lemmas(base_url: str, key: str, lang: str) -> set[str]:
    """Every captured pronunciation lemma in `lang`, normalised. Paged: PostgREST caps a
    response at 1000 rows, and a silently truncated read here would re-insert notes
    that already exist, as duplicates with their own schedules."""
    lemmas: set[str] = set()
    offset = 0
    while True:
        query = urllib.parse.urlencode({
            "select": "lemma",
            "language": f"eq.{lang}",
            "kind": "eq.pronunciation",
            "order": "id.asc",
            "limit": str(PAGE_SIZE),
            "offset": str(offset),
        })
        status, body = _request("GET", f"{base_url}/rest/v1/anki_notes?{query}", key=key)
        if status != 200:
            raise RuntimeError(f"reading existing pronunciation notes failed: {status} {body.decode(errors='replace')}")
        page = json.loads(body)
        lemmas.update(_normalize(row["lemma"]) for row in page if row.get("lemma"))
        if len(page) < PAGE_SIZE:
            return lemmas
        offset += PAGE_SIZE


def _remove_if_unreferenced(base_url: str, key: str, name: str) -> None:
    """Delete an uploaded object no note points at. Audio here is conversation text in
    a public bucket, so a file whose note never landed is exposure with no use -- but a
    content-addressed name can be shared, so check before deleting."""
    query = urllib.parse.urlencode({"select": "id", "audio_url": f"like.*/{name}", "limit": "1"})
    status, body = _request("GET", f"{base_url}/rest/v1/anki_notes?{query}", key=key)
    if status != 200 or json.loads(body):
        return
    _request("DELETE", f"{base_url}/storage/v1/object/{BUCKET}/{name}", key=key)


def write_direct(
    phrase_set: PhraseSet,
    provider: TTSProvider,
    cache: AudioCache,
    *,
    base_url: str,
    service_key: str,
    on_progress=None,
) -> dict:
    """Synthesize, upload and insert every phrase not already captured."""
    if len(phrase_set) == 0:
        raise ValueError("no phrases to write")
    if phrase_set.lang not in DECK_BY_LANG:
        # anki_notes.language is CHECK-constrained to uk/en.
        raise ValueError(f"capybara-anki only accepts uk/en notes, not {phrase_set.lang!r}")
    deck = DECK_BY_LANG[phrase_set.lang]

    base_url = base_url.rstrip("/")
    _ensure_bucket(base_url, service_key)
    existing = _existing_lemmas(base_url, service_key, phrase_set.lang)

    written = 0
    skipped = 0
    failures: list[tuple[str, str]] = []
    total = len(phrase_set)

    for index, phrase in enumerate(phrase_set.phrases, start=1):
        if _normalize(phrase.text) in existing:
            skipped += 1
            if on_progress:
                on_progress(index, total, phrase.text, "exists")
            continue
        try:
            audio_path = cache.get_or_synthesize(phrase.text, provider, locale=phrase_set.locale)
            status, body = _request(
                "POST", f"{base_url}/storage/v1/object/{BUCKET}/{audio_path.name}",
                key=service_key, body=audio_path.read_bytes(),
                headers={"content-type": "audio/mpeg", "x-upsert": "true"},
            )
            if status not in (200, 201):
                raise RuntimeError(f"upload failed: {status} {body.decode(errors='replace')}")
        except Exception as e:  # one bad phrase must not lose the whole run
            failures.append((phrase.text, str(e)))
            if on_progress:
                on_progress(index, total, phrase.text, "FAILED")
            continue

        # One insert per phrase, straight after its upload: a failure then costs only
        # that phrase, and its just-uploaded audio is taken back down instead of being
        # left public with no note pointing at it.
        row = {
            "lemma": phrase.text,
            "gloss": phrase.hint or None,
            "lemma_translation": phrase.translation or None,
            "language": phrase_set.lang,
            "audio_url": f"{base_url}/storage/v1/object/public/{BUCKET}/{audio_path.name}",
            "deck": deck,
            "kind": "pronunciation",
            "has_spelling": False,
            "source": "bot",
        }
        status, body = _request(
            "POST", f"{base_url}/rest/v1/anki_notes", key=service_key,
            body=json.dumps(row).encode(), headers={"prefer": "return=minimal"},
        )
        if status not in (200, 201):
            _remove_if_unreferenced(base_url, service_key, audio_path.name)
            failures.append((phrase.text, f"insert failed: {status} {body.decode(errors='replace')[:200]}"))
            if on_progress:
                on_progress(index, total, phrase.text, "FAILED")
            continue
        written += 1
        existing.add(_normalize(phrase.text))
        if on_progress:
            on_progress(index, total, phrase.text, "ok")

    return {
        "deck_name": deck,
        "locale": phrase_set.locale,
        "written": written,
        "skipped_existing": skipped,
        "cache_hits": cache.hits,
        "cache_misses": cache.misses,
        "failures": failures,
    }
