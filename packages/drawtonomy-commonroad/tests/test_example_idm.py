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
