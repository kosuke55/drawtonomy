"""The fingerprints on the committed traces name the right files.

A fingerprint is a claim: "my driven states are that solution". Nothing about
the value shows whether the claim is true, so it is re-derived here from the
committed XML and the claim itself is re-run - the same 1e-6 m comparison
`TraceWriter.write` makes before it agrees to write one.
"""
import json
import sys

import pytest

from drawtonomy_cr.fingerprint import fingerprint, is_fingerprint
from drawtonomy_cr.trace import _position, _solution_states

sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent / "fixtures"))
from add_fingerprints import PAIRS  # noqa: E402


@pytest.mark.parametrize("trace_name", sorted(PAIRS))
def test_the_committed_values_are_the_fingerprints_of_the_named_files(
    fixtures, trace_name
):
    solution_name, scenario_name = PAIRS[trace_name]
    trace = json.loads((fixtures / trace_name).read_text(encoding="utf-8"))
    assert trace["solutionFingerprint"] == fingerprint(
        (fixtures / solution_name).read_bytes()
    )
    assert trace["scenarioFingerprint"] == fingerprint(
        (fixtures / scenario_name).read_bytes()
    )
    assert is_fingerprint(trace["solutionFingerprint"])
    assert is_fingerprint(trace["scenarioFingerprint"])


@pytest.mark.parametrize("trace_name", sorted(PAIRS))
def test_the_driven_states_really_are_that_solution(fixtures, trace_name):
    """The check the writer would have made. A fixture whose fingerprint names
    a solution it does not replay is worse than one with no fingerprint: the app
    would show the pair as verified."""
    solution_name, _ = PAIRS[trace_name]
    trace = json.loads((fixtures / trace_name).read_text(encoding="utf-8"))
    driven = trace["tracks"][0]["driven"]
    solution_states = _solution_states(fixtures / solution_name)

    assert len(driven) == len(solution_states), trace_name
    worst = 0.0
    for state, reference in zip(driven, solution_states):
        x, y = _position(reference)
        worst = max(worst, abs(state["x"] - x), abs(state["y"] - y))
    assert worst <= 1e-6, f"{trace_name}: worst position diff {worst:.3e} m"


def test_the_scenario_id_agrees_with_the_scenario_that_was_fingerprinted(fixtures):
    """A trace naming a scenario id and fingerprinting a different file would
    pass both tests above and still be wrong."""
    ids = {
        "cutin_commonroad.xml": "ZAM_Untitled202609011139-1_1_T-1",
        "straight_commonroad.xml": "ZAM_Untitled202609080119-1_1_T-1",
    }
    for trace_name, (_, scenario_name) in PAIRS.items():
        trace = json.loads((fixtures / trace_name).read_text(encoding="utf-8"))
        assert trace["scenario"] == ids[scenario_name], trace_name


def test_the_openscenario_fixture_stays_unfingerprinted(fixtures):
    """`cutin_openscenario` has no CommonRoad solution behind it. It is the
    older-trace case the app has to keep loading and showing as unchecked, so it
    must not acquire a fingerprint by accident."""
    trace = json.loads(
        (fixtures / "cutin_openscenario.planning-trace.json").read_text(encoding="utf-8")
    )
    assert "solutionFingerprint" not in trace
    assert "scenarioFingerprint" not in trace


def test_the_patch_script_is_idempotent(fixtures, capsys):
    """`--check` is what says the committed values are current."""
    from add_fingerprints import main

    sys.argv = ["add_fingerprints.py", "--check"]
    assert main() == 0
    assert "[SET]" not in capsys.readouterr().out
