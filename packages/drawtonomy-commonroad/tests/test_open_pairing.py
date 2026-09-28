"""`drawtonomy-cr open` pairs files with the scenario by benchmark id.

A planner run over a batch writes several scenarios and solutions into one
folder. The folder here is built so that name order and benchmark ids disagree:

    a_cutin.xml      scenario  ZAM_...1139
    b_straight.xml   scenario  ZAM_...0119
    a_sol.xml        solution  for ZAM_...0119 (straight)
    b_sol.xml        solution  for ZAM_...1139 (cutin)

Pairing by name would give a_cutin + a_sol, which is wrong.
"""

import shutil
from pathlib import Path

import pytest

from drawtonomy_cr.cli import main
from drawtonomy_cr.serve import build_bundle, scenario_ref, sniff_dir

CUTIN = "ZAM_Untitled202609011139-1_1_T-1"
STRAIGHT = "ZAM_Untitled202609080119-1_1_T-1"


@pytest.fixture
def batch(tmp_path: Path, fixtures: Path) -> Path:
    d = tmp_path / "batch"
    d.mkdir()
    for src, dst in (
        ("cutin_commonroad.xml", "a_cutin.xml"),
        ("straight_commonroad.xml", "b_straight.xml"),
        ("straight_idm_solution.xml", "a_sol.xml"),
        ("straight_idm_solution.verdict.json", "a_sol.verdict.json"),
        ("straight_idm_solution.planning-trace.json", "a_sol.planning-trace.json"),
        ("planner_solution.xml", "b_sol.xml"),
        ("planner_solution.verdict.json", "b_sol.verdict.json"),
        ("planner_solution.planning-trace.json", "b_sol.planning-trace.json"),
    ):
        shutil.copy(fixtures / src, d / dst)
    return d


def test_scenario_ref_reads_each_kind(batch: Path) -> None:
    assert scenario_ref(batch / "a_cutin.xml", "scenario") == CUTIN
    assert scenario_ref(batch / "a_sol.xml", "solution") == STRAIGHT
    assert scenario_ref(batch / "b_sol.verdict.json", "verdict") == CUTIN
    assert scenario_ref(batch / "b_sol.planning-trace.json", "trace") == CUTIN


def test_directory_pairs_the_first_scenario_by_benchmark_id(batch: Path) -> None:
    picked, ambiguous = sniff_dir(batch)
    assert picked["scenario"].name == "a_cutin.xml"
    assert picked["solution"].name == "b_sol.xml"
    assert picked["verdict"].name == "b_sol.verdict.json"
    assert picked["trace"].name == "b_sol.planning-trace.json"
    # The other scenario's files are not candidates, so nothing is ambiguous
    # except the scenario itself.
    assert set(ambiguous) == {"scenario"}


@pytest.mark.parametrize(
    "scenario, solution",
    [("a_cutin.xml", "b_sol.xml"), ("b_straight.xml", "a_sol.xml")],
)
def test_named_scenario_gets_its_own_solution(batch: Path, scenario: str, solution: str) -> None:
    bundle, error = build_bundle(batch / scenario)
    assert error is None
    assert bundle.scenario.name == scenario
    assert bundle.solution.name == solution
    stem = solution.removesuffix(".xml")
    assert bundle.verdict.name == f"{stem}.verdict.json"
    assert bundle.trace.name == f"{stem}.planning-trace.json"
    assert bundle.ambiguous is None
    assert bundle.unpaired is None


def test_directory_lists_every_pair(batch: Path, capsys) -> None:
    rc = main(["open", str(batch), "--copy"])
    assert rc == 0
    out = capsys.readouterr().out
    assert "  a_cutin.xml: b_sol.xml" in out
    assert "  b_straight.xml: a_sol.xml" in out
    assert f"solution: {batch / 'b_sol.xml'}" in out


def test_no_matching_solution_is_said_in_one_line(batch: Path, capsys) -> None:
    for name in ("b_sol.xml", "b_sol.verdict.json", "b_sol.planning-trace.json"):
        (batch / name).unlink()
    rc = main(["open", str(batch / "a_cutin.xml"), "--copy"])
    assert rc == 0
    out = capsys.readouterr().out
    lines = [line for line in out.splitlines() if line.startswith("No solution")]
    assert len(lines) == 1
    assert f"a_sol.xml is for {STRAIGHT}" in lines[0]
    # Nothing from the other scenario is served.
    assert "\nsolution: " not in out
    assert "\ntrace: " not in out
    assert "a_sol" not in out.replace(lines[0], "")


def test_explicit_solution_for_another_scenario_is_served_with_a_warning(
    batch: Path, capsys
) -> None:
    rc = main(
        ["open", str(batch / "a_cutin.xml"), "--copy", "--solution", str(batch / "a_sol.xml")]
    )
    assert rc == 0
    out = capsys.readouterr().out
    assert f"solution: {batch / 'a_sol.xml'}" in out
    # Its own verdict and trace follow it.
    assert f"verdict: {batch / 'a_sol.verdict.json'}" in out
    assert f"trace: {batch / 'a_sol.planning-trace.json'}" in out
    warnings = [line for line in out.splitlines() if f"is for scenario {STRAIGHT}" in line]
    assert len(warnings) == 1
