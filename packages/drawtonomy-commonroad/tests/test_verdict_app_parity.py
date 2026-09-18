"""Cross-implementation parity: the fingerprints this package writes must equal
the ones the drawtonomy app computes for the same files.

The app hashes the text of the files the user drops, in the browser, with its
own SHA-256 implementation. If the two implementations ever disagree the app
rejects a matching verdict as a mismatched input, so the agreement is checked
against values the app committed rather than against a second copy of this
package's own arithmetic.

`tests/fixtures/app-parity/` holds the app's fixtures and the verdicts it
produced from them; the expected values are read out of those verdicts. See the
README in that directory.
"""
import json
from pathlib import Path

import pytest

from drawtonomy_cr import verdict

APP_PARITY = Path(__file__).parent / "fixtures" / "app-parity"

#: Both app verdicts judge scenario ZAM_Untitled202609011139-1_1_T-1, whose XML
#: is byte-for-byte this package's own cutin_commonroad.xml (asserted below), so
#: the 700 kB scenario is not duplicated into app-parity/.
SCENARIO = "cutin_commonroad.xml"


@pytest.fixture
def fixtures():
    return Path(__file__).parent / "fixtures"


@pytest.mark.parametrize(
    "verdict_name,solution_name",
    [
        ("planner_solution.verdict.json", "planner_solution.xml"),
        ("cutin_solution.verdict.json", "cutin_solution.xml"),
    ],
)
def test_fingerprints_match_the_values_the_app_computed(
    fixtures, verdict_name, solution_name
):
    app_verdict = json.loads((APP_PARITY / verdict_name).read_text("utf-8"))
    solution = APP_PARITY / solution_name

    assert verdict._input_fingerprint(solution.read_bytes()) == app_verdict[
        "solutionFingerprint"
    ]
    assert verdict._input_fingerprint(
        (fixtures / SCENARIO).read_bytes()
    ) == app_verdict["scenarioFingerprint"]


def test_the_parity_scenario_is_the_packages_own_scenario_file(fixtures):
    """The parity test above hashes this package's scenario copy but compares
    against the app's value, which only proves anything while the two files are
    the same bytes."""
    app_verdicts = [
        json.loads(path.read_text("utf-8"))
        for path in sorted(APP_PARITY.glob("*.verdict.json"))
    ]
    assert app_verdicts
    assert {v["scenarioId"] for v in app_verdicts} == {
        "ZAM_Untitled202609011139-1_1_T-1"
    }
    # Same scenario id as the package fixture the parity test actually hashes.
    package_verdict = json.loads(
        (fixtures / "cutin_solution.verdict.json").read_text("utf-8")
    )
    assert package_verdict["scenarioId"] == "ZAM_Untitled202609011139-1_1_T-1"
    assert package_verdict["scenarioFingerprint"] == verdict._input_fingerprint(
        (fixtures / SCENARIO).read_bytes()
    )


def test_a_different_solution_file_gets_a_different_fingerprint():
    """The app's planner_solution.xml and this package's copy differ only in the
    `date` attribute, and that is enough to separate them. The fingerprint is
    content identity, not scenario identity."""
    app_solution = (APP_PARITY / "planner_solution.xml").read_bytes()
    package_solution = (
        Path(__file__).parent / "fixtures" / "planner_solution.xml"
    ).read_bytes()
    assert app_solution != package_solution
    assert verdict._input_fingerprint(app_solution) != verdict._input_fingerprint(
        package_solution
    )
