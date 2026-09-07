"""Tests for the verdict module.

The official checker ships Linux x86_64 wheels only, so `checker_available()` is
False wherever they cannot be installed. Tests that need it skip there, while **the schema and
the no-checker paths are always exercised**, since those are the easiest to
break.
"""

import json
import os
import subprocess
import sys

import pytest

from drawtonomy_cr import verdict as verdict_mod

pytestmark = pytest.mark.filterwarnings("ignore::DeprecationWarning")

CHECKER = verdict_mod.checker_available()


def test_schema_string_is_pinned():
    # Consumers match on this exact string, so it must not change.
    assert verdict_mod.SCHEMA == "drawtonomy-verdict/1"


def test_checker_missing_exit_code_and_message():
    assert verdict_mod.CHECKER_MISSING_EXIT_CODE == 3
    msg = verdict_mod.CHECKER_MISSING_MESSAGE
    assert "commonroad-drivability-checker" in msg
    assert 'pip install "drawtonomy-commonroad[checker]"' in msg
    assert "Linux x86_64 only" in msg
    assert "docker" in msg.lower()
    # One line: a failure is told once, not spread over several lines.
    assert "\n" not in msg


@pytest.mark.skipif(CHECKER, reason="checker is installed; the exit-3 path cannot fire")
def test_build_verdict_raises_when_checker_missing(fixtures):
    with pytest.raises(verdict_mod.CheckerNotInstalled) as excinfo:
        verdict_mod.build_verdict(
            fixtures / "cutin_commonroad.xml", fixtures / "cutin_solution.xml"
        )
    assert str(excinfo.value) == verdict_mod.CHECKER_MISSING_MESSAGE


@pytest.mark.skipif(CHECKER, reason="checker is installed; the exit-3 path cannot fire")
def test_cli_exits_3_with_one_line_when_checker_missing(fixtures, tmp_path):
    out = tmp_path / "out.json"
    proc = subprocess.run(
        [
            sys.executable,
            "-m",
            "drawtonomy_cr.cli",
            "verdict",
            str(fixtures / "cutin_commonroad.xml"),
            str(fixtures / "cutin_solution.xml"),
            "-o",
            str(out),
        ],
        capture_output=True,
        text=True,
    )
    assert proc.returncode == 3
    # Told once, in one place: a single stderr line and no traceback.
    lines = [ln for ln in proc.stderr.splitlines() if ln.strip()]
    assert lines == [verdict_mod.CHECKER_MISSING_MESSAGE]
    assert "Traceback" not in proc.stderr
    assert proc.stdout == ""
    # Nothing was judged, so no empty or broken sidecar is left behind.
    assert not out.exists()


def test_cli_help_lists_both_subcommands():
    proc = subprocess.run(
        [sys.executable, "-m", "drawtonomy_cr.cli", "--help"],
        capture_output=True,
        text=True,
    )
    assert proc.returncode == 0
    assert "verdict" in proc.stdout
    assert "open" in proc.stdout


def test_cli_open_without_a_scenario_exits_2(tmp_path):
    """Without a scenario, `open` exits 2 with one line and no traceback."""
    proc = subprocess.run(
        [sys.executable, "-m", "drawtonomy_cr.cli", "open", str(tmp_path)],
        capture_output=True,
        text=True,
    )
    assert proc.returncode == 2
    assert "No CommonRoad scenario" in proc.stderr
    assert "Traceback" not in proc.stderr


@pytest.mark.skipif(not CHECKER, reason="commonroad-drivability-checker not installed")
def test_verdict_output_shape_matches_the_committed_fixture(fixtures, tmp_path):
    """The real output must have the same shape as the committed
    `drawtonomy-verdict/1` fixture.

    `generatedAt` and the checker version change from run to run, so this
    compares keys and check names and order rather than values.
    """
    out = tmp_path / "planner_solution.verdict.json"
    verdict_mod.write_verdict(
        fixtures / "cutin_commonroad.xml", fixtures / "cutin_solution.xml", out
    )
    got = json.loads(out.read_text(encoding="utf-8"))
    want = json.loads((fixtures / "cutin_solution.verdict.json").read_text("utf-8"))

    assert got["schema"] == want["schema"]
    assert sorted(got.keys()) == sorted(want.keys())
    assert [c["name"] for c in got["checks"]] == [c["name"] for c in want["checks"]]
    assert got["tool"]["name"] == "commonroad-drivability-checker"
    assert got["scenarioId"] == want["scenarioId"]
    assert got["benchmarkId"] == want["benchmarkId"]
    assert got["dt"] == want["dt"]


# --- reason tie-break (determinism) --------------------------------------


def test_rank_reason_returns_state_deviation_when_nothing_was_hit():
    assert verdict_mod._rank_reason([]) == "state_deviation"
    assert verdict_mod._rank_reason([set(), set()]) == "state_deviation"


def test_rank_reason_takes_the_most_frequent_limit():
    reasons = [{"acceleration"}, {"acceleration"}, {"friction_circle"}]
    assert verdict_mod._rank_reason(reasons) == "acceleration"


def test_rank_reason_breaks_ties_by_name_not_by_set_order():
    """A tie is decided by name order.

    This is the shape that actually occurs with cutin_solution.xml: a single
    failing transition that hits both acceleration and friction_circle. While
    the result depended on set iteration order, the reason wobbled with
    PYTHONHASHSEED and the same input produced two different verdict JSONs.
    """
    tie = [{"acceleration", "friction_circle"}]
    assert verdict_mod._rank_reason(tie) == "acceleration"
    # Reordering the input must not change the answer: a set has no order, so
    # the same contents built in another order has to give the same result.
    assert verdict_mod._rank_reason([{"friction_circle", "acceleration"}]) == "acceleration"


def test_rank_reason_tie_is_stable_across_hash_seeds():
    """The reason must be the same in separate processes with different
    PYTHONHASHSEED values.

    Set iteration order depends on the per-process hash seed, so asserting
    within one process cannot catch the earlier non-determinism. Separate
    processes are started under several seeds and compared.
    """
    snippet = (
        "from drawtonomy_cr.verdict import _rank_reason;"
        # Four ties at once; each is even, so all are decided by name.
        "print(_rank_reason([{'acceleration', 'friction_circle'}]),"
        " _rank_reason([{'steering_rate', 'input_bounds'}]),"
        " _rank_reason([{'friction_circle', 'input_bounds', 'acceleration'}]),"
        " _rank_reason([{'steering_rate'}, {'acceleration'}]))"
    )
    outs = []
    for seed in ("0", "1", "12345"):
        proc = subprocess.run(
            [sys.executable, "-c", snippet],
            capture_output=True,
            text=True,
            env={**os.environ, "PYTHONHASHSEED": seed},
        )
        assert proc.returncode == 0, proc.stderr
        outs.append(proc.stdout.strip())
    assert len(set(outs)) == 1, f"reason varied with PYTHONHASHSEED: {outs}"
    assert outs[0] == "acceleration input_bounds acceleration acceleration"


# --- SKIP when triangle is missing ---------------------------------------


class _FakeChecks:
    """Stand-in for the four functions of
    `commonroad_dc.feasibility.solution_checker`.

    `_run_official_checks` imports them from that module, so injecting it into
    `sys.modules` reproduces "only boundary fails, with the triangle exception"
    even where the checker cannot be installed - its wheels are Linux x86_64
    only.
    """

    #: The exact wording the official commonroad_dc.boundary.triangle_builder
    #: raises with.
    TRIANGLE_EXC = Exception(
        "This operation requires a non-free third-party python package triangle. "
        "Please install it manually."
    )

    @staticmethod
    def obstacle_collision(*a, **kw):
        return None

    @staticmethod
    def boundary_collision(*a, **kw):
        raise _FakeChecks.TRIANGLE_EXC

    @staticmethod
    def goal_reached(*a, **kw):
        return None

    @staticmethod
    def solution_feasible(*a, **kw):
        return {}


def _install_fake_checker(monkeypatch, boundary_exc=None):
    import types

    mod = types.ModuleType("commonroad_dc.feasibility.solution_checker")
    mod.obstacle_collision = _FakeChecks.obstacle_collision
    mod.goal_reached = _FakeChecks.goal_reached
    mod.solution_feasible = _FakeChecks.solution_feasible
    exc = _FakeChecks.TRIANGLE_EXC if boundary_exc is None else boundary_exc

    def boundary_collision(*a, **kw):
        raise exc

    mod.boundary_collision = boundary_collision
    for name in ("commonroad_dc", "commonroad_dc.feasibility"):
        monkeypatch.setitem(sys.modules, name, types.ModuleType(name))
    monkeypatch.setitem(sys.modules, "commonroad_dc.feasibility.solution_checker", mod)


def test_missing_triangle_is_skip_not_fail(monkeypatch):
    """A missing `triangle` means "could not be judged", not "left the road".

    SKIP in `drawtonomy-verdict/1` exists for exactly this state, and consumers
    exclude SKIP from what counts as judged. Reporting FAIL instead reads as
    "the solution is bad" and sends people looking for a defect that is not
    there.
    """
    _install_fake_checker(monkeypatch)

    class _S:
        dt = 0.1

    checks = verdict_mod._run_official_checks(_S(), None, None)
    by_name = {c["name"]: c for c in checks}
    assert by_name["boundary_collision"]["status"] == "SKIP"
    assert by_name["boundary_collision"]["message"] == verdict_mod.TRIANGLE_MISSING_MESSAGE
    # Not the long official exception text: one line, with the next step.
    assert "pip install triangle" in verdict_mod.TRIANGLE_MISSING_MESSAGE
    assert "\n" not in verdict_mod.TRIANGLE_MISSING_MESSAGE
    # The other three checks still run: a missing tool does not abandon the
    # whole verdict.
    assert by_name["obstacle_collision"]["status"] == "PASS"
    assert by_name["goal_reached"]["status"] == "PASS"
    assert by_name["solution_feasible"]["status"] == "PASS"


def test_other_boundary_exceptions_are_still_fail(monkeypatch):
    """Any other exception stays a FAIL and is never diverted into SKIP."""
    _install_fake_checker(
        monkeypatch,
        boundary_exc=Exception("the ego vehicle leaves the road boundary at step 42"),
    )

    class _S:
        dt = 0.1

    by_name = {c["name"]: c for c in verdict_mod._run_official_checks(_S(), None, None)}
    assert by_name["boundary_collision"]["status"] == "FAIL"
    assert "leaves the road boundary" in by_name["boundary_collision"]["message"]


def test_module_not_found_for_triangle_is_also_skip():
    """A plain ModuleNotFoundError for triangle is the same missing tool."""
    exc = ModuleNotFoundError("No module named 'triangle'")
    assert verdict_mod._is_triangle_missing(exc)
    # A genuine failure that merely mentions "triangle" is not swept up.
    assert not verdict_mod._is_triangle_missing(
        Exception("collision with triangle-shaped obstacle 7")
    )


def test_cli_prints_the_next_step_for_a_skipped_check(monkeypatch, capsys, tmp_path):
    """The CLI prints `[SKIP] boundary_collision (pip install triangle)` and
    exits 0."""
    import drawtonomy_cr.cli as cli_mod

    def fake_write_verdict(scenario, solution, out):
        v = {
            "schema": verdict_mod.SCHEMA,
            "checks": [
                {"name": "obstacle_collision", "status": "PASS"},
                {
                    "name": "boundary_collision",
                    "status": "SKIP",
                    "message": verdict_mod.TRIANGLE_MISSING_MESSAGE,
                },
            ],
        }
        out.write_text(json.dumps(v), encoding="utf-8")
        return v

    monkeypatch.setattr(cli_mod, "write_verdict", fake_write_verdict)
    out = tmp_path / "s.verdict.json"
    rc = cli_mod.main(["verdict", str(tmp_path / "a.xml"), str(tmp_path / "b.xml"), "-o", str(out)])
    # The sidecar was written, so 0: FAIL and SKIP live inside the JSON.
    assert rc == 0
    printed = capsys.readouterr().out.splitlines()
    assert "[SKIP] boundary_collision (pip install triangle)" in printed
    assert "[PASS] obstacle_collision" in printed
