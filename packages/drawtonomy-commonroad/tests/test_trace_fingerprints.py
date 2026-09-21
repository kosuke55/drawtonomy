"""`solutionFingerprint` / `scenarioFingerprint` on a planning trace.

The contract, from `docs/planning-trace-format.md`:

  * `solutionFingerprint` appears only when `write(solution=...)` was given a
    file (or bytes) **and** self-check (a) passed. The trace is then claiming
    "my driven states are that solution", backed by the check that just proved
    it.
  * `scenarioFingerprint` appears whenever `write(scenario=...)` was given one.
    Nothing is checked against the scenario; it names the run's input.
  * Neither is required. A trace without them loads exactly as before.
"""
import json

import pytest

from drawtonomy_cr.fingerprint import fingerprint
from drawtonomy_cr.trace import TraceSelfCheckError, TraceWriter


def straight_states(n=5):
    return [
        {"time_step": i, "x": 1.0 * i, "y": 2.0, "orientation": 0.0, "velocity": 10.0}
        for i in range(n)
    ]


def make_trace(tmp_path, states=None, **write_kwargs):
    """A one-plan trace over `states` (five straight states by default)."""
    states = straight_states() if states is None else states
    w = TraceWriter(dt=0.1, vehicle={"length": 4.5, "width": 1.8})
    w.plan(states=states)
    w.driven(states)
    out = tmp_path / "solution.planning-trace.json"
    w.write(out, verbose=False, **write_kwargs)
    return json.loads(out.read_text(encoding="utf-8"))


@pytest.fixture
def solution_of(fixtures):
    """The driven states of a committed solution XML, so a trace built from
    them really is that solution and self-check (a) passes."""
    from drawtonomy_cr.trace import _solution_states

    def load(name):
        return _solution_states(fixtures / name)

    return load


# --- the values written ---------------------------------------------------


def test_solution_path_is_fingerprinted(tmp_path, fixtures, solution_of):
    solution = fixtures / "planner_solution.xml"
    trace = make_trace(
        tmp_path, states=solution_of("planner_solution.xml"), solution=solution
    )
    assert trace["solutionFingerprint"] == fingerprint(solution.read_bytes())


def test_scenario_path_is_fingerprinted(tmp_path, fixtures):
    scenario = fixtures / "cutin_commonroad.xml"
    trace = make_trace(tmp_path, scenario=scenario)
    assert trace["scenarioFingerprint"] == fingerprint(scenario.read_bytes())


def test_bytes_are_accepted_for_both(tmp_path, fixtures, solution_of):
    solution = (fixtures / "planner_solution.xml").read_bytes()
    scenario = (fixtures / "cutin_commonroad.xml").read_bytes()
    trace = make_trace(
        tmp_path,
        states=solution_of("planner_solution.xml"),
        solution=solution,
        scenario=scenario,
    )
    assert trace["solutionFingerprint"] == fingerprint(solution)
    assert trace["scenarioFingerprint"] == fingerprint(scenario)


def test_the_scenario_needs_no_check_of_its_own(tmp_path, fixtures):
    """A scenario fingerprint is written even though the trace's states were
    never compared against it: it names the input, it does not claim it."""
    trace = make_trace(tmp_path, scenario=fixtures / "straight_commonroad.xml")
    assert "scenarioFingerprint" in trace
    assert "solutionFingerprint" not in trace


# --- when nothing is written ----------------------------------------------


def test_absent_when_nothing_is_passed(tmp_path):
    trace = make_trace(tmp_path)
    assert "solutionFingerprint" not in trace
    assert "scenarioFingerprint" not in trace


def test_absent_and_warned_when_self_check_a_is_skipped(tmp_path):
    """A state list passes self-check (a) but has no bytes, so there is nothing
    to name. The caller is told rather than left with a silently unverifiable
    trace."""
    states = straight_states()
    with pytest.warns(UserWarning, match="without solutionFingerprint"):
        trace = make_trace(tmp_path, solution=states)
    assert "solutionFingerprint" not in trace


def test_absent_and_warned_for_a_solution_object(tmp_path):
    class FakeSolution:
        state_list = straight_states()

    with pytest.warns(UserWarning, match="has no file bytes"):
        trace = make_trace(tmp_path, solution=FakeSolution())
    assert "solutionFingerprint" not in trace


def test_no_file_at_all_when_self_check_fails(tmp_path, fixtures):
    """The fingerprint is written after the check, so a failing check leaves no
    trace claiming a solution it does not match."""
    w = TraceWriter(dt=0.1)
    w.plan(t=0.0, states=straight_states())
    w.driven(straight_states())
    out = tmp_path / "solution.planning-trace.json"
    with pytest.raises(TraceSelfCheckError):
        w.write(out, solution=straight_states(n=4), verbose=False)
    assert not out.exists()


# --- parity with the value the app compares against -----------------------


def test_value_equals_the_app_verdicts_solution_fingerprint(
    tmp_path, fixtures, solution_of
):
    """This is the whole point of the field: the number a trace writes and the
    number a verdict of the same solution carries have to be the same string,
    or drawtonomy shows the pair as unchecked."""
    solution = fixtures / "planner_solution.xml"
    verdict = json.loads(
        (fixtures / "planner_solution.verdict.json").read_text(encoding="utf-8")
    )
    trace = make_trace(
        tmp_path, states=solution_of("planner_solution.xml"), solution=solution
    )
    assert trace["solutionFingerprint"] == verdict["solutionFingerprint"]


def test_scenario_value_equals_the_verdicts_scenario_fingerprint(tmp_path, fixtures):
    scenario = fixtures / "cutin_commonroad.xml"
    verdict = json.loads(
        (fixtures / "planner_solution.verdict.json").read_text(encoding="utf-8")
    )
    trace = make_trace(tmp_path, scenario=scenario)
    assert trace["scenarioFingerprint"] == verdict["scenarioFingerprint"]
