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
    # The solution starts at the planning problem's initial state, which is what
    # the official starts_at_correct_state requires.
    assert pp.trajectory.initial_time_step == 0

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
    # The committed fixtures were written before the example started at step 0,
    # so they are exactly the fresh solution's tail from step 1 on. They are
    # deliberately left as they are: their PASS / FAIL statuses come from the
    # official checker and cannot be recomputed without it. Everything they do
    # cover - the whole driven profile - is still compared here.
    assert len(committed_states) == 180
    assert len(fresh_states) == 181
    assert fresh_states[0].time_step == 0
    for a, b in zip(fresh_states[1:], committed_states):
        assert a.time_step == b.time_step
        assert abs(a.position[0] - b.position[0]) < 1e-6
        assert abs(a.position[1] - b.position[1]) < 1e-6
        assert abs(a.velocity - b.velocity) < 1e-6

    fresh_trace = json.loads((tmp_path / f"{mode}.planning-trace.json").read_text())
    committed_trace = json.loads((fixtures / f"straight_{mode}_solution.planning-trace.json").read_text())
    # Same story for the trace: the fresh one carries the step-0 state (and one
    # more plan, issued at t=0) that the committed one predates.
    fresh_driven = fresh_trace["tracks"][0]["driven"]
    committed_driven = committed_trace["tracks"][0]["driven"]
    assert len(fresh_driven) == len(committed_driven) + 1
    assert fresh_driven[1:] == committed_driven
    assert fresh_trace["tracks"][0]["vehicle"] == committed_trace["tracks"][0]["vehicle"]

    verdict = json.loads((fixtures / f"straight_{mode}_solution.verdict.json").read_text())
    assert verdict["scenarioId"] == "ZAM_Untitled202609080119-1_1_T-1"
    statuses = {c["name"]: c["status"] for c in verdict["checks"]}
    if mode == "idm":
        assert statuses == {"obstacle_collision": "PASS", "boundary_collision": "PASS",
                            "goal_reached": "PASS", "solution_feasible": "PASS"}
    else:
        assert statuses["obstacle_collision"] == "FAIL"


# --- the official starts_at_correct_state rule ----------------------------


def _official_starts_at_correct_state(solution, planning_problem_set):
    """The body of `commonroad_dc.feasibility.solution_checker.
    starts_at_correct_state`, copied verbatim.

    It is copied rather than imported because the official module imports
    `commonroad_dc.pycrcc`, whose wheels are Linux x86_64 only - but this rule
    itself is pure Python over commonroad-io objects and needs none of that. So
    the example can be held to the real rule everywhere the tests run.

    Raises with the official message when the first solution state is not the
    planning problem's initial state; returns True otherwise.
    """
    import math

    import numpy as np
    from commonroad.common.solution import TrajectoryType, VehicleModel

    for pp_solution in solution.planning_problem_solutions:
        planning_problem = planning_problem_set.planning_problem_dict[
            pp_solution.planning_problem_id
        ]
        is_input_vector = pp_solution.trajectory_type in [
            TrajectoryType.Input,
            TrajectoryType.PMInput,
        ]
        initial_state_pp = planning_problem.initial_state
        initial_state_sol = pp_solution.trajectory.state_list[0]

        ts = initial_state_sol.time_step
        expected_ts = [initial_state_pp.time_step]

        if is_input_vector:
            if ts not in expected_ts:
                raise AssertionError(
                    f"input vector does not start at the correct time step: "
                    f"expected {expected_ts}, got {ts}"
                )
        else:
            for attr in initial_state_pp.attributes:
                if not hasattr(initial_state_sol, attr):
                    continue

                solution_attr_tmp = getattr(initial_state_sol, attr)
                if pp_solution.vehicle_model == VehicleModel.PM:
                    if attr == "orientation":
                        solution_attr_tmp = math.atan2(
                            initial_state_sol.velocity_y, initial_state_sol.velocity
                        )
                    elif attr == "velocity":
                        solution_attr_tmp = math.sqrt(
                            initial_state_sol.velocity_y**2 + initial_state_sol.velocity**2
                        )

                # The official tolerances: 2.0 on velocity (motion primitives),
                # 0.1 on everything else, position included.
                atol = 2.0 if attr == "velocity" else 0.1

                if not np.allclose(
                    getattr(initial_state_pp, attr), solution_attr_tmp, atol=atol
                ):
                    raise AssertionError(
                        f"solution does not start at the initial state of planning "
                        f"problem {pp_solution.planning_problem_id}: expected "
                        f"{attr}={getattr(initial_state_pp, attr)}, received "
                        f"{attr}={solution_attr_tmp}"
                    )
    return True


@pytest.mark.parametrize("scenario_name", ["cutin_commonroad.xml", "straight_commonroad.xml"])
@pytest.mark.parametrize("mode", ["idm", "naive"])
def test_example_solution_starts_at_the_planning_problem_initial_state(
    idm_planner, fixtures, tmp_path, scenario_name, mode
):
    """The example must pass the official `starts_at_correct_state`.

    A CommonRoad solution is rejected by commonroad.in.tum.de - and reported as
    FAIL by `drawtonomy-cr verdict` - when its first state is not the planning
    problem's initial state. The example used to drop that state and start at
    step 1, so every solution it wrote failed this check. The example is the one
    most people copy, so it has to be correct on the point the official checker
    is strictest about.
    """
    from commonroad.common.file_reader import CommonRoadFileReader
    from commonroad.common.solution import CommonRoadSolutionReader

    import numpy as np

    scenario_path = fixtures / scenario_name
    assert idm_planner.main([str(scenario_path), str(tmp_path), "--mode", mode, "--name", mode]) == 0

    _, pps = CommonRoadFileReader(str(scenario_path)).open()
    solution = CommonRoadSolutionReader.open(str(tmp_path / f"{mode}.xml"))

    # The rule itself, verbatim.
    assert _official_starts_at_correct_state(solution, pps) is True

    # And the two things it turns on, spelled out so a failure says which:
    pp_solution = solution.planning_problem_solutions[0]
    first = pp_solution.trajectory.state_list[0]
    initial = pps.planning_problem_dict[pp_solution.planning_problem_id].initial_state
    assert first.time_step == initial.time_step
    assert pp_solution.trajectory.initial_time_step == initial.time_step
    gap = float(np.linalg.norm(np.asarray(first.position) - np.asarray(initial.position)))
    assert gap < 0.1, f"first solution state is {gap:.3f} m from the initial state"


def test_the_official_rule_would_catch_a_solution_that_starts_one_step_late(
    idm_planner, fixtures, tmp_path
):
    """The rule above is a real check, not one that passes on anything.

    The committed fixtures are the example's old 1-based output, so they are the
    exact shape the rule has to reject. This pins that it does - otherwise a
    future regression back to `state_list[1:]` would slip through.
    """
    from commonroad.common.file_reader import CommonRoadFileReader
    from commonroad.common.solution import CommonRoadSolutionReader

    _, pps = CommonRoadFileReader(str(fixtures / "straight_commonroad.xml")).open()
    old = CommonRoadSolutionReader.open(str(fixtures / "straight_idm_solution.xml"))
    assert old.planning_problem_solutions[0].trajectory.initial_time_step == 1
    with pytest.raises(AssertionError, match="does not start at the initial state"):
        _official_starts_at_correct_state(old, pps)
