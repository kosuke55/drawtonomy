"""The shared input fingerprint.

`drawtonomy_cr.fingerprint` is the single implementation behind the verdict
sidecar's `solutionFingerprint` / `scenarioFingerprint` and the planning
trace's. The point of the move was that the two can never drift apart, so what
is pinned here is that they are literally the same function.
"""
import hashlib

import pytest

from drawtonomy_cr import verdict
from drawtonomy_cr.fingerprint import fingerprint, is_fingerprint


def test_verdict_uses_the_shared_implementation():
    assert verdict._input_fingerprint is fingerprint


@pytest.mark.parametrize("raw", [b"abc", b"\xef\xbb\xbfabc"])
def test_known_sha256_vector(raw):
    assert fingerprint(raw) == (
        "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    )


@pytest.mark.parametrize("ending", ["\n", "\r\n", "\r"])
def test_line_endings_and_one_bom_normalize(ending):
    canonical = "<scenario>road\n</scenario>\n"
    raw = ("﻿" + canonical.replace("\n", ending)).encode("utf-8")
    assert fingerprint(raw) == "sha256:" + hashlib.sha256(
        canonical.encode("utf-8")
    ).hexdigest()


def test_shape_is_sha256_plus_64_lowercase_hex():
    value = fingerprint(b"abc")
    assert is_fingerprint(value)
    assert not is_fingerprint("sha256:" + "A" * 64)  # uppercase is not the form
    assert not is_fingerprint("sha256:" + "a" * 63)
    assert not is_fingerprint(None)
