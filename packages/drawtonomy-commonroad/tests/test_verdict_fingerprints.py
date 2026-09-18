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
