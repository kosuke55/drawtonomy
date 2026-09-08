"""The IDM example planner (`examples/idm_planner/idm_planner.py`) must keep
running on the bundled cut-in scenario and keep producing the hand-off files
the README promises: a solution XML commonroad-io can read back, and a
planning trace that passes TraceWriter's own self-check with the declared
BMW_320i body. It is the example most people will copy, so it must not rot.
"""

import importlib.util
import json
from pathlib import Path

import pytest

EXAMPLE = Path(__file__).resolve().parents[1] / "examples" / "idm_planner" / "idm_planner.py"


@pytest.fixture(scope="module")
def idm_planner():
    pytest.importorskip("commonroad")
    spec = importlib.util.spec_from_file_location("idm_planner", EXAMPLE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def run(idm_planner, fixtures, out_dir, mode):
    scenario = str(fixtures / "cutin_commonroad.xml")
    assert idm_planner.main([scenario, str(out_dir), "--mode", mode, "--name", mode]) == 0
    return out_dir / f"{mode}.xml", out_dir / f"{mode}.planning-trace.json"


def test_idm_writes_a_readable_solution_and_a_trace(idm_planner, fixtures, tmp_path):
    from commonroad.common.solution import CommonRoadSolutionReader, VehicleType

    solution_path, trace_path = run(idm_planner, fixtures, tmp_path, "idm")
    solution = CommonRoadSolutionReader.open(str(solution_path))
    pp = solution.planning_problem_solutions[0]
    assert pp.vehicle_type is VehicleType.BMW_320i
    assert pp.trajectory.initial_time_step == 1

    trace = json.loads(trace_path.read_text())
    track = trace["tracks"][0]
    assert trace["frame"] == "center"
    assert track["vehicle"] == {"length": 4.508, "width": 1.61,
                                "refToCenter": 1.4227, "type": "BMW_320i"}
    assert len(track["driven"]) == len(pp.trajectory.state_list)
    assert track["plans"]


def test_idm_slows_down_behind_the_leader_and_naive_does_not(idm_planner, fixtures, tmp_path):
    _, idm_trace = run(idm_planner, fixtures, tmp_path / "idm", "idm")
    _, naive_trace = run(idm_planner, fixtures, tmp_path / "naive", "naive")
    idm_v = [s["v"] for s in json.loads(idm_trace.read_text())["tracks"][0]["driven"]]
    naive_v = [s["v"] for s in json.loads(naive_trace.read_text())["tracks"][0]["driven"]]
    assert min(naive_v) == max(naive_v) == 30.0
    assert idm_v[0] == 30.0 and idm_v[-1] < 1.0


def test_no_trace_flag_writes_only_the_solution(idm_planner, fixtures, tmp_path):
    scenario = str(fixtures / "cutin_commonroad.xml")
    assert idm_planner.main([scenario, str(tmp_path), "--no-trace"]) == 0
    assert (tmp_path / "planner_solution.xml").is_file()
    assert not (tmp_path / "planner_solution.planning-trace.json").exists()


@pytest.mark.parametrize("mode", ["idm", "naive"])
def test_committed_straight_fixtures_are_what_the_example_writes(idm_planner, fixtures, tmp_path, mode):
    """`fixtures/straight_<mode>_solution.*` are the example's own output on
    `straight_commonroad.xml` (a straight road with a slower leader
    ahead of the ego). They are served as the demo links in the README, so
    they must stay reproducible from the planner they claim to come from."""
    from commonroad.common.solution import CommonRoadSolutionReader

    scenario = str(fixtures / "straight_commonroad.xml")
    assert idm_planner.main([scenario, str(tmp_path), "--mode", mode, "--name", mode]) == 0
    fresh = CommonRoadSolutionReader.open(str(tmp_path / f"{mode}.xml"))
    committed = CommonRoadSolutionReader.open(str(fixtures / f"straight_{mode}_solution.xml"))
    fresh_states = fresh.planning_problem_solutions[0].trajectory.state_list
    committed_states = committed.planning_problem_solutions[0].trajectory.state_list
    assert len(fresh_states) == len(committed_states) == 180
    for a, b in zip(fresh_states, committed_states):
        assert a.time_step == b.time_step
        assert abs(a.position[0] - b.position[0]) < 1e-6
        assert abs(a.position[1] - b.position[1]) < 1e-6
        assert abs(a.velocity - b.velocity) < 1e-6

    fresh_trace = json.loads((tmp_path / f"{mode}.planning-trace.json").read_text())
    committed_trace = json.loads((fixtures / f"straight_{mode}_solution.planning-trace.json").read_text())
    assert fresh_trace["tracks"] == committed_trace["tracks"]

    verdict = json.loads((fixtures / f"straight_{mode}_solution.verdict.json").read_text())
    assert verdict["scenarioId"] == "ZAM_Untitled202609080119-1_1_T-1"
    statuses = {c["name"]: c["status"] for c in verdict["checks"]}
    if mode == "idm":
        assert statuses == {"obstacle_collision": "PASS", "boundary_collision": "PASS",
                            "goal_reached": "PASS", "solution_feasible": "PASS"}
    else:
        assert statuses["obstacle_collision"] == "FAIL"
