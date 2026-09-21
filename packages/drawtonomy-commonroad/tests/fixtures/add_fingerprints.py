#!/usr/bin/env python3
"""Add `solutionFingerprint` / `scenarioFingerprint` to the committed traces.

The reactive-planner fixtures cannot be regenerated here: that planner ships
manylinux_x86_64 wheels only, and `examples/reactive_planner/Dockerfile` needs a
working Docker. The IDM fixtures could be re-run, but they are deliberately kept
as the example's older 1-based output (see
`test_committed_straight_fixtures_are_what_the_example_writes`), and their
PASS/FAIL verdicts come from the official checker, which is not installable
here either.

So the states of these files stay exactly as they were, and only the two new
fields are added - computed with the same `drawtonomy_cr.fingerprint` the
writer would have used, over the committed XML each trace's `driven` states
were checked against. `test_trace_fixture_fingerprints.py` re-derives every
value and re-runs that check, so a wrong pairing fails the suite rather than
sitting in a fixture.

    python3 tests/fixtures/add_fingerprints.py [--check]
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))

from drawtonomy_cr.fingerprint import fingerprint  # noqa: E402

FIXTURES = Path(__file__).resolve().parent

#: trace -> (solution XML, scenario XML). `cutin_openscenario` is the
#: OpenSCENARIO demo: it has no CommonRoad solution and no scenario id, so it
#: gets neither field and stays the "older trace" the app shows as unchecked.
PAIRS = {
    "planner_solution.planning-trace.json": (
        "planner_solution.xml",
        "cutin_commonroad.xml",
    ),
    "straight_idm_solution.planning-trace.json": (
        "straight_idm_solution.xml",
        "straight_commonroad.xml",
    ),
    "straight_naive_solution.planning-trace.json": (
        "straight_naive_solution.xml",
        "straight_commonroad.xml",
    ),
    # The same planner_solution run, kept unpruned so every sampled candidate
    # survives. Its driven states are the 190 in planner_solution.xml.
    "planner-candidates/planner_solution.planning-trace.json": (
        "planner_solution.xml",
        "cutin_commonroad.xml",
    ),
}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check", action="store_true", help="report without writing anything"
    )
    args = parser.parse_args()

    changed = False
    for name, (solution, scenario) in PAIRS.items():
        path = FIXTURES / name
        trace = json.loads(path.read_text(encoding="utf-8"))
        wanted = {
            "scenarioFingerprint": fingerprint((FIXTURES / scenario).read_bytes()),
            "solutionFingerprint": fingerprint((FIXTURES / solution).read_bytes()),
        }
        if all(trace.get(k) == v for k, v in wanted.items()):
            print(f"[OK]   {name}")
            continue
        changed = True
        print(f"[SET]  {name} <- {solution} / {scenario}")
        if args.check:
            continue
        # The writer's own key order: build() lays out schema / scenario /
        # producer / frame / tracks, and write() appends the two fingerprints
        # after the self-check passes. `test_reproduces_the_committed_trace_fixture`
        # compares the bytes, so getting this wrong fails the suite.
        ordered = dict(trace)
        ordered["solutionFingerprint"] = wanted["solutionFingerprint"]
        ordered["scenarioFingerprint"] = wanted["scenarioFingerprint"]
        # Each file keeps the layout it was committed with. The candidate
        # fixture is minified, and re-indenting 1,890 candidate trajectories
        # would add 6 MB to the repository to change nothing a reader sees.
        indent = 2 if path.read_text(encoding="utf-8").startswith("{\n") else None
        separators = None if indent else (",", ":")
        path.write_text(
            json.dumps(ordered, indent=indent, separators=separators) + "\n",
            encoding="utf-8",
        )

    if args.check and changed:
        print("fingerprints are out of date; run without --check", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
