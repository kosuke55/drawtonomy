"""
drawtonomy_cr.fingerprint - the one input fingerprint used across the package.

A fingerprint names the bytes a result was computed from. The verdict sidecar
records the scenario and solution it judged; a planning trace records the
solution its `driven` states reproduce. The app compares the two, so the
normalization has to be identical everywhere, which is why it lives in one
module rather than being repeated per writer.

    from drawtonomy_cr.fingerprint import fingerprint

    fingerprint(Path("solution.xml").read_bytes())
    # 'sha256:4241...'

Normalization, matching `docs/verdict-sidecar.md`:

  * decode as UTF-8, removing one leading byte order mark;
  * `\r\n` and lone `\r` become `\n`;
  * SHA-256 of the resulting UTF-8 bytes, as `sha256:` + 64 lowercase hex.

It is not XML canonicalization: whitespace, attribute order and comments all
change the value. It detects a mixed-up input file, it is not a signature.
"""

import hashlib
import re

#: What a written fingerprint looks like, for readers that validate one.
FINGERPRINT_PATTERN = r"^sha256:[0-9a-f]{64}$"

_FINGERPRINT_RE = re.compile(FINGERPRINT_PATTERN)


def fingerprint(raw: bytes) -> str:
    """SHA-256 of UTF-8 text, without one leading BOM, with LF line endings."""
    text = raw.decode("utf-8-sig").replace("\r\n", "\n").replace("\r", "\n")
    return "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()


def is_fingerprint(value) -> bool:
    """True when `value` has the shape a fingerprint field must have."""
    return isinstance(value, str) and _FINGERPRINT_RE.match(value) is not None
