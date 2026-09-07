from pathlib import Path

import pytest

#: Fixture directory shipped with the package (a CommonRoad scenario, a
#: solution, its verdict sidecar and a planning trace). The suite is
#: self-contained and does not depend on the surrounding repository layout.
FIXTURES = Path(__file__).resolve().parent / "fixtures"


@pytest.fixture(scope="session")
def fixtures() -> Path:
    if not FIXTURES.is_dir():
        pytest.skip(f"fixture directory not found: {FIXTURES}")
    return FIXTURES
