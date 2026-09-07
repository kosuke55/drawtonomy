"""Tests for TraceWriter.

`docs/planning-trace-format.md` is the specification. What is pinned here:
  * the shape of the output (schema / frame / tracks / state keys / rounding to
    six decimals)
  * that a dict and a commonroad-io State produce identical output
  * that the self-check behaves correctly on PASS and FAIL alike, and **writes
    nothing** on FAIL
"""

import json

import pytest

from drawtonomy_cr.trace import SCHEMA, TraceSelfCheckError, TraceWriter


class FakeState:
    """Minimal stand-in exposing the same reads as a commonroad-io `State`
    (position / orientation / velocity / time_step), so the attribute path can
    be tested without commonroad-io installed."""

    def __init__(self, time_step, x, y, orientation=None, velocity=None):
        self.time_step = time_step
        self.position = (x, y)
        self.orientation = orientation
        self.velocity = velocity


def straight_states(n=5, dt=0.1, cls=None):
    """n states driving straight at 10 m/s, as dicts or as State objects."""
    out = []
    for i in range(n):
        x, y, h, v = 1.0 * i, 2.0, 0.0, 10.0
        if cls is None:
            out.append({"time_step": i, "x": x, "y": y, "orientation": h, "velocity": v})
        else:
            out.append(cls(i, x, y, h, v))
    return out


def make_writer(**kwargs):
    return TraceWriter(dt=0.1, vehicle={"length": 4.5, "width": 1.8}, **kwargs)


# --- output shape --------------------------------------------------------


def test_written_trace_has_the_v1_shape(tmp_path):
    w = make_writer(scenario="ZAM_Test-1_1_T-1")
    states = straight_states()
    w.plan(t=0.0, states=states)
    w.driven(states)
    out = tmp_path / "solution.planning-trace.json"
    w.write(out, solution=states, verbose=False)

    trace = json.loads(out.read_text(encoding="utf-8"))
    assert trace["schema"] == SCHEMA == "drawtonomy-planning-trace-v1"
    assert trace["frame"] == "center"
    assert trace["scenario"] == "ZAM_Test-1_1_T-1"
    assert len(trace["tracks"]) == 1
    track = trace["tracks"][0]
    assert track["role"] == "ego"
    assert track["vehicle"] == {"length": 4.5, "width": 1.8}
    assert len(track["driven"]) == 5
    assert len(track["plans"]) == 1
    assert track["plans"][0]["t"] == 0.0
    assert set(track["driven"][0]) == {"t", "x", "y", "h", "v"}
    # Exactly one trailing newline.
    assert out.read_text(encoding="utf-8").endswith("}\n")


def test_positions_are_rounded_to_six_decimals(tmp_path):
    w = make_writer()
    states = [{"time_step": 0, "x": 1.5671029999999997, "y": 2.0}]
    w.plan(states=states)
    w.driven(states)
    trace = w.write(tmp_path / "t.json", verbose=False)
    assert trace["tracks"][0]["driven"][0]["x"] == 1.567103


def test_optional_fields_are_omitted_when_absent(tmp_path):
    w = TraceWriter(dt=0.1)
    states = [{"time_step": 0, "x": 0.0, "y": 0.0}]
    w.plan(states=states)
    w.driven(states)
    trace = w.write(tmp_path / "t.json", verbose=False)
    entry = trace["tracks"][0]["driven"][0]
    assert set(entry) == {"t", "x", "y"}
    assert "vehicle" not in trace["tracks"][0]
    assert "scenario" not in trace
    assert "producer" not in trace


def test_time_step_is_converted_to_seconds(tmp_path):
    w = TraceWriter(dt=0.25)
    states = [{"time_step": 4, "x": 0.0, "y": 0.0}]
    w.plan(states=states)
    w.driven(states)
    trace = w.write(tmp_path / "t.json", verbose=False)
    assert trace["tracks"][0]["driven"][0]["t"] == 1.0


def test_name_track_instead_of_role(tmp_path):
    w = TraceWriter(dt=0.1, role=None, name="NPC1")
    states = straight_states()
    w.plan(states=states)
    w.driven(states)
    trace = w.write(tmp_path / "t.json", verbose=False)
    assert trace["tracks"][0]["name"] == "NPC1"
    assert "role" not in trace["tracks"][0]


def test_role_and_name_together_is_refused():
    with pytest.raises(ValueError, match="exactly one of role / name"):
        TraceWriter(dt=0.1, role="ego", name="NPC1")


def test_neither_role_nor_name_is_refused():
    with pytest.raises(ValueError, match="exactly one of role / name"):
        TraceWriter(dt=0.1, role=None)


def test_bad_dt_is_refused():
    with pytest.raises(ValueError, match="dt must be"):
        TraceWriter(dt=0)


def test_bad_frame_is_refused():
    with pytest.raises(ValueError, match="center"):
        TraceWriter(dt=0.1, frame="rear")


# --- the two input forms -------------------------------------------------


def test_dict_and_state_inputs_produce_the_same_trace(tmp_path):
    """A dict and a State must produce byte-identical output: whichever form the
    planner happens to hold, the trace has to come out the same."""
    outs = []
    for cls in (None, FakeState):
        w = make_writer(scenario="S")
        states = straight_states(cls=cls)
        w.plan(states=states)
        w.driven(states)
        path = tmp_path / f"{'dict' if cls is None else 'state'}.json"
        w.write(path, solution=states, verbose=False)
        outs.append(path.read_text(encoding="utf-8"))
    assert outs[0] == outs[1]


def test_dict_accepts_the_h_v_t_spelling(tmp_path):
    """The trace format's own key spelling (t / h / v) is accepted too."""
    w = TraceWriter(dt=0.1)
    states = [{"t": 0.0, "x": 1.0, "y": 2.0, "h": 0.5, "v": 9.0}]
    w.plan(states=states)
    w.driven(states)
    trace = w.write(tmp_path / "t.json", verbose=False)
    assert trace["tracks"][0]["driven"][0] == {
        "t": 0.0,
        "x": 1.0,
        "y": 2.0,
        "h": 0.5,
        "v": 9.0,
    }


def test_state_without_position_is_refused():
    w = TraceWriter(dt=0.1)
    with pytest.raises(ValueError, match="no position"):
        w.plan(states=[{"time_step": 0}])


def test_state_without_time_is_refused():
    w = TraceWriter(dt=0.1)
    with pytest.raises(ValueError, match="no time"):
        w.plan(states=[{"x": 0.0, "y": 0.0}])


# --- self-check PASS -----------------------------------------------------


def test_self_check_passes_when_driven_equals_the_solution(tmp_path, capsys):
    w = make_writer()
    states = straight_states()
    w.plan(states=states)
    w.driven(states)
    out = tmp_path / "t.json"
    w.write(out, solution=states, replanning_frequency=3, verbose=True)
    printed = capsys.readouterr().out
    assert "[PASS] planning trace self-check (driven)" in printed
    assert "[PASS] planning trace self-check (plans)" in printed
    assert out.exists()


def test_plan_tail_past_the_driven_track_is_not_compared(tmp_path):
    """The last plan runs past what was driven, so only its executed head is
    compared."""
    w = make_writer()
    driven = straight_states(n=3)
    plan = straight_states(n=8)
    # Put the part beyond the driven track (t=3 onwards) far away from it.
    for st in plan[3:]:
        st["x"] = 999.0
    w.plan(states=plan)
    w.driven(driven)
    w.write(tmp_path / "t.json", solution=driven, replanning_frequency=3, verbose=False)


# --- self-check FAIL -----------------------------------------------------


def test_self_check_fails_when_driven_differs_from_the_solution(tmp_path):
    w = make_writer()
    driven = straight_states()
    solution = straight_states()
    solution[2]["x"] += 0.01  # 1 cm off, far beyond 1e-6 m
    w.plan(states=driven)
    w.driven(driven)
    out = tmp_path / "t.json"
    with pytest.raises(TraceSelfCheckError, match="driven"):
        w.write(out, solution=solution, verbose=False)
    # A broken trace is never left behind silently.
    assert not out.exists()


def test_self_check_fails_on_a_length_mismatch(tmp_path):
    w = make_writer()
    driven = straight_states(n=5)
    w.plan(states=driven)
    w.driven(driven)
    out = tmp_path / "t.json"
    with pytest.raises(TraceSelfCheckError, match="but the solution has 4"):
        w.write(out, solution=straight_states(n=4), verbose=False)
    assert not out.exists()


def test_self_check_fails_when_a_plan_head_differs_from_driven(tmp_path):
    w = make_writer()
    driven = straight_states()
    plan = straight_states()
    plan[1]["y"] += 0.5  # plan head off the driven track (a wrong-frame symptom)
    w.plan(states=plan)
    w.driven(driven)
    out = tmp_path / "t.json"
    with pytest.raises(TraceSelfCheckError, match=r"self-check \(plans\)"):
        w.write(out, solution=driven, replanning_frequency=3, verbose=False)
    assert not out.exists()


def test_plan_issued_at_a_different_time_than_its_first_state_is_refused():
    w = make_writer()
    with pytest.raises(ValueError, match="has to start at the moment it was issued"):
        w.plan(t=1.0, states=straight_states())


def test_write_without_driven_is_refused(tmp_path):
    w = make_writer()
    w.plan(states=straight_states())
    with pytest.raises(ValueError, match="driven"):
        w.write(tmp_path / "t.json", verbose=False)


def test_write_without_a_plan_is_refused(tmp_path):
    w = make_writer()
    w.driven(straight_states())
    with pytest.raises(ValueError, match="at least one plan"):
        w.write(tmp_path / "t.json", verbose=False)


# --- against a committed real trace --------------------------------------


def test_reproduces_the_committed_trace_fixture(fixtures, tmp_path):
    """Feeding a committed real trace (planner_solution.planning-trace.json) back
    through TraceWriter must reproduce it byte for byte, which pins the rounding
    and the key order against accidental change."""
    want = json.loads(
        (fixtures / "planner_solution.planning-trace.json").read_text("utf-8")
    )
    track = want["tracks"][0]
    w = TraceWriter(
        dt=0.1,
        vehicle=track.get("vehicle"),
        scenario=want.get("scenario"),
        producer=want.get("producer"),
    )
    for plan in track["plans"]:
        w.plan(t=plan["t"], states=plan["states"])
    w.driven(track["driven"])
    out = tmp_path / "roundtrip.json"
    w.write(out, solution=track["driven"], replanning_frequency=3, verbose=False)

    got = json.loads(out.read_text(encoding="utf-8"))
    assert got == want
    assert (
        out.read_text(encoding="utf-8")
        == (fixtures / "planner_solution.planning-trace.json").read_text("utf-8")
    )
