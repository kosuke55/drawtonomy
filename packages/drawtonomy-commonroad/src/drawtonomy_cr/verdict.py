"""
drawtonomy_cr.verdict - writes the official CommonRoad checker's result as a
drawtonomy verdict sidecar.

The only authority on the verdict is the official stack (commonroad-io +
commonroad-drivability-checker). No geometry is reimplemented here (shapely is
not used). This module does exactly three things:

1. Call the four official checks (obstacle_collision / boundary_collision /
   goal_reached / solution_feasible) and record PASS / FAIL from whether they
   raised.
2. The official API only raises, so the colliding time steps and the obstacle
   involved are recovered by applying the official collision checker
   (create_collision_checker plus the same ego collision object solution_checker
   builds) step by step.
3. When solution_feasible fails, the official state_transition_feasibility is
   applied again per transition to report the failing time step range, the limit
   that was hit (steering rate / acceleration / friction circle) and the state
   deviation - the official function only returns a bool per planning problem.

The output schema is `drawtonomy-verdict/1`, specified in
`docs/verdict-sidecar.md`.
"""

import datetime
import json
from pathlib import Path

#: Exit code used when commonroad-drivability-checker is not installed.
CHECKER_MISSING_EXIT_CODE = 3

#: The single line printed when the checker is missing. A failure is reported
#: once, in one place: only the CLI ever prints this string.
CHECKER_MISSING_MESSAGE = (
    "commonroad-drivability-checker is not installed, so the official verdict "
    "cannot be computed. "
    'Install with: pip install "drawtonomy-commonroad[checker]" (Linux x86_64 only) '
    "or run in Docker: docker run --rm --platform linux/amd64 -v \"$PWD:/work\" "
    "cr-verdict drawtonomy-cr verdict /work/scenario.xml /work/solution.xml"
)


#: Marker used to recognise the exception raised when `triangle` (Shewchuk's
#: Triangle), which the official checker uses to triangulate the road for
#: boundary_collision, is not installed. commonroad-dc's `triangulation` raises
#: with "This operation requires a non-free third-party python package triangle
#: ...". Because that license is non-free the package is not a default
#: dependency, and **a missing triangle is a missing tool, not a verdict**, so
#: the check is reported as SKIP rather than FAIL.
TRIANGLE_MARKER = "triangle"

#: The line written into the verdict on SKIP (instead of the long official
#: exception text).
TRIANGLE_MISSING_MESSAGE = (
    "road boundary check skipped: the triangle package is not installed "
    "(pip install triangle; see its license)"
)


class CheckerNotInstalled(Exception):
    """The official drivability checker cannot be imported; the CLI exits 3."""


def checker_available() -> bool:
    """Whether the official checker can be imported. Decided in this one place."""
    import importlib.util

    return importlib.util.find_spec("commonroad_dc") is not None


SCHEMA = "drawtonomy-verdict/1"


def _tool_version() -> str:
    """The drivability checker version. It is the authority on the verdict, so
    the actual installed version is always recorded."""
    import importlib.metadata as md

    try:
        return md.version("commonroad-drivability-checker")
    except Exception:
        return "unknown"


def _is_triangle_missing(exc: BaseException) -> bool:
    """Whether the exception means "`triangle` is not installed". Decided here only.

    The official wording (commonroad_dc.boundary.triangle_builder) is
    "This operation requires a non-free third-party python package triangle ...".
    `ModuleNotFoundError: No module named 'triangle'` is the same missing tool
    and is matched too.
    """
    text = f"{type(exc).__name__}: {exc}".lower()
    return TRIANGLE_MARKER in text and (
        "non-free" in text or "no module named" in text or "not installed" in text
    )


def _run_official_checks(scenario, pps, solution) -> list:
    """The four official checks. An exception becomes FAIL plus its message."""
    from commonroad_dc.feasibility.solution_checker import (
        boundary_collision,
        goal_reached,
        obstacle_collision,
        solution_feasible,
    )

    def _feasible():
        results = solution_feasible(solution, scenario.dt, pps)
        infeasible = [k for k, r in results.items() if not r[0]]
        if infeasible:
            raise Exception(f"infeasible for planning problems {infeasible}")

    checks = []
    for name, fn in (
        ("obstacle_collision", lambda: obstacle_collision(scenario, pps, solution)),
        ("boundary_collision", lambda: boundary_collision(scenario, pps, solution)),
        ("goal_reached", lambda: goal_reached(scenario, pps, solution)),
        ("solution_feasible", _feasible),
    ):
        entry = {"name": name}
        try:
            fn()
            entry["status"] = "PASS"
        except Exception as e:
            if _is_triangle_missing(e):
                # Not judged (a missing tool), which is not the same as "left
                # the road". SKIP in `drawtonomy-verdict/1` exists for exactly
                # this state.
                entry["status"] = "SKIP"
                entry["message"] = TRIANGLE_MISSING_MESSAGE
            else:
                entry["status"] = "FAIL"
                entry["message"] = f"{type(e).__name__}: {e}"
        checks.append(entry)
    return checks


def _ego_collision_object(pps, pp_solution, dt):
    """The same ego collision object solution_checker uses for all four checks.
    Input-vector solutions are integrated by the official code inside it."""
    from commonroad_dc.feasibility.solution_checker import (
        _create_pp_solution_collision_object,
    )

    return _create_pp_solution_collision_object(pps, pp_solution, dt)


def _collision_timing(scenario, pps, solution) -> dict:
    """Recover the colliding [first, last] time steps and the obstacle id using
    the official collision checker.

    `time_slice(t)` gives the scene at step t, which is tested against the ego's
    OBB at the same step. The obstacle is identified by building the official
    collision object of each obstacle and testing it on the colliding steps -
    official object against official object, not reimplemented geometry.
    """
    from commonroad_dc.collision.collision_detection.pycrcc_collision_dispatch import (
        create_collision_checker,
        create_collision_object,
    )

    pp_solution = solution.planning_problem_solutions[0]
    ego = _ego_collision_object(pps, pp_solution, scenario.dt)
    scene = create_collision_checker(scenario)

    hit_steps = []
    for t in range(ego.time_start_idx(), ego.time_end_idx() + 1):
        ego_at_t = ego.obstacle_at_time(t)
        if ego_at_t is None:
            continue
        if scene.time_slice(t).collide(ego_at_t):
            hit_steps.append(t)
    if not hit_steps:
        return {}

    # Identify the obstacle by testing each obstacle's official collision object
    # on the colliding steps only.
    obstacle_id = None
    for obs in list(scenario.dynamic_obstacles) + list(scenario.static_obstacles):
        try:
            obs_co = create_collision_object(obs)
        except Exception:
            continue
        for t in hit_steps:
            ego_at_t = ego.obstacle_at_time(t)
            obs_at_t = (
                obs_co.obstacle_at_time(t)
                if hasattr(obs_co, "obstacle_at_time")
                else obs_co
            )
            if obs_at_t is not None and obs_at_t.collide(ego_at_t):
                obstacle_id = int(obs.obstacle_id)
                break
        if obstacle_id is not None:
            break

    out = {"timeSteps": [hit_steps[0], hit_steps[-1]]}
    if obstacle_id is not None:
        out["obstacleId"] = obstacle_id
    return out


def _boundary_timing(scenario, pps, solution) -> dict:
    """The [first, last] steps of a road boundary collision, borrowing the
    boundary checker the official solution_checker builds. If it cannot be built,
    `timeSteps` is simply omitted (the field is optional)."""
    try:
        from commonroad_dc.feasibility.solution_checker import (
            _construct_boundary_checker,
        )

        pp_solution = solution.planning_problem_solutions[0]
        ego = _ego_collision_object(pps, pp_solution, scenario.dt)
        boundary = _construct_boundary_checker(scenario)
        hit_steps = [
            t
            for t in range(ego.time_start_idx(), ego.time_end_idx() + 1)
            if ego.obstacle_at_time(t) is not None
            and boundary.collide(ego.obstacle_at_time(t))
        ]
        return {"timeSteps": [hit_steps[0], hit_steps[-1]]} if hit_steps else {}
    except Exception:
        return {}


def _rank_reason(reasons) -> str:
    """Pure function picking the one reason reported in the message.

    The most frequently hit limit wins, and **ties are broken by name**. Each
    element of `reasons` is a set, so counting in iteration order and relying on
    `sorted` stability makes ties depend on `PYTHONHASHSEED`: the same input and
    the same checker would then alternate between "acceleration" and
    "friction_circle" between runs, and the verdict JSON was not reproducible.
    The name-order tie-break only removes that wobble; the majority rule itself
    is unchanged.

    If no limit was hit at all the reason is "state_deviation".
    """
    tally: dict[str, int] = {}
    for hit in reasons:
        for name in hit:
            tally[name] = tally.get(name, 0) + 1
    if not tally:
        return "state_deviation"
    # Descending count, then ascending name - neither depends on input order.
    return min(tally.items(), key=lambda kv: (-kv[1], kv[0]))[0]


def _feasibility_detail(scenario, pps, solution) -> dict:
    """The detail behind a solution_feasible FAIL: at which time steps, against
    which limit.

    The official `solution_feasible` only returns a bool per planning problem, so
    the same official function `state_transition_feasibility` is applied again to
    each adjacent pair of states to collect *every* failing transition (the
    official `trajectory_feasibility` stops at the first one). For each
    transition the input u the official code reconstructed is fed to
    `forward_simulation` and this records:
      - whether u sits at the input bounds (`input_bounds`: steering rate /
        acceleration)
      - whether it violates the friction circle (`violates_friction_circle`)
      - by how much the recorded and simulated states differ (position /
        orientation) beyond the official tolerance (2 cm / 0.03 rad)
    Every judgement and every number comes straight from the official API; no
    vehicle model is implemented here.

    Input-vector solutions are integrated and judged by the official code, so for
    those this collects the steps whose input broke a bound or the friction
    circle.
    """
    import numpy as np
    from commonroad.common.solution import TrajectoryType
    from commonroad_dc.feasibility.feasibility_checker import (
        state_transition_feasibility,
    )
    from commonroad_dc.feasibility.vehicle_dynamics import VehicleDynamics

    dt = float(scenario.dt)
    # Default tolerance of the official position_orientation_feasibility_criteria,
    # e=[2e-2, 2e-2, 3e-2].
    pos_tol, yaw_tol = 2e-2, 3e-2

    for pp_solution in solution.planning_problem_solutions:
        vd = VehicleDynamics.from_model(pp_solution.vehicle_model, pp_solution.vehicle_type)
        lb, ub = vd.input_bounds.lb, vd.input_bounds.ub
        is_pm = pp_solution.vehicle_model.name == "PM"
        # Input layout: PM is [a_x, a_y], every other model is
        # [steering rate, acceleration].
        input_names = ("acceleration", "acceleration") if is_pm else ("steering_rate", "acceleration")
        states = pp_solution.trajectory.state_list
        bad_steps, reasons = [], []
        max_pos_err = max_yaw_err = 0.0

        def _note(step, u, x0v, x1v):
            uv = np.asarray(u, dtype=float)
            hit = set()
            for i, name in enumerate(input_names):
                if not (lb[i] + 1e-3 < uv[i] < ub[i] - 1e-3):
                    hit.add(name)
            if vd.violates_friction_circle(x0v, uv):
                hit.add("friction_circle")
            if not vd.input_within_bounds(uv, throw=False):
                hit.add("input_bounds")
            sim = vd.forward_simulation(x0v, uv, dt, throw=False)
            if sim is not None and x1v is not None:
                nonlocal max_pos_err, max_yaw_err
                max_pos_err = max(max_pos_err, float(np.hypot(*(sim[:2] - x1v[:2]))))
                if not is_pm and len(sim) > 4:
                    d = float(sim[4] - x1v[4])
                    d = (d + np.pi) % (2 * np.pi) - np.pi
                    max_yaw_err = max(max_yaw_err, abs(d))
            bad_steps.append(int(step))
            reasons.append(hit)

        if pp_solution.trajectory_type in (TrajectoryType.Input, TrajectoryType.PMInput):
            pp = pps.planning_problem_dict[pp_solution.planning_problem_id]
            xv, _ = vd.state_to_array(pp.initial_state)
            for u in states:
                uv, _ = vd.input_to_array(u)
                ok = vd.input_within_bounds(uv, throw=False) and not vd.violates_friction_circle(xv, uv)
                if not ok:
                    _note(u.time_step, uv, xv, None)
                nxt = vd.forward_simulation(xv, uv, dt, throw=False)
                if nxt is None:
                    break
                xv = nxt
        else:
            for x0, x1 in zip(states[:-1], states[1:]):
                feasible, u = state_transition_feasibility(x0, x1, vd, dt)
                if feasible:
                    continue
                x0v, _ = vd.state_to_array(x0)
                x1v, _ = vd.state_to_array(x1)
                uv, _ = vd.input_to_array(u)
                _note(x1.time_step, uv, x0v, x1v)

        if not bad_steps:
            continue

        # The most frequently hit limit becomes the reason (state deviation when
        # no limit was hit).
        reason = _rank_reason(reasons)
        total = max(len(states) - 1, 1)
        model = pp_solution.vehicle_model.name
        window = f"{bad_steps[0] * dt:.1f}-{bad_steps[-1] * dt:.1f} s"
        n = len(bad_steps)
        s_ = "s" if n == 1 else ""
        if reason == "steering_rate":
            cause = f"need{s_} a steering rate beyond the {model} limit of {ub[0]:g} rad/s"
        elif reason == "acceleration":
            cause = f"need{s_} an acceleration beyond the {model} limit of {ub[1]:g} m/s^2"
        elif reason == "friction_circle":
            cause = f"exceed{s_} the {model} friction circle (a_max {ub[1]:g} m/s^2)"
        elif reason == "input_bounds":
            cause = f"use{s_} inputs outside the {model} input bounds"
        else:
            cause = f"cannot be reproduced by the {model} model"
        drift = f"position drifts up to {max_pos_err * 100:.1f} cm from the simulated state (tolerance {pos_tol * 100:g} cm)"
        if not is_pm and max_yaw_err > 0:
            drift += f", orientation up to {max_yaw_err:.3f} rad (tolerance {yaw_tol:g})"
        message = (
            f"{n} of {total} state transition{'' if total == 1 else 's'} ({window}) {cause}; {drift}."
        )
        out = {
            "timeSteps": [bad_steps[0], bad_steps[-1]],
            "message": message,
            "planningProblemId": int(pp_solution.planning_problem_id),
            "reason": reason,
            "infeasibleTransitions": n,
            "transitions": total,
            "maxPositionError": round(max_pos_err, 4),
        }
        if not is_pm:
            out["maxOrientationError"] = round(max_yaw_err, 4)
            out["steeringRateLimit"] = float(ub[0])
        out["accelerationLimit"] = float(ub[1])
        return out
    return {}


def build_verdict(scenario_path: Path, solution_path: Path) -> dict:
    """Build the verdict sidecar. Pure: writing it is the caller's job."""
    if not checker_available():
        raise CheckerNotInstalled(CHECKER_MISSING_MESSAGE)

    from commonroad.common.file_reader import CommonRoadFileReader
    from commonroad.common.solution import CommonRoadSolutionReader

    scenario, pps = CommonRoadFileReader(str(scenario_path)).open()
    solution = CommonRoadSolutionReader.open(str(solution_path))

    checks = _run_official_checks(scenario, pps, solution)
    by_name = {c["name"]: c for c in checks}

    if by_name["obstacle_collision"]["status"] == "FAIL":
        by_name["obstacle_collision"].update(_collision_timing(scenario, pps, solution))
    if by_name["boundary_collision"]["status"] == "FAIL":
        by_name["boundary_collision"].update(_boundary_timing(scenario, pps, solution))
    if by_name["solution_feasible"]["status"] == "FAIL":
        try:
            by_name["solution_feasible"].update(_feasibility_detail(scenario, pps, solution))
        except Exception as e:  # keep the official PASS/FAIL even without detail
            by_name["solution_feasible"]["detailError"] = f"{type(e).__name__}: {e}"
    if solution.planning_problem_solutions:
        by_name["solution_feasible"]["vehicleModel"] = (
            solution.planning_problem_solutions[0].vehicle_model.name
        )

    return {
        "schema": SCHEMA,
        "benchmarkId": solution.benchmark_id,
        "scenarioId": str(scenario.scenario_id),
        "dt": float(scenario.dt),
        "tool": {
            "name": "commonroad-drivability-checker",
            "version": _tool_version(),
        },
        "generatedAt": datetime.datetime.now(datetime.timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z"),
        "checks": checks,
    }


def write_verdict(scenario_path: Path, solution_path: Path, out_path: Path) -> dict:
    """Build the verdict and write it as JSON. This is also the entry point the
    example planner in `examples/reactive_planner/run_planner.py` calls."""
    verdict = build_verdict(scenario_path, solution_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(verdict, indent=2) + "\n", encoding="utf-8")
    return verdict


