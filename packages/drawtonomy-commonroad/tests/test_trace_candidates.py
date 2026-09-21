"""`plans[].candidates`: the trajectories a sampling planner evaluated and did
not drive.

`docs/planning-trace-format.md` is the specification. What is pinned here:
  * `plan(candidates=...)` accepts the same state shapes as `plan(states=...)`
  * only `states` is required; `cost` / `feasible` / `reason` are optional
  * `candidate_stride` thins candidate states and nothing else
  * every rule a malformed candidate can break raises, and writes no file
"""
import json

import pytest

from drawtonomy_cr.trace import TraceSelfCheckError, TraceWriter, self_check


class FakeState:
    """Stand-in for a commonroad-io `State`, as in test_trace.py."""

    def __init__(self, time_step, x, y, orientation=None, velocity=None):
        self.time_step = time_step
        self.position = (x, y)
        self.orientation = orientation
        self.velocity = velocity


def states(n=5, x0=0.0, y=2.0, cls=None):
    out = []
    for i in range(n):
        x = x0 + 1.0 * i
        if cls is None:
            out.append({"time_step": i, "x": x, "y": y, "orientation": 0.0, "velocity": 10.0})
        else:
            out.append(cls(i, x, y, 0.0, 10.0))
    return out


def write(tmp_path, candidates, stride=1, driven=None):
    driven = states() if driven is None else driven
    w = TraceWriter(dt=0.1, candidate_stride=stride)
    w.plan(states=driven, candidates=candidates)
    w.driven(driven)
    out = tmp_path / "solution.planning-trace.json"
    w.write(out, verbose=False)
    return json.loads(out.read_text(encoding="utf-8"))["tracks"][0]["plans"][0]


# --- what gets written ----------------------------------------------------


def test_a_candidate_needs_only_states(tmp_path):
    plan = write(tmp_path, [{"states": states(3, y=5.0)}])
    assert plan["candidates"] == [
        {
            "states": [
                {"t": 0.0, "x": 0.0, "y": 5.0, "h": 0.0, "v": 10.0},
                {"t": 0.1, "x": 1.0, "y": 5.0, "h": 0.0, "v": 10.0},
                {"t": 0.2, "x": 2.0, "y": 5.0, "h": 0.0, "v": 10.0},
            ]
        }
    ]


def test_cost_feasible_and_reason_are_carried_through(tmp_path):
    plan = write(
        tmp_path,
        [
            {"states": states(3, y=5.0), "cost": 306.842899},
            {"states": states(3, y=6.0), "feasible": False, "reason": "infeasible_kinematic"},
        ],
    )
    first, second = plan["candidates"]
    assert first["cost"] == 306.842899 and "feasible" not in first
    assert second["feasible"] is False and second["reason"] == "infeasible_kinematic"
    assert "cost" not in second


def test_state_objects_and_dicts_produce_the_same_candidate(tmp_path):
    from_dicts = write(tmp_path, [{"states": states(4, y=5.0)}])
    from_objects = write(tmp_path, [{"states": states(4, y=5.0, cls=FakeState)}])
    assert from_dicts["candidates"] == from_objects["candidates"]


def test_candidates_are_absent_when_not_passed(tmp_path):
    assert "candidates" not in write(tmp_path, None)


def test_an_empty_candidate_list_writes_no_field(tmp_path):
    """No candidates and "the planner evaluated nothing" are the same file."""
    assert "candidates" not in write(tmp_path, [])


def test_cost_is_rounded_like_every_other_number(tmp_path):
    plan = write(tmp_path, [{"states": states(3, y=5.0), "cost": 1.23456789}])
    assert plan["candidates"][0]["cost"] == 1.234568


# --- candidate_stride -----------------------------------------------------


def test_stride_keeps_every_nth_candidate_state(tmp_path):
    plan = write(tmp_path, [{"states": states(9, y=5.0)}], stride=3)
    assert [s["t"] for s in plan["candidates"][0]["states"]] == [0.0, 0.3, 0.6]


def test_stride_leaves_the_plan_and_driven_untouched(tmp_path):
    driven = states(9)
    w = TraceWriter(dt=0.1, candidate_stride=4)
    w.plan(states=driven, candidates=[{"states": states(9, y=5.0)}])
    w.driven(driven)
    out = tmp_path / "t.json"
    w.write(out, verbose=False)
    track = json.loads(out.read_text(encoding="utf-8"))["tracks"][0]
    assert len(track["driven"]) == 9
    assert len(track["plans"][0]["states"]) == 9
    assert len(track["plans"][0]["candidates"][0]["states"]) == 3


def test_stride_of_one_keeps_everything(tmp_path):
    plan = write(tmp_path, [{"states": states(9, y=5.0)}], stride=1)
    assert len(plan["candidates"][0]["states"]) == 9


@pytest.mark.parametrize("stride", [0, -1])
def test_a_stride_below_one_is_refused(stride):
    with pytest.raises(ValueError, match="candidate_stride must be 1 or more"):
        TraceWriter(dt=0.1, candidate_stride=stride)


# --- what is refused ------------------------------------------------------


@pytest.mark.parametrize(
    "candidate,message",
    [
        ({"cost": 1.0}, "needs `states`"),
        ({"states": []}, "`states` is empty"),
        ({"states": None}, "needs `states`"),
        ({"states": [{"t": 0.0, "x": 0.0, "y": 0.0}], "cost": float("inf")}, "must be finite"),
        ({"states": [{"t": 0.0, "x": 0.0, "y": 0.0}], "cost": float("nan")}, "must be finite"),
        ({"states": [{"t": 0.0, "x": 0.0, "y": 0.0}], "feasible": "no"}, "must be true or false"),
        ({"states": [{"t": 0.0, "x": 0.0, "y": 0.0}], "reason": ""}, "non-empty string"),
        ({"states": [{"t": 0.0, "x": 0.0, "y": 0.0}], "reason": 3}, "non-empty string"),
        ("not a dict", "a candidate is a dict"),
    ],
)
def test_a_malformed_candidate_is_refused_when_it_is_added(candidate, message):
    w = TraceWriter(dt=0.1)
    with pytest.raises(ValueError, match=message):
        w.plan(states=states(), candidates=[candidate])


def test_the_refusal_names_the_candidate_and_its_plan():
    w = TraceWriter(dt=0.1)
    w.plan(states=states())
    with pytest.raises(ValueError, match=r"candidates\[1\] of plan 1"):
        w.plan(states=states(), candidates=[{"states": states(2)}, {"cost": 1.0}])


# --- the self-check sees candidates built elsewhere -----------------------


def base_trace(candidates):
    return {
        "schema": "drawtonomy-planning-trace-v1",
        "frame": "center",
        "tracks": [
            {
                "role": "ego",
                "driven": [{"t": 0.0, "x": 0.0, "y": 0.0}],
                "plans": [
                    {"t": 0.0, "states": [{"t": 0.0, "x": 0.0, "y": 0.0}],
                     "candidates": candidates}
                ],
            }
        ],
    }


#: Candidate shapes v1 forbids, with the JSON path the schema has to complain
#: about. The wording is left to whichever validator is installed.
MALFORMED = [
    ("no states", [{"cost": 1.0}], "['candidates'][0]"),
    ("empty states", [{"states": []}], "['candidates'][0]['states']"),
    ("not an object", ["nope"], "['candidates'][0]"),
    ("not a list", "nope", "['candidates']"),
    ("feasible as a number",
     [{"states": [{"t": 0.0, "x": 0.0, "y": 0.0}], "feasible": 1}],
     "['candidates'][0]['feasible']"),
    ("an empty reason",
     [{"states": [{"t": 0.0, "x": 0.0, "y": 0.0}], "reason": ""}],
     "['candidates'][0]['reason']"),
    ("a state without a time",
     [{"states": [{"x": 0.0, "y": 0.0}]}], "['candidates'][0]['states'][0]"),
]


@pytest.mark.parametrize(
    "candidates,where", [(c, w) for _, c, w in MALFORMED], ids=[n for n, _, _ in MALFORMED]
)
def test_the_schema_refuses_a_malformed_candidate(candidates, where):
    """Everything a schema can say about a candidate's shape, it says: these
    come back from `planning-trace-v1.schema.json` before any number is read."""
    with pytest.raises(TraceSelfCheckError, match=r"self-check \(schema\)") as caught:
        self_check(base_trace(candidates), dt=0.1, verbose=False)
    assert where in str(caught.value)


def test_self_check_refuses_candidate_states_that_do_not_advance_in_time():
    """The one candidate rule a JSON Schema cannot state."""
    candidates = [
        {"states": [{"t": 0.2, "x": 0.0, "y": 0.0}, {"t": 0.1, "x": 1.0, "y": 0.0}]}
    ]
    with pytest.raises(TraceSelfCheckError, match="do not advance in time"):
        self_check(base_trace(candidates), dt=0.1, verbose=False)


def test_self_check_refuses_a_non_finite_cost():
    """Whichever stage catches it: `jsonschema` takes Python's float("inf") for
    a number, so the candidate rules refuse it there. JSON has no infinity, and
    a file carrying one cannot be read back by anything."""
    candidates = [{"states": [{"t": 0.0, "x": 0.0, "y": 0.0}], "cost": float("inf")}]
    with pytest.raises(TraceSelfCheckError, match="finite"):
        self_check(base_trace(candidates), dt=0.1, verbose=False)


def test_self_check_accepts_a_well_formed_candidate():
    self_check(
        base_trace(
            [
                {"states": [{"t": 0.0, "x": 0.0, "y": 0.0},
                            {"t": 0.1, "x": 1.0, "y": 0.0}], "cost": 3.0},
                {"states": [{"t": 0.0, "x": 0.0, "y": 1.0}],
                 "feasible": False, "reason": "infeasible_kinematic"},
            ]
        ),
        dt=0.1,
        verbose=False,
    )


def test_a_malformed_candidate_leaves_no_file(tmp_path):
    """Built by hand, so plan() cannot catch it: write() still refuses."""
    w = TraceWriter(dt=0.1)
    w.plan(states=states())
    w.driven(states())
    w._plans[0]["candidates"] = [{"states": []}]
    out = tmp_path / "solution.planning-trace.json"
    with pytest.raises(TraceSelfCheckError, match=r"self-check \(schema\)"):
        w.write(out, verbose=False)
    assert not out.exists()


def test_candidates_are_not_compared_against_driven(tmp_path):
    """A candidate is what the planner rejected, so it is free to disagree with
    what was driven - self-check (b) must not reach into it."""
    plan = write(tmp_path, [{"states": states(5, x0=500.0, y=-900.0)}])
    assert plan["candidates"][0]["states"][0]["x"] == 500.0
