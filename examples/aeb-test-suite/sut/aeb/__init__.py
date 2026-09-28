"""Sample SUT package. The runner (tools/run_sweep.py) uses only these three names."""
from .aeb import AEB, Observation, TrackedObject  # noqa: F401


def create_controller(params: dict, dt: float) -> AEB:
    return AEB({**params, 'dt': dt})
