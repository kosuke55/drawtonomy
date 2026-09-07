#!/usr/bin/env python3
"""
run_planner.py - THIS IS AN EXAMPLE. Replace the planner with yours.

It shows one way to connect a planner to drawtonomy, using
commonroad-reactive-planner as the stand-in. Nothing here is required by
drawtonomy: the only file it needs is the CommonRoad solution XML that any
planner can write with commonroad-io.

The file is split into two halves so you can tell them apart:

  * PLANNER-SPECIFIC - everything about commonroad-reactive-planner (reference
    path, configuration, the cyclic replanning loop, its plot rendering).
    Delete it and put your own planner there.
  * DRAWTONOMY HAND-OFF - the three output files, none of which depend on which
    planner produced them:
      1. solution.xml                    (required; commonroad-io writes it)
      2. solution.planning-trace.json    (optional; drawtonomy_cr.trace.TraceWriter)
      3. solution.verdict.json           (optional; drawtonomy_cr.verdict, or the
                                          `drawtonomy-cr verdict` command later)

Loads a CommonRoad scenario, plans an ego trajectory from the planning
problem's initial state to its goal with commonroad-reactive-planner
(sampling-based Frenet planner, cyclic replanning), writes the result as a
CommonRoad Solution XML (VehicleModel.KS, CostFunction.JB1), checks it with
commonroad_dc.feasibility.solution_checker, and renders planner.gif.

Usage:
    python3 run_planner.py scenario.xml out/
"""

import sys
import traceback
from pathlib import Path

import numpy as np


# --- PLANNER-SPECIFIC ----------------------------------------------------
# commonroad-reactive-planner's own business: the reference path it needs and
# the body it plans with. Replace both with your planner's equivalents.


def build_reference_path(scenario, planning_problem):
    """Reference path: route planner if it yields something non-degenerate,
    else the goal lanelet's center vertices (extended through adjacent
    successors if any)."""
    ln = scenario.lanelet_network
    goal_lanelet_ids = []
    if planning_problem.goal.lanelets_of_goal_position:
        for v in planning_problem.goal.lanelets_of_goal_position.values():
            goal_lanelet_ids.extend(v)

    # try route planner first
    try:
        from commonroad_route_planner.fast_api.fast_api import (
            generate_reference_path_from_scenario_and_planning_problem,
        )

        route = generate_reference_path_from_scenario_and_planning_problem(
            scenario, planning_problem
        )
        rp = np.asarray(route.reference_path)
        length = float(np.sum(np.linalg.norm(np.diff(rp, axis=0), axis=1)))
        print(f"[INFO] route planner reference path: {len(rp)} pts, {length:.1f} m")
        if len(rp) >= 10 and length > 50.0:
            return rp, "route_planner"
        print("[WARN] route planner path degenerate; falling back to goal lanelet centerline")
    except Exception as e:
        print(f"[WARN] route planner failed ({type(e).__name__}: {e}); "
              f"falling back to goal lanelet centerline")

    # fallback: goal lanelet centerline
    init_ids = ln.find_lanelet_by_position([planning_problem.initial_state.position])[0]
    lid = goal_lanelet_ids[0] if goal_lanelet_ids else (init_ids[0] if init_ids else ln.lanelets[0].lanelet_id)
    lanelet = ln.find_lanelet_by_id(lid)
    verts = np.asarray(lanelet.center_vertices)
    # extend along successors if the network has them
    cur = lanelet
    seen = {lid}
    while cur.successor:
        nxt = cur.successor[0]
        if nxt in seen:
            break
        seen.add(nxt)
        cur = ln.find_lanelet_by_id(nxt)
        verts = np.vstack([verts, np.asarray(cur.center_vertices)[1:]])
    length = float(np.sum(np.linalg.norm(np.diff(verts, axis=0), axis=1)))
    print(f"[INFO] fallback reference path from lanelet {lid}: {len(verts)} pts, {length:.1f} m")
    return verts, f"lanelet_{lid}_centerline"


def planner_vehicle_block(config):
    """`tracks[].vehicle` for the trace: the body the planner planned with.

    Taken from the planner's own `config.vehicle` (built from the CommonRoad
    vehicle type, e.g. BMW_320i = 4.508 x 1.61 m), not re-typed here, so the
    trace can never disagree with the collision check. `refToCenter` is the
    rear-axle-to-body-centre distance (`wb_rear_axle`), the same shift the
    planner applies when it writes centre-frame states.
    """
    from commonroad.common.solution import VehicleType as _VT
    v = config.vehicle
    try:
        label = _VT(int(v.id_type_vehicle)).name
    except Exception:
        label = None
    block = {
        "length": round(float(v.length), 6),
        "width": round(float(v.width), 6),
        "refToCenter": round(float(v.wb_rear_axle), 6),
    }
    if label:
        block["type"] = label
    return block


def main():
    if len(sys.argv) < 3:
        print("usage: run_planner.py <scenario.xml> <out_dir>", file=sys.stderr)
        sys.exit(2)

    scenario_path = Path(sys.argv[1])
    out_dir = Path(sys.argv[2])
    out_dir.mkdir(parents=True, exist_ok=True)

    from commonroad.common.file_reader import CommonRoadFileReader
    from commonroad.common.solution import (
        CommonRoadSolutionWriter,
        CostFunction,
        PlanningProblemSolution,
        Solution,
        VehicleModel,
        VehicleType,
    )
    from commonroad_rp.reactive_planner import ReactivePlanner
    from commonroad_rp.utility.config import ReactivePlannerConfiguration
    from commonroad_rp.state import ReactivePlannerState

    # --- compat shim: commonroad-reactive-planner 2025.1's CoordinateSystem
    # subclass calls the installed commonroad-clcs's __init__ without a
    # CLCSParams object, but commonroad-clcs's ProcessorFactory unconditionally
    # dereferences params.processing_option.
    import commonroad_rp.utility.utils_coordinate_system as _co_mod
    from commonroad_clcs.config import CLCSParams

    _orig_co_init = _co_mod.CoordinateSystem.__init__

    def _patched_co_init(self, reference, preprocess_reference=True, clcs_params=None):
        if clcs_params is None:
            clcs_params = CLCSParams()
        _orig_co_init(self, reference, preprocess_reference=preprocess_reference,
                      clcs_params=clcs_params)

    _co_mod.CoordinateSystem.__init__ = _patched_co_init

    scenario, planning_problem_set = CommonRoadFileReader(str(scenario_path)).open()
    planning_problems = list(planning_problem_set.planning_problem_dict.values())
    if not planning_problems:
        print("[FAIL] no planning problem in scenario", file=sys.stderr)
        sys.exit(1)
    planning_problem = planning_problems[0]

    # last time step of the scenario (from obstacle predictions)
    scenario_last_step = 0
    for o in scenario.dynamic_obstacles:
        if o.prediction is not None:
            scenario_last_step = max(scenario_last_step, int(o.prediction.final_time_step))
    if scenario_last_step == 0:
        scenario_last_step = 100
    print(f"[INFO] scenario {scenario.scenario_id}, dt={scenario.dt}, "
          f"last time step={scenario_last_step}, obstacles={len(scenario.dynamic_obstacles)}")

    reference_path, ref_src = build_reference_path(scenario, planning_problem)

    # 2. Configure + build the reactive planner.
    config = ReactivePlannerConfiguration()
    config.update(scenario=scenario, planning_problem=planning_problem)
    config.vehicle.id_type_vehicle = VehicleType.BMW_320i.value  # == 2
    config.debug.save_plots = False
    config.debug.show_plots = False
    config.debug.multiproc = False
    config.debug.draw_traj_set = True
    config.general.path_output = str(out_dir)

    planner = ReactivePlanner(config)
    planner.set_reference_path(reference_path=reference_path)

    # Desired velocity: leave it to the planner's own rule
    # (utility/general.retrieve_desired_velocity_from_pp): the goal state's
    # <velocity> interval when the planning problem has one (midpoint when the
    # interval starts above 0, else end/2), otherwise the initial velocity.
    # An earlier version pinned it to the initial velocity, which silently
    # ignored the goal velocity drawtonomy exports ("Goal speed limit").
    planner.set_desired_velocity(current_speed=planner.x_0.velocity)
    print(f"[INFO] desired velocity {planner._desired_speed:.2f} m/s "
          f"(goal velocity interval when present, else initial velocity)")

    # 3. Cyclic replanning loop (standard reactive-planner loop).
    freq = int(config.planning.replanning_frequency)
    planner.record_state_and_input(planner.x_0)
    optimal_traj_list = []          # per-cycle optimal CR Trajectory
    traj_set_per_step = {}          # time_step -> sampled TrajectorySample bundle
    current_count = 0
    goal_reached_flag = False
    fail_reason = None

    while planner.x_0.time_step < scenario_last_step:
        current_count += 1
        try:
            result = planner.plan()
        except Exception as e:  # noqa: BLE001
            # e.g. commonroad_clcs CurvilinearProjectionDomainLongitudinalError:
            # the sampled horizon (v * T) runs past the end of the reference path.
            # Seen with esmini acc-test (500 m road, ego at 33 m/s, 6 s horizon):
            # the loop used to crash here and no solution / trace was written.
            # Stop cleanly instead so the partial run can still be inspected.
            fail_reason = (f"planner raised {type(e).__name__} at t={planner.x_0.time_step}: {e}")
            print(f"[WARN] {fail_reason}")
            break
        if result is None:
            fail_reason = f"planner found no feasible trajectory at t={planner.x_0.time_step}"
            print(f"[WARN] {fail_reason}")
            break
        optimal_traj = result[0]  # commonroad Trajectory (cartesian, rear-axle states)
        optimal_traj_list.append(optimal_traj)

        # store sampled bundle for visualization of this cycle
        try:
            traj_set_per_step[planner.x_0.time_step] = list(planner.stored_trajectories) \
                if hasattr(planner, "stored_trajectories") else None
        except Exception:
            traj_set_per_step[planner.x_0.time_step] = None

        # advance the ego along the optimal trajectory by `freq` steps
        n_avail = len(optimal_traj.state_list) - 1
        n_adv = max(1, min(freq, n_avail))
        for i in range(1, n_adv + 1):
            planner.record_state_and_input(optimal_traj.state_list[i])

        new_x0 = optimal_traj.state_list[n_adv]
        new_x0_cl = (result[1][n_adv], result[2][n_adv])
        planner.reset(initial_state_cart=new_x0, initial_state_curv=new_x0_cl,
                      collision_checker=planner.collision_checker,
                      coordinate_system=planner.coordinate_system)

        print(f"[STEP] cycle={current_count} t={new_x0.time_step} "
              f"pos=({new_x0.position[0]:.2f},{new_x0.position[1]:.2f}) "
              f"v={new_x0.velocity:.2f} a={new_x0.acceleration:.2f}", flush=True)

        if planner.goal_reached():
            goal_reached_flag = True
            print(f"[INFO] goal reached at t={new_x0.time_step} (cycle {current_count})")
            break

    record_states = planner.record_state_list
    print(f"[INFO] planning finished: {current_count} replanning cycles, "
          f"{len(record_states)} recorded states, last t={record_states[-1].time_step}, "
          f"goal_reached={goal_reached_flag}")
    v = np.array([s.velocity for s in record_states])
    print(f"[INFO] ego speed profile: v0={v[0]:.2f} min={v.min():.2f} max={v.max():.2f} "
          f"final={v[-1]:.2f} m/s")

    # --- DRAWTONOMY HAND-OFF ---------------------------------------------
    # Steps 4-5b below do not depend on which planner produced `record_states`.
    # Any planner that can hand over a state list can write the same three files.

    # 4. Build ego CR dynamic obstacle + Solution. REQUIRED: this is the only
    #    file drawtonomy (and the official checker) actually needs.
    ego_obstacle = planner.convert_state_list_to_commonroad_object(record_states)

    # Solution needs states shifted to vehicle center (same as ego obstacle above)
    solution_trajectory = ego_obstacle.prediction.trajectory

    pp_solution = PlanningProblemSolution(
        planning_problem_id=planning_problem.planning_problem_id,
        vehicle_model=VehicleModel.KS,
        vehicle_type=VehicleType.BMW_320i,
        cost_function=CostFunction.JB1,
        trajectory=solution_trajectory,
    )
    solution = Solution(scenario.scenario_id, [pp_solution])
    CommonRoadSolutionWriter(solution).write_to_file(
        output_path=str(out_dir), filename="solution.xml", overwrite=True
    )
    print(f"[INFO] wrote solution to {out_dir / 'solution.xml'}")

    # 4b. drawtonomy planning trace (optional; docs/planning-trace-format.md).
    # `optimal_traj_list` holds the per-cycle optimal trajectory in the planner's
    # rear-axle frame; the solution is written from centre-shifted states, so run
    # each plan through the **same** conversion to keep the two bit-identical
    # where they overlap. TraceWriter.write() verifies exactly that and refuses to
    # write when it does not hold.
    try:
        import importlib.metadata

        from drawtonomy_cr.trace import TraceWriter

        def _to_center(state_list):
            return planner.convert_state_list_to_commonroad_object(
                list(state_list)
            ).prediction.trajectory.state_list

        try:
            producer_version = importlib.metadata.version("commonroad-reactive-planner")
        except Exception:
            producer_version = "unknown"

        writer = TraceWriter(
            dt=scenario.dt,
            vehicle=planner_vehicle_block(config),
            scenario=str(scenario.scenario_id),
            producer={"name": "commonroad-reactive-planner", "version": producer_version},
        )
        for traj in optimal_traj_list:
            centered = _to_center(traj.state_list)
            if centered:
                writer.plan(states=centered)
        writer.driven(solution_trajectory.state_list)
        writer.write(
            out_dir / "solution.planning-trace.json",
            solution=solution_trajectory.state_list,
            replanning_frequency=freq,
        )
    except Exception:
        print("[WARN] planning trace not written:")
        traceback.print_exc()

    # 5. Feasibility / collision checks via commonroad_dc.
    verdicts = {}
    try:
        from commonroad_dc.feasibility.solution_checker import (
            obstacle_collision,
            boundary_collision,
            goal_reached,
            solution_feasible,
        )

        def _run_check(name, fn):
            try:
                fn()
                print(f"[PASS] {name}")
                verdicts[name] = "PASS"
            except Exception as e:
                print(f"[FAIL] {name}: {type(e).__name__}: {e}")
                verdicts[name] = f"FAIL ({type(e).__name__})"

        _run_check("obstacle_collision",
                   lambda: obstacle_collision(scenario, planning_problem_set, solution))
        _run_check("boundary_collision",
                   lambda: boundary_collision(scenario, planning_problem_set, solution))
        _run_check("goal_reached",
                   lambda: goal_reached(scenario, planning_problem_set, solution))

        def _feasibility():
            results = solution_feasible(solution, scenario.dt, planning_problem_set)
            infeasible = {k: r for k, r in results.items() if not r[0]}
            if infeasible:
                raise Exception(f"infeasible for planning problems {list(infeasible.keys())}")

        _run_check("solution_feasible (KS)", _feasibility)
    except ImportError as e:
        print(f"[FAIL] commonroad_dc.feasibility.solution_checker not importable: {e}")

    # 5b. drawtonomy verdict sidecar (optional). Putting solution.verdict.json
    # next to solution.xml means dropping both into drawtonomy at once reads the
    # official verdict back. It can also be produced later, with:
    #   drawtonomy-cr verdict scenario.xml solution.xml
    try:
        from drawtonomy_cr.verdict import write_verdict

        write_verdict(scenario_path, out_dir / "solution.xml",
                      out_dir / "solution.verdict.json")
        print(f"[INFO] wrote verdict to {out_dir / 'solution.verdict.json'}")
    except Exception:
        print("[WARN] verdict sidecar not written:")
        traceback.print_exc()

    # --- PLANNER-SPECIFIC (again) -----------------------------------------
    # 6. Render frames with visualize_planner_at_timestep + assemble planner.gif.
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        import imageio.v2 as imageio
        from commonroad_rp.utility.visualization import visualize_planner_at_timestep

        frames_dir = out_dir / "frames"
        frames_dir.mkdir(parents=True, exist_ok=True)

        last_t = int(record_states[-1].time_step)
        step_stride = 1 if last_t <= 120 else 2
        frame_files = []
        for t in range(0, last_t + 1, step_stride):
            pos = ego_obstacle.prediction.trajectory.state_list
            idx = min(t, len(pos) - 1)
            cx, cy = pos[idx].position
            plot_limits = [cx - 60, cx + 60, cy - 60, cy + 60]
            visualize_planner_at_timestep(
                scenario=scenario,
                planning_problem=planning_problem,
                ego=ego_obstacle,
                timestep=t,
                config=config,
                traj_set=None,
                ref_path=reference_path,
                plot_limits=plot_limits,
            )
            fp = frames_dir / f"frame_{t:04d}.png"
            plt.savefig(str(fp), format="png", dpi=80, bbox_inches="tight")
            plt.close("all")
            frame_files.append(fp)

        # normalize frame sizes (bbox_inches='tight' can vary by a pixel)
        images = [imageio.imread(str(f)) for f in frame_files]
        h = min(im.shape[0] for im in images)
        w = min(im.shape[1] for im in images)
        images = [im[:h, :w, :3] for im in images]
        gif_path = out_dir / "planner.gif"
        imageio.mimsave(str(gif_path), images, duration=0.1, loop=0)
        print(f"[INFO] wrote {gif_path} ({len(images)} frames, {w}x{h})")
    except Exception:
        print("[WARN] planner.gif rendering failed:")
        traceback.print_exc()

    # summary
    print("=== SUMMARY ===")
    print(f"reference_path_source={ref_src}")
    print(f"replanning_cycles={current_count} recorded_states={len(record_states)} "
          f"last_time_step={record_states[-1].time_step}")
    print(f"planner_goal_reached={goal_reached_flag} fail_reason={fail_reason}")
    for k, val in verdicts.items():
        print(f"checker[{k}]={val}")


if __name__ == "__main__":
    main()
