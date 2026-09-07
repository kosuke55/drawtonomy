#!/usr/bin/env python3
"""
idm_planner.py - THIS IS AN EXAMPLE. The smallest planner that can be connected.

A self-written longitudinal planner in one file: commonroad-io + numpy, no
planner framework, no drivability checker. The ego stays on the centreline of
the lanelet it starts on and only its speed is planned:

  --mode idm    IDM car-following on the nearest vehicle ahead in the lane
  --mode naive  hold the initial speed and ignore everything (for comparison:
                on a scenario with a slower leader this one collides)

Read it for the hand-off, not for the planning: the last 30 lines (solution
XML, then the optional planning trace) are the whole contract with drawtonomy
and do not depend on how the trajectory was produced.

Usage:
    python3 idm_planner.py scenario.xml out_dir [--mode idm|naive] [--name planner_solution]

Then, on Linux x86_64 or in Docker:
    drawtonomy-cr verdict scenario.xml out_dir/planner_solution.xml
    drawtonomy-cr open out_dir
"""

import argparse
import math
import sys
from pathlib import Path

import numpy as np
from commonroad.common.file_reader import CommonRoadFileReader
from commonroad.common.solution import (
    CommonRoadSolutionWriter,
    CostFunction,
    PlanningProblemSolution,
    Solution,
    VehicleModel,
    VehicleType,
)
from commonroad.scenario.state import KSState
from commonroad.scenario.trajectory import Trajectory

# The body the solution declares (VehicleType.BMW_320i, CommonRoad parameter
# set 2). The official checker judges collisions with this body, so the trace
# below repeats the same numbers and drawtonomy draws what the checker saw.
EGO_TYPE = VehicleType.BMW_320i
EGO_LENGTH = 4.508
EGO_WIDTH = 1.610
EGO_REF_TO_CENTER = 1.4227  # rear axle centre -> body centre

# IDM parameters (Treiber et al.), plus the KS model's official a_max
IDM_A = 1.5       # comfortable acceleration [m/s^2]
IDM_B = 2.0       # comfortable deceleration [m/s^2]
IDM_T = 1.5       # desired time headway [s]
IDM_S0 = 2.0      # standstill gap [m]
IDM_DELTA = 4.0
A_MAX = 11.5


# --- PLANNER-SPECIFIC ----------------------------------------------------
# Everything down to the hand-off is this planner's own business.


def build_route(scenario, planning_problem):
    """Centreline polyline of the lanelet the ego starts on, extended through
    successors when the network has them (scenarios exported from drawtonomy
    have none: their lanes are only adjacent, never chained)."""
    network = scenario.lanelet_network
    start = np.asarray(planning_problem.initial_state.position, dtype=float)
    hits = network.find_lanelet_by_position([start])[0]
    if not hits:
        # not inside any lanelet: take the one whose centreline is closest
        hits = [min(network.lanelets, key=lambda l: np.linalg.norm(
            np.asarray(l.center_vertices) - start, axis=1).min()).lanelet_id]
    lanelet = network.find_lanelet_by_id(hits[0])
    verts = np.asarray(lanelet.center_vertices, dtype=float)
    seen = {lanelet.lanelet_id}
    while lanelet.successor and lanelet.successor[0] not in seen:
        lanelet = network.find_lanelet_by_id(lanelet.successor[0])
        seen.add(lanelet.lanelet_id)
        verts = np.vstack([verts, np.asarray(lanelet.center_vertices, dtype=float)[1:]])
    return verts


def arclength(verts):
    return np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(verts, axis=0), axis=1))])


def project(verts, s_cum, point):
    """(arclength, lateral distance) of the closest point on the polyline.

    Project onto the segments, not the vertices: a straight lane exported from
    drawtonomy is a 2-point polyline, so the nearest vertex can be 100 m away.
    """
    p = np.asarray(point, dtype=float)
    a = verts[:-1]
    ab = verts[1:] - a
    denom = np.einsum("ij,ij->i", ab, ab)
    denom = np.where(denom <= 1e-12, 1.0, denom)
    t = np.clip(np.einsum("ij,ij->i", p - a, ab) / denom, 0.0, 1.0)
    foot = a + t[:, None] * ab
    dist = np.linalg.norm(foot - p, axis=1)
    i = int(np.argmin(dist))
    return float(s_cum[i] + t[i] * (s_cum[i + 1] - s_cum[i])), float(dist[i])


def sample(verts, s_cum, s):
    """(position, heading) at arclength s."""
    s = float(np.clip(s, 0.0, s_cum[-1]))
    i = int(np.searchsorted(s_cum, s, side="right") - 1)
    i = max(0, min(i, len(verts) - 2))
    span = s_cum[i + 1] - s_cum[i]
    t = 0.0 if span <= 1e-12 else (s - s_cum[i]) / span
    d = verts[i + 1] - verts[i]
    return verts[i] + t * d, math.atan2(d[1], d[0])


def leader_at(scenario, verts, s_cum, step, s_ego, lateral_tol=1.6):
    """(bumper gap, speed) of the nearest obstacle ahead in the lane at
    `step`, or None. Lane membership is the lateral distance to our own
    centreline, so a vehicle cutting in is seen while it is still changing
    lanes."""
    best = None
    for obstacle in scenario.dynamic_obstacles:
        state = obstacle.state_at_time(step)
        if state is None:
            continue
        s_obs, lateral = project(verts, s_cum, state.position)
        if lateral > lateral_tol or s_obs <= s_ego:
            continue
        gap = s_obs - s_ego - 0.5 * (EGO_LENGTH + float(obstacle.obstacle_shape.length))
        if best is None or gap < best[0]:
            best = (gap, float(getattr(state, "velocity", 0.0) or 0.0))
    return best


def idm_accel(v, v_des, leader):
    free = 1.0 - (v / max(v_des, 1e-3)) ** IDM_DELTA
    if leader is None:
        return IDM_A * free
    gap, v_lead = leader
    s_star = IDM_S0 + max(0.0, v * IDM_T + v * (v - v_lead) / (2.0 * math.sqrt(IDM_A * IDM_B)))
    return IDM_A * (free - (s_star / max(gap, 0.1)) ** 2)


def horizon_steps(scenario, planning_problem):
    """Plan as far as the obstacles are known or the goal time allows."""
    last = 0
    for obstacle in scenario.dynamic_obstacles:
        if obstacle.prediction is not None:
            last = max(last, int(obstacle.prediction.final_time_step))
    for goal_state in planning_problem.goal.state_list:
        interval = getattr(goal_state, "time_step", None)
        if interval is not None:
            last = max(last, int(getattr(interval, "end", getattr(interval, "start", 0))))
    return max(last, 100)


def plan(scenario, planning_problem, mode):
    """Forward-simulate the speed profile along the route; returns KSState
    objects for steps 0..N with the ego body centre on the centreline."""
    verts = build_route(scenario, planning_problem)
    s_cum = arclength(verts)
    s, _ = project(verts, s_cum, planning_problem.initial_state.position)
    v = v_des = float(planning_problem.initial_state.velocity)
    dt = float(scenario.dt)
    states = []
    for step in range(horizon_steps(scenario, planning_problem) + 1):
        position, heading = sample(verts, s_cum, s)
        states.append(KSState(time_step=step, position=np.array(position),
                              orientation=float(heading), velocity=float(v),
                              steering_angle=0.0))
        a = 0.0 if mode == "naive" else float(np.clip(
            idm_accel(v, v_des, leader_at(scenario, verts, s_cum, step, s)), -A_MAX, A_MAX))
        v_next = max(0.0, v + a * dt)
        s += 0.5 * (v + v_next) * dt   # trapezoid, so a standstill never reverses
        v = v_next
    return states


# --- DRAWTONOMY HAND-OFF -------------------------------------------------
# Nothing above matters to drawtonomy. It reads the solution XML (required)
# and, next to it, `<stem>.planning-trace.json` (optional).


def write_solution(scenario, planning_problem, states, path):
    # A CommonRoad solution starts at step 1: the initial state is not part of it.
    trajectory = Trajectory(initial_time_step=1, state_list=states[1:])
    solution = Solution(scenario.scenario_id, [PlanningProblemSolution(
        planning_problem_id=planning_problem.planning_problem_id,
        vehicle_model=VehicleModel.KS,
        vehicle_type=EGO_TYPE,
        cost_function=CostFunction.JB1,
        trajectory=trajectory,
    )])
    CommonRoadSolutionWriter(solution).write_to_file(
        output_path=str(path.parent), filename=path.name, overwrite=True)


def write_trace(scenario, states, path):
    from drawtonomy_cr.trace import TraceWriter

    w = TraceWriter(
        dt=float(scenario.dt),
        vehicle=dict(length=EGO_LENGTH, width=EGO_WIDTH,
                     refToCenter=EGO_REF_TO_CENTER, type=EGO_TYPE.name),
        scenario=str(scenario.scenario_id),
        producer={"name": "idm_planner", "version": "0.1"},
    )
    # This planner has no replanning loop, so a "plan" issued every second is
    # the remainder of the profile from that moment on. Slice it from the
    # driven states: write() checks that each plan's head equals what was
    # driven, and a re-simulation would differ in the sixth decimal.
    every = max(1, int(round(1.0 / float(scenario.dt))))
    for k in range(1, len(states), every):
        w.plan(states=states[k:])
    w.driven(states[1:])
    w.write(path, solution=states[1:], replanning_frequency=every)


def main(argv=None):
    ap = argparse.ArgumentParser(description="IDM car-following example planner")
    ap.add_argument("scenario")
    ap.add_argument("out_dir")
    ap.add_argument("--mode", choices=["idm", "naive"], default="idm")
    ap.add_argument("--name", default="planner_solution")
    ap.add_argument("--no-trace", action="store_true")
    args = ap.parse_args(argv)

    scenario, problem_set = CommonRoadFileReader(args.scenario).open()
    problems = list(problem_set.planning_problem_dict.values())
    if not problems:
        print("no planning problem in the scenario", file=sys.stderr)
        return 1
    planning_problem = problems[0]

    states = plan(scenario, planning_problem, args.mode)
    speeds = [st.velocity for st in states]
    print(f"{args.mode}: {len(states)} states, v {min(speeds):.1f}..{max(speeds):.1f} m/s")

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    solution_path = out_dir / f"{args.name}.xml"
    write_solution(scenario, planning_problem, states, solution_path)
    print(f"wrote {solution_path}")
    if not args.no_trace:
        trace_path = out_dir / f"{args.name}.planning-trace.json"
        write_trace(scenario, states, trace_path)
        print(f"wrote {trace_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
