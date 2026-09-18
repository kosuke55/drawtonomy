"""Input identity and immutable-reader regression tests, without the checker extra."""
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from drawtonomy_cr import verdict


@pytest.mark.parametrize("raw", [b"abc", b"\xef\xbb\xbfabc"])
def test_known_sha256_vector(raw):
    assert verdict._input_fingerprint(raw) == (
        "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    )


@pytest.mark.parametrize("ending", ["\n", "\r\n", "\r"])
def test_unicode_and_line_endings(ending):
    canonical = "<scenario>道路🚗\n</scenario>\n"
    raw = ("\ufeff" + canonical.replace("\n", ending)).encode("utf-8")
    assert verdict._input_fingerprint(raw) == "sha256:" + hashlib.sha256(
        canonical.encode("utf-8")
    ).hexdigest()


def test_content_whitespace_and_final_newline_are_significant():
    values = [b"<s x='1'/>", b"<s x='2'/>", b"<s  x='1'/>", b"<s x='1'/>\n"]
    assert len({verdict._input_fingerprint(raw) for raw in values}) == len(values)


def test_only_one_bom_is_removed_and_invalid_utf8_is_rejected():
    bom = b"\xef\xbb\xbf"
    assert verdict._input_fingerprint(bom + bom + b"abc") != verdict._input_fingerprint(b"abc")
    with pytest.raises(UnicodeDecodeError):
        verdict._input_fingerprint(b"\xff")


#: The contract's four ordinary shapes of the same document. Every one of them
#: must reduce to the identical fingerprint, because the normalization is the
#: only thing standing between "the user saved this on Windows" and the app
#: refusing the verdict as a mismatched input.
BOM = b"\xef\xbb\xbf"
CANONICAL = b"<solution>\n  <state/>\n</solution>\n"


@pytest.mark.parametrize(
    "name,raw",
    [
        ("no bom, lf", CANONICAL),
        ("one bom, lf", BOM + CANONICAL),
        ("no bom, crlf", CANONICAL.replace(b"\n", b"\r\n")),
        ("one bom, crlf", BOM + CANONICAL.replace(b"\n", b"\r\n")),
        ("no bom, lone cr", CANONICAL.replace(b"\n", b"\r")),
        ("one bom, lone cr", BOM + CANONICAL.replace(b"\n", b"\r")),
    ],
)
def test_one_bom_and_every_line_ending_reduce_to_the_same_fingerprint(name, raw):
    assert verdict._input_fingerprint(raw) == verdict._input_fingerprint(CANONICAL), name


def test_two_leading_boms_are_a_known_divergence_from_the_browser():
    """A second BOM is content here, and is not in the app's browser reader.

    The app reads the dropped file with `File.text()`, which removes one UTF-8
    BOM, and then removes one more U+FEFF while normalizing - so a file starting
    with two BOMs loses both there and only one here. This is documented rather
    than emulated: the double BOM is not a shape real CommonRoad files take, and
    matching it would mean the SDK could not reproduce the hash of a file whose
    content legitimately begins with U+FEFF.
    """
    assert verdict._input_fingerprint(BOM + BOM + CANONICAL) != verdict._input_fingerprint(
        BOM + CANONICAL
    )
    # What the app would arrive at for that input, for the record.
    assert verdict._input_fingerprint(BOM + CANONICAL) == verdict._input_fingerprint(
        CANONICAL
    )


@pytest.mark.parametrize("fail_reader", [False, True])
def test_readers_use_captured_bytes_and_temporary_files_are_cleaned(monkeypatch, tmp_path, fail_reader):
    from commonroad.common.solution import CommonRoadSolutionReader

    scenario_path, solution_path = tmp_path / "scene.xml", tmp_path / "solution.xml"
    scenario_raw = b"\xef\xbb\xbf<scenario>original</scenario>\r\n"
    solution_raw = b"<solution>original</solution>\r"
    scenario_path.write_bytes(scenario_raw)
    solution_path.write_bytes(solution_raw)
    seen = []

    class Reader:
        def __init__(self, path):
            self.path = Path(path)
            # Both inputs must already be captured before either parser opens.
            scenario_path.write_bytes(b"new scenario")
            solution_path.write_bytes(b"new solution")

        def open(self):
            seen.append(self.path)
            assert self.path.read_bytes() == scenario_raw
            if fail_reader:
                raise ValueError("reader failed")
            return SimpleNamespace(scenario_id="same-id", dt=0.1), None

    def read_solution(path):
        path = Path(path)
        seen.append(path)
        assert path.read_bytes() == solution_raw
        return SimpleNamespace(benchmark_id="same-id", planning_problem_solutions=[])

    checks = [{"name": name, "status": "PASS"} for name in (
        "solved_all_problems", "goal_reached", "starts_at_correct_state",
        "obstacle_collision", "boundary_collision", "ego_collision", "solution_feasible",
    )]
    monkeypatch.setattr(verdict, "checker_available", lambda: True)
    monkeypatch.setattr("commonroad.common.file_reader.CommonRoadFileReader", Reader)
    monkeypatch.setattr(CommonRoadSolutionReader, "open", read_solution)
    monkeypatch.setattr(verdict, "_run_official_checks", lambda *args: checks)
    output = tmp_path / "result.json"
    if fail_reader:
        with pytest.raises(ValueError, match="reader failed"):
            verdict.write_verdict(scenario_path, solution_path, output)
        assert not output.exists()
    else:
        result = verdict.write_verdict(scenario_path, solution_path, output)
        assert json.loads(output.read_text()) == result
        assert result["schema"] == "drawtonomy-verdict/1"
        assert result["checks"] == checks
        assert result["scenarioFingerprint"] == verdict._input_fingerprint(scenario_raw)
        assert result["solutionFingerprint"] == verdict._input_fingerprint(solution_raw)
        assert result["scenarioFingerprint"] != verdict._input_fingerprint(scenario_path.read_bytes())
        assert result["solutionFingerprint"] != verdict._input_fingerprint(solution_path.read_bytes())
    assert seen
    assert all(not path.exists() and not path.parent.exists() for path in seen)
