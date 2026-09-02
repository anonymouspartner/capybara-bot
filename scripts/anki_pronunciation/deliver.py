"""Send a finished .apkg back to Telegram, closing the /pronounce loop.

Uses the same bot token the Edge Function uses, so the deck arrives in the same
chat you typed /pronounce in. Stdlib only -- multipart is hand-rolled rather
than pulling in `requests`.
"""

from __future__ import annotations

import mimetypes
import os
import urllib.error
import urllib.request
import uuid
from pathlib import Path

# Telegram's Bot API caps bot uploads at 50 MB.
MAX_UPLOAD_BYTES = 50 * 1024 * 1024


class DeliveryError(RuntimeError):
    pass


def _multipart(fields: dict[str, str], file_field: str, path: Path) -> tuple[bytes, str]:
    boundary = f"----capybara{uuid.uuid4().hex}"
    sep = f"--{boundary}\r\n".encode()
    out = bytearray()

    for name, value in fields.items():
        out += sep
        out += f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode()
        out += value.encode("utf-8") + b"\r\n"

    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    out += sep
    out += (
        f'Content-Disposition: form-data; name="{file_field}"; filename="{path.name}"\r\n'
        f"Content-Type: {mime}\r\n\r\n"
    ).encode()
    out += path.read_bytes() + b"\r\n"
    out += f"--{boundary}--\r\n".encode()

    return bytes(out), f"multipart/form-data; boundary={boundary}"


def send_document(path: str | Path, chat_id: str | int, *,
                  caption: str = "", token: str | None = None) -> None:
    """Upload `path` to `chat_id` as a Telegram document."""
    token = token or os.environ.get("TELEGRAM_BOT_TOKEN")
    if not token:
        raise DeliveryError("TELEGRAM_BOT_TOKEN is not set")

    path = Path(path)
    if not path.is_file():
        raise DeliveryError(f"no such file: {path}")
    size = path.stat().st_size
    if size > MAX_UPLOAD_BYTES:
        raise DeliveryError(
            f"{path.name} is {size / 1e6:.1f} MB; Telegram bots cap uploads at 50 MB. "
            "Build a smaller deck with --limit."
        )

    fields = {"chat_id": str(chat_id)}
    if caption:
        # Telegram rejects captions over 1024 characters.
        fields["caption"] = caption[:1024]

    body, content_type = _multipart(fields, "document", path)
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendDocument",
        data=body,
        headers={"Content-Type": content_type},
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=180).read()
    except urllib.error.HTTPError as e:
        raise DeliveryError(
            f"sendDocument failed: HTTP {e.code} {e.read().decode('utf-8', 'replace')[:200]}"
        ) from e
    except urllib.error.URLError as e:
        raise DeliveryError(f"sendDocument network error: {e.reason}") from e
