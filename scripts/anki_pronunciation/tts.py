"""Reference-audio providers, plus an on-disk cache.

The provider seam exists because the "whose voice is the reference" decision is
not settled by one vendor:

  * elevenlabs -- a cloned voice (Vika). The default.
  * openai     -- PRESET voices only. OpenAI's voice cloning (Voice Engine) has
                  stayed in limited preview and is not a public API, so there is
                  no way to pass a custom voice id here. Useful as a fallback or
                  for English; it is not Vika's voice.
  * azure      -- standard neural voices (uk-UA-PolinaNeural etc.) or a Custom
                  Neural Voice. Reuses the Azure account AnkiPA already needs.
  * local      -- real recordings. No API, no cost, no voiceprint leaving the
                  house; the most faithful reference there is.
  * silent     -- valid silent MP3s for --dry-run, so the whole pipeline can be
                  exercised without spending anything.

Every result is cached on disk under a digest of (text + provider identity), so
re-running after editing three phrases re-bills for three phrases.

Stdlib only (urllib) -- genanki is the package's single third-party dependency.
"""

from __future__ import annotations

import hashlib
import json
import os
import urllib.error
import urllib.request
import xml.sax.saxutils as saxutils
from pathlib import Path
from typing import Protocol

# Providers that reach the network get a bounded retry: these are bulk calls and
# a single 429/503 shouldn't lose a whole deck run.
_RETRIES = 3
_TIMEOUT = 120


def log_usage(model: str, characters: int, feature: str = "pronunciation_tts") -> None:
    """Record one billable TTS call in the bot's `api_usage` ledger.

    The bot has no ElevenLabs integration and deliberately holds no TTS credentials --
    it can't meter this spend itself, so the side that actually spends it writes the row.
    The API key stays local; only the character count and price leave this machine.

    Best-effort in every direction: silent no-op when Supabase isn't configured (which is
    the normal case for `--phrases` runs), and a logging failure warns rather than losing
    a deck that has already been paid for and built.
    """
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        return
    # Mirrors CHARACTER_RATES in the bot's index.ts; keep the two in step.
    cost = (characters / 1000) * 0.30
    body = json.dumps({
        "provider": "elevenlabs",
        "model": model,
        "feature": feature,
        "characters": characters,
        "cost_usd": round(cost, 6),
    }).encode("utf-8")
    req = urllib.request.Request(
        f"{url}/rest/v1/api_usage",
        data=body,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=15).read()
    except Exception as e:  # never fail a build over metering
        print(f"  ! usage logging failed (deck is unaffected): {e}")


class TTSError(RuntimeError):
    pass


class TTSProvider(Protocol):
    """Anything that can turn text into MP3 bytes."""

    #: Stable identity of provider+model+voice. Part of the cache digest, so
    #: switching voice invalidates only that voice's audio.
    identity: str

    def synthesize(self, text: str, *, locale: str) -> bytes: ...


def _post(url: str, *, data: bytes, headers: dict[str, str]) -> bytes:
    last: Exception | None = None
    for attempt in range(_RETRIES):
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=_TIMEOUT) as resp:
                return resp.read()
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")[:300]
            # 4xx other than rate-limiting is a bad request: retrying just burns time.
            if e.code != 429 and e.code < 500:
                raise TTSError(f"HTTP {e.code} from {url}: {body}") from e
            last = TTSError(f"HTTP {e.code} from {url}: {body}")
        except urllib.error.URLError as e:
            last = TTSError(f"network error calling {url}: {e.reason}")
        if attempt < _RETRIES - 1:
            import time
            time.sleep(2 ** attempt)
    raise last or TTSError(f"failed calling {url}")


class ElevenLabsTTS:
    """Cloned-voice path. `voice_id` comes from your ElevenLabs voice library."""

    def __init__(self, api_key: str, voice_id: str,
                 model: str = "eleven_multilingual_v2",
                 stability: float = 0.5, similarity_boost: float = 0.85):
        if not api_key:
            raise TTSError("ELEVENLABS_API_KEY is not set")
        if not voice_id:
            raise TTSError("CAPYBARA_TTS_VOICE must be the ElevenLabs voice_id")
        self._key = api_key
        self._voice = voice_id
        self._model = model
        self._settings = {"stability": stability, "similarity_boost": similarity_boost}
        self.identity = f"elevenlabs:{model}:{voice_id}"

    def synthesize(self, text: str, *, locale: str) -> bytes:
        # eleven_multilingual_v2 detects language from the text itself, so `locale`
        # is not sent; it still shapes the cache digest via the deck build.
        body = json.dumps({
            "text": text,
            "model_id": self._model,
            "voice_settings": self._settings,
        }).encode("utf-8")
        audio = _post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{self._voice}"
            "?output_format=mp3_44100_128",
            data=body,
            headers={
                "xi-api-key": self._key,
                "Content-Type": "application/json",
                "Accept": "audio/mpeg",
            },
        )
        # Logged here, not in AudioCache: ElevenLabs bills per character synthesized, so
        # a cache hit costs nothing and must not appear in the ledger.
        log_usage(self._model, len(text))
        return audio


class OpenAITTS:
    """OpenAI /v1/audio/speech. PRESET voices only -- see the module docstring."""

    PRESETS = ("alloy", "ash", "ballad", "coral", "echo", "fable",
               "nova", "onyx", "sage", "shimmer", "verse")

    def __init__(self, api_key: str, voice: str = "nova",
                 model: str = "gpt-4o-mini-tts", instructions: str | None = None):
        if not api_key:
            raise TTSError("OPENAI_API_KEY is not set")
        if voice not in self.PRESETS:
            raise TTSError(
                f"{voice!r} is not an OpenAI preset voice. OpenAI has no public "
                f"custom-voice API -- use provider 'elevenlabs' for a cloned voice. "
                f"Presets: {', '.join(self.PRESETS)}"
            )
        self._key = api_key
        self._voice = voice
        self._model = model
        self._instructions = instructions
        self.identity = f"openai:{model}:{voice}:{hashlib.sha256((instructions or '').encode()).hexdigest()[:8]}"

    def synthesize(self, text: str, *, locale: str) -> bytes:
        payload: dict[str, object] = {
            "model": self._model,
            "input": text,
            "voice": self._voice,
            "response_format": "mp3",
        }
        if self._instructions:
            # Steers tone/pacing/accent. It does NOT clone a speaker's identity.
            payload["instructions"] = self._instructions
        return _post(
            "https://api.openai.com/v1/audio/speech",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self._key}",
                "Content-Type": "application/json",
            },
        )


class AzureTTS:
    """Azure neural TTS. Same subscription AnkiPA uses for assessment."""

    def __init__(self, api_key: str, region: str, voice: str):
        if not api_key or not region:
            raise TTSError("AZURE_SPEECH_KEY and AZURE_SPEECH_REGION must both be set")
        if not voice:
            raise TTSError("CAPYBARA_TTS_VOICE must name an Azure voice, e.g. uk-UA-PolinaNeural")
        self._key = api_key
        self._region = region
        self._voice = voice
        self.identity = f"azure:{voice}"

    def synthesize(self, text: str, *, locale: str) -> bytes:
        ssml = (
            f"<speak version='1.0' xml:lang='{locale}'>"
            f"<voice name='{self._voice}'>{saxutils.escape(text)}</voice>"
            f"</speak>"
        )
        return _post(
            f"https://{self._region}.tts.speech.microsoft.com/cognitiveservices/v1",
            data=ssml.encode("utf-8"),
            headers={
                "Ocp-Apim-Subscription-Key": self._key,
                "Content-Type": "application/ssml+xml",
                "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
                "User-Agent": "capybara-anki-pronunciation",
            },
        )


class LocalRecordings:
    """Real recordings, keyed by a manifest mapping phrase text -> filename.

    The manifest is plain JSON: {"Доброго ранку": "vika_001.mp3", ...}. Anything
    the manifest doesn't cover raises, so a half-recorded set fails loudly instead
    of silently shipping cards with no audio.
    """

    def __init__(self, directory: str | Path, manifest: str | Path | None = None):
        # Guard the empty string explicitly: Path("") is Path("."), which passes
        # is_dir(), so an unset CAPYBARA_RECORDINGS_DIR would otherwise fail later
        # with a confusing "manifest not found: manifest.json".
        if not str(directory).strip():
            raise TTSError("CAPYBARA_RECORDINGS_DIR must be set for provider 'local'")
        self._dir = Path(directory)
        if not self._dir.is_dir():
            raise TTSError(f"CAPYBARA_RECORDINGS_DIR does not exist: {self._dir}")
        manifest_path = Path(manifest) if manifest else self._dir / "manifest.json"
        if not manifest_path.is_file():
            raise TTSError(f"recordings manifest not found: {manifest_path}")
        raw = json.loads(manifest_path.read_text(encoding="utf-8"))
        self._map = {" ".join(k.split()).casefold(): v for k, v in raw.items()}
        self.identity = f"local:{self._dir.resolve()}"

    def synthesize(self, text: str, *, locale: str) -> bytes:
        key = " ".join(text.split()).casefold()
        name = self._map.get(key)
        if not name:
            raise TTSError(f"no recording in manifest for: {text!r}")
        path = self._dir / name
        if not path.is_file():
            raise TTSError(f"manifest points at a missing file: {path}")
        return path.read_bytes()


class SilentTTS:
    """Valid silent MP3s, for --dry-run.

    Emits real MPEG-1 Layer III frames (44.1 kHz, 128 kbps, mono) with zeroed
    payloads, so Anki treats the media as genuine audio and the whole
    build/import path is exercised without a single API call.
    """

    _FRAME = bytes([0xFF, 0xFB, 0x90, 0xC0]) + b"\x00" * 413  # 417-byte frame

    def __init__(self, seconds: float = 1.0):
        self._frames = max(1, int(seconds / (1152 / 44100)))
        self.identity = f"silent:{seconds}"

    def synthesize(self, text: str, *, locale: str) -> bytes:
        return self._FRAME * self._frames


def build_provider(name: str | None = None, *, dry_run: bool = False) -> TTSProvider:
    """Construct the configured provider from the environment."""
    if dry_run:
        return SilentTTS()

    name = (name or os.environ.get("CAPYBARA_TTS_PROVIDER") or "elevenlabs").lower()
    voice = os.environ.get("CAPYBARA_TTS_VOICE", "")
    model = os.environ.get("CAPYBARA_TTS_MODEL", "")

    if name == "elevenlabs":
        return ElevenLabsTTS(
            os.environ.get("ELEVENLABS_API_KEY", ""),
            voice,
            model=model or "eleven_multilingual_v2",
        )
    if name == "openai":
        return OpenAITTS(
            os.environ.get("OPENAI_API_KEY", ""),
            voice or "nova",
            model=model or "gpt-4o-mini-tts",
            instructions=os.environ.get("CAPYBARA_TTS_INSTRUCTIONS") or None,
        )
    if name == "azure":
        return AzureTTS(
            os.environ.get("AZURE_SPEECH_KEY", ""),
            os.environ.get("AZURE_SPEECH_REGION", ""),
            voice,
        )
    if name == "local":
        return LocalRecordings(
            os.environ.get("CAPYBARA_RECORDINGS_DIR", ""),
            os.environ.get("CAPYBARA_RECORDINGS_MANIFEST") or None,
        )
    if name == "silent":
        return SilentTTS()
    raise TTSError(
        f"unknown CAPYBARA_TTS_PROVIDER {name!r}; "
        "expected elevenlabs, openai, azure, local, or silent"
    )


class AudioCache:
    """Content-addressed MP3 cache.

    The digest covers the text AND the provider identity, so switching voices
    doesn't serve stale audio, and re-running after editing a few phrases only
    re-synthesizes those.

    The digest is also the media filename, which makes filenames stable across
    runs -- so re-importing a rebuilt deck replaces media in place rather than
    piling up `file_1.mp3`, `file_2.mp3` in Anki's collection.
    """

    def __init__(self, directory: str | Path):
        self._dir = Path(directory)
        self._dir.mkdir(parents=True, exist_ok=True)
        self.hits = 0
        self.misses = 0

    @staticmethod
    def digest(text: str, provider: TTSProvider, locale: str = "") -> str:
        # locale is part of the key because AzureTTS puts it in the SSML: the same
        # sentence under two locales is genuinely different audio, and without this
        # the second deck would silently reuse the first deck's pronunciation.
        key = f"{provider.identity}\x00{locale}\x00{' '.join(text.split())}"
        return hashlib.sha256(key.encode("utf-8")).hexdigest()[:12]

    def media_name(self, text: str, provider: TTSProvider, locale: str = "") -> str:
        return f"capy_pron_{self.digest(text, provider, locale)}.mp3"

    def get_or_synthesize(self, text: str, provider: TTSProvider, *, locale: str) -> Path:
        path = self._dir / self.media_name(text, provider, locale)
        if path.is_file() and path.stat().st_size > 0:
            self.hits += 1
            return path
        audio = provider.synthesize(text, locale=locale)
        if not audio:
            raise TTSError(f"provider returned no audio for: {text!r}")
        # Write via a temp file so an interrupted run can't leave a truncated
        # MP3 that later looks like a valid cache hit.
        tmp = path.with_suffix(".part")
        tmp.write_bytes(audio)
        tmp.replace(path)
        self.misses += 1
        return path
