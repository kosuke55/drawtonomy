"""`cycle_candidates()` in the reactive-planner example.

commonroad-reactive-planner publishes manylinux_x86_64 wheels only, so the
example cannot be run on every machine this suite runs on. What can be held to
the planner's real interface is the one function that reads it: the sampled
bundle goes in as `TrajectorySample`-shaped objects and the trace's candidate
entries come out.

The interface it is held to, from commonroad-reactive-planner 2025.1:
  * `ReactivePlanner.stored_trajectories` is `feasible + infeasible` samples,
    filled only when `_draw_traj_set` is on
  * `TrajectorySample.cost` is one scalar float; there is no per-term breakdown
  * `TrajectorySample.feasibility_label` is a `FeasibilityStatus`
    (`feasible`, `infeasible_kinematic`, `infeasible_collision`,
    `infeasible_rule`)
  * `CartesianSample.convert_to_rp_state_list(init_time_step, init_yaw_rate,
    dt, wheelbase, scaling_factor)` builds the state list
"""
import enum
import importlib.util
import json
import sys
import types
from pathlib import Path
from types import SimpleNamespace

import pytest

from drawtonomy_cr.trace import TraceWriter

EXAMPLE = (
    Path(__file__).resolve().parents[1]
    / "examples"
    / "reactive_planner"
    / "run_planner.py"
)


class FeasibilityStatus(enum.Enum):
    """`commonroad_rp.trajectories.FeasibilityStatus`, verbatim."""

    FEASIBLE = "feasible"
    INFEASIBLE_KINEMATIC = "infeasible_kinematic"
    INFEASIBLE_COLLISION = "infeasible_collision"
    INFEASIBLE_RULE = "infeasible_rule"


@pytest.fixture(scope="module")
def run_planner():
    """The example module, with its one planner import stubbed.

    `cycle_candidates` imports `FeasibilityStatus` and nothing else from the
    planner, so the rest of the example is never touched here.
    """
    planner_module = types.ModuleType("commonroad_rp")
    trajectories = types.ModuleType("commonroad_rp.trajectories")
    trajectories.FeasibilityStatus = FeasibilityStatus
    saved = {k: sys.modules.get(k) for k in ("commonroad_rp", "commonroad_rp.trajectories")}
    sys.modules["commonroad_rp"] = planner_module
    sys.modules["commonroad_rp.trajectories"] = trajectories
    try:
        spec = importlib.util.spec_from_file_location("run_planner_example", EXAMPLE)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        yield module
    finally:
        for name, value in saved.items():
            if value is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = value


class CartesianSample:
    """A sample whose state list is four states one metre apart."""

    def __init__(self, offset, n=4):
        self.offset = offset
        self.n = n

    def convert_to_rp_state_list(
        self, init_time_step, init_yaw_rate, dt, wheelbase, scaling_factor
    ):
        assert scaling_factor == 1  # the planner passes config.planning.factor
        return [
            SimpleNamespace(
                time_step=init_time_step + i,
                position=(self.offset + i * 1.0, 2.0),
                orientation=0.0,
                velocity=10.0,
            )
            for i in range(self.n)
        ]


def sample(offset, label, cost=None):
    entry = SimpleNamespace(cartesian=CartesianSample(offset), feasibility_label=label)
    if cost is not None:
        entry.cost = cost
    return entry


@pytest.fixture
def planner():
    return SimpleNamespace(
        dt=0.1,
        vehicle_params=SimpleNamespace(wheelbase=2.5),
        config=SimpleNamespace(planning=SimpleNamespace(factor=1)),
    )


@pytest.fixture
def optimal():
    return [SimpleNamespace(state_list=[SimpleNamespace(time_step=0)])]


def test_feasible_samples_carry_cost_and_rejected_ones_carry_a_reason(
    run_planner, planner, optimal
):
    """The split the committed candidates fixture has: scored ones get `cost`,
    rejected ones get `feasible` / `reason` and no meaningless cost."""
    bundle = [
        sample(0.0, FeasibilityStatus.FEASIBLE, 306.842899),
        sample(5.0, FeasibilityStatus.INFEASIBLE_KINEMATIC),
        sample(9.0, FeasibilityStatus.INFEASIBLE_COLLISION),
    ]
    candidates = run_planner.cycle_candidates(
        planner, {0: bundle}, 0, optimal, lambda states: list(states)
    )
    assert [sorted(c) for c in candidates] == [
        ["cost", "states"],
        ["feasible", "reason", "states"],
        ["feasible", "reason", "states"],
    ]
    assert candidates[0]["cost"] == 306.842899
    assert [c.get("reason") for c in candidates[1:]] == [
        "infeasible_kinematic",
        "infeasible_collision",
    ]
    assert all(c.get("feasible") is False for c in candidates[1:])


def test_a_non_finite_cost_is_left_out_rather_than_written(
    run_planner, planner, optimal
):
    """A candidate with an infinite cost is still a candidate; the trace just
    cannot record the number, and JSON has no infinity to record it with."""
    bundle = [sample(0.0, FeasibilityStatus.FEASIBLE, float("inf"))]
    candidates = run_planner.cycle_candidates(
        planner, {0: bundle}, 0, optimal, lambda states: list(states)
    )
    assert candidates == [{"states": candidates[0]["states"]}]


def test_no_bundle_means_no_candidates(run_planner, planner, optimal):
    """`stored_trajectories` is filled only when the planner is keeping the
    sampled set. A run without it writes a trace with no candidates at all."""
    assert run_planner.cycle_candidates(
        planner, {}, 0, optimal, lambda states: list(states)
    ) is None
    assert run_planner.cycle_candidates(
        planner, {0: None}, 0, optimal, lambda states: list(states)
    ) is None


def test_the_cycles_own_bundle_is_the_one_used(run_planner, planner):
    """Bundles are keyed by the time step the cycle started at."""
    optimal = [
        SimpleNamespace(state_list=[SimpleNamespace(time_step=0)]),
        SimpleNamespace(state_list=[SimpleNamespace(time_step=3)]),
    ]
    per_step = {
        0: [sample(0.0, FeasibilityStatus.FEASIBLE, 1.0)],
        3: [sample(100.0, FeasibilityStatus.FEASIBLE, 2.0)],
    }
    second = run_planner.cycle_candidates(
        planner, per_step, 1, optimal, lambda states: list(states)
    )
    assert second[0]["cost"] == 2.0
    assert second[0]["states"][0].position[0] == 100.0
    assert second[0]["states"][0].time_step == 3


def test_what_it_produces_is_what_the_writer_accepts(run_planner, planner, optimal, tmp_path):
    """The point of the function: its output goes straight into plan()."""
    bundle = [
        sample(0.0, FeasibilityStatus.FEASIBLE, 306.842899),
        sample(5.0, FeasibilityStatus.INFEASIBLE_KINEMATIC),
    ]
    candidates = run_planner.cycle_candidates(
        planner, {0: bundle}, 0, optimal, lambda states: list(states)
    )
    driven = [
        {"time_step": i, "x": 1.0 * i, "y": 2.0, "orientation": 0.0, "velocity": 10.0}
        for i in range(4)
    ]
    writer = TraceWriter(dt=0.1, candidate_stride=2)
    writer.plan(states=driven, candidates=candidates)
    writer.driven(driven)
    out = tmp_path / "solution.planning-trace.json"
    writer.write(out, verbose=False)

    written = json.loads(out.read_text(encoding="utf-8"))["tracks"][0]["plans"][0]
    assert len(written["candidates"]) == 2
    # candidate_stride=2 over four states.
    assert all(len(c["states"]) == 2 for c in written["candidates"])
    assert written["candidates"][0]["cost"] == 306.842899
    assert written["candidates"][1]["reason"] == "infeasible_kinematic"
