"""
drawtonomy_cr.trace - the planning trace a planner writes
(`drawtonomy-planning-trace-v1`).

`docs/planning-trace-format.md` is the specification; this module only writes the
file and self-checks it.

A trace is **optional**. The only required exchange artifact is the CommonRoad
solution XML; a trace adds what the planner intended at each replanning cycle.
Where the solution keeps only the answer, a trace keeps the answer and the
reasoning, so a single file replays the whole run.

    from drawtonomy_cr.trace import TraceWriter

    w = TraceWriter(dt=0.1, vehicle=dict(length=4.508, width=1.61, refToCenter=1.4227,
                                         type="BMW_320i"))
    for cycle in my_planner_loop():
        w.plan(t=cycle.t, states=cycle.trajectory)   # one entry per cycle
    w.driven(executed_states)                       # what the ego actually drove
    w.write("solution.planning-trace.json", solution="solution.xml",
            scenario="scenario.xml")

`states` accepts commonroad-io `State` objects (`position` / `orientation` /
`velocity` / `time_step`) and plain
`{"x":, "y":, "orientation":, "v":, "time_step":}` dicts alike. A dict needs `x`
and `y`; heading is `orientation` or `h`, speed is `velocity` or `v`, and time is
either `time_step` (integer steps) or `t` (seconds).

The self-check runs inside `write()` and raises **without writing** on failure,
so a broken trace is never left behind silently.

Passing the solution and scenario as **paths** also records their fingerprints
(`solutionFingerprint` / `scenarioFingerprint`), the same values a checker
verdict of the same files carries. That is what lets drawtonomy show a verdict
loaded next to this trace as verified rather than unchecked.
"""

import json
import math
import warnings
from pathlib import Path

from .fingerprint import fingerprint as _fingerprint
from .schema import SCHEMA_PATH, schema_failures

SCHEMA = "drawtonomy-planning-trace-v1"

#: The JSON Schema this package ships, re-exported here because `trace` is the
#: module a producer imports. Point a validator of your own at it:
#: `json.loads(SCHEMA_PATH.read_text())`.
__all__ = [
    "SCHEMA",
    "SCHEMA_PATH",
    "TraceSelfCheckError",
    "TraceWriter",
    "self_check",
]

#: Position comparison tolerance, matching the 6-decimal precision traces are
#: written with.
POSITION_TOLERANCE = 1e-6


class TraceSelfCheckError(Exception):
    """The self-check in `write()` failed; no trace was written."""


def _get(state, *names):
    """Read a State attribute or dict key, trying the names in order. None if
    none of them is present."""
    if isinstance(state, dict):
        for name in names:
            if name in state and state[name] is not None:
                return state[name]
        return None
    for name in names:
        value = getattr(state, name, None)
        if value is not None:
            return value
    return None


def _position(state):
    """Extract (x, y). CommonRoad's `position` is a length-2 array."""
    pos = _get(state, "position")
    if pos is not None:
        return float(pos[0]), float(pos[1])
    x, y = _get(state, "x"), _get(state, "y")
    if x is None or y is None:
        raise ValueError(
            "state has no position: expected `position`, or both `x` and `y`"
        )
    return float(x), float(y)


def _time_seconds(state, dt: float):
    """Time in seconds: `time_step` times dt when present, otherwise `t` read as
    seconds."""
    step = _get(state, "time_step")
    if step is not None:
        return round(float(step) * dt, 9)
    t = _get(state, "t")
    if t is None:
        raise ValueError("state has no time: expected `time_step` or `t`")
    return round(float(t), 9)


def _encode_state(state, dt: float) -> dict:
    """CommonRoad centre-referenced state -> planning trace state dict.

    Six decimals is the precision `CommonRoadSolutionWriter` writes positions
    with. Keeping more only records float noise (1.5671029999999997 for
    1.567103) and inflates the file.
    """
    x, y = _position(state)
    entry = {
        "t": _time_seconds(state, dt),
        "x": round(x, 6),
        "y": round(y, 6),
    }
    heading = _get(state, "orientation", "h")
    if heading is not None:
        entry["h"] = round(float(heading), 6)
    velocity = _get(state, "velocity", "v")
    if velocity is not None:
        entry["v"] = round(float(velocity), 6)
    return entry


def _encode_states(states, dt: float) -> list:
    return [_encode_state(st, dt) for st in states]


class TraceWriter:
    """Build and write the planning trace of one run (one actor).

    Args:
        dt: the scenario time step [s], used to convert `time_step` to seconds.
        vehicle: optional body the planner planned with
            (`{"length":, "width":, "refToCenter":, "type":}`). A CommonRoad
            planning problem carries no ego dimensions, so without this the app
            falls back to the dimensions it was drawn with, which need not match
            the body the official checker judged.
        scenario: optional scenario identifier (e.g. `str(scenario.scenario_id)`).
        producer: optional `{"name":, "version":}`. Informational only.
        role: defaults to `"ego"`. Pass `role=None` when passing `name`.
        name: optional, to match the actor by entity name instead.
        frame: `"center"` (default, the meaning of CommonRoad's position) or
            `"ref"` (rear axle centre).
        candidate_stride: keep every n-th state of every candidate (1, the
            default, keeps all of them). A sampling planner's discarded
            candidates outnumber its driven states by orders of magnitude, and
            they are drawn as a fan rather than followed, so thinning them is
            the one knob that keeps a file readable. It never touches `driven`
            or `plans`.
    """

    def __init__(
        self,
        dt: float,
        vehicle: dict | None = None,
        scenario: str | None = None,
        producer: dict | None = None,
        role: str | None = "ego",
        name: str | None = None,
        frame: str = "center",
        candidate_stride: int = 1,
    ):
        if dt is None or not math.isfinite(float(dt)) or float(dt) <= 0:
            raise ValueError(f"dt must be a finite positive number, got {dt!r}")
        if frame not in ("center", "ref"):
            raise ValueError(f'frame must be "center" or "ref", got {frame!r}')
        if (role is None) == (name is None):
            raise ValueError(
                "give exactly one of role / name: a track needs a single rule for "
                "which actor it belongs to"
            )
        if int(candidate_stride) < 1:
            raise ValueError(
                f"candidate_stride must be 1 or more, got {candidate_stride!r}"
            )
        self.dt = float(dt)
        self.vehicle = dict(vehicle) if vehicle else None
        self.scenario = scenario
        self.producer = dict(producer) if producer else None
        self.role = role
        self.name = name
        self.frame = frame
        self.candidate_stride = int(candidate_stride)
        self._plans: list[dict] = []
        self._driven: list[dict] | None = None

    def plan(self, t: float | None = None, states=None, candidates=None) -> dict:
        """Add the plan of one replanning cycle.

        `t` is when the plan was issued [s]; it defaults to the first state's
        time. The format requires `states[0].t == t`, so a mismatch is rejected
        here rather than silently corrected. Empty `states` are ignored, since
        they are not a plan.

        `candidates` is the set of trajectories the planner evaluated in this
        cycle and did not execute, as
        `{"states": [...], "cost": float, "feasible": bool, "reason": str}`
        dicts. Only `states` is required; a planner that scores everything
        writes `cost`, one that rejects trajectories writes `feasible` /
        `reason`. `states` takes the same shapes as the plan's own. Candidates
        are thinned by `candidate_stride` and are never compared against
        `driven`: they are what the planner rejected, so they are not supposed
        to agree with what it drove.
        """
        if states is None:
            raise ValueError("plan() needs states")
        encoded = _encode_states(states, self.dt)
        if not encoded:
            return {}
        head = encoded[0]["t"]
        if t is None:
            t = head
        elif abs(float(t) - head) > 1e-6:
            raise ValueError(
                f"plan issued at t={float(t)} but its first state is at t={head}: "
                "a plan has to start at the moment it was issued"
            )
        entry = {"t": round(float(t), 9), "states": encoded}
        if candidates is not None:
            encoded_candidates = [
                self._encode_candidate(c, index, len(self._plans))
                for index, c in enumerate(candidates)
            ]
            if encoded_candidates:
                entry["candidates"] = encoded_candidates
        self._plans.append(entry)
        return entry

    def _encode_candidate(self, candidate, index: int, plan_index: int) -> dict:
        """One candidate -> its trace entry. Raises on anything the format does
        not allow, naming where it was, because a plan is built in a loop and
        "candidate 7 of plan 3" is the only way to find it again."""
        where = f"candidates[{index}] of plan {plan_index}"
        if not isinstance(candidate, dict):
            raise ValueError(
                f"{where}: a candidate is a dict with `states` and optionally "
                f"`cost` / `feasible` / `reason`, got {type(candidate).__name__}"
            )
        states = candidate.get("states")
        if states is None:
            raise ValueError(f"{where}: a candidate needs `states`")
        encoded = _encode_states(states, self.dt)[:: self.candidate_stride]
        if not encoded:
            raise ValueError(f"{where}: `states` is empty")
        entry: dict = {"states": encoded}
        if candidate.get("cost") is not None:
            cost = float(candidate["cost"])
            if not math.isfinite(cost):
                raise ValueError(f"{where}: `cost` must be finite, got {cost!r}")
            entry["cost"] = round(cost, 6)
        if candidate.get("feasible") is not None:
            feasible = candidate["feasible"]
            if not isinstance(feasible, bool):
                raise ValueError(
                    f"{where}: `feasible` must be true or false, got "
                    f"{type(feasible).__name__}"
                )
            entry["feasible"] = feasible
        if candidate.get("reason") is not None:
            reason = candidate["reason"]
            if not isinstance(reason, str) or not reason:
                raise ValueError(
                    f"{where}: `reason` must be a non-empty string, got {reason!r}"
                )
            entry["reason"] = reason
        return entry

    def driven(self, states) -> list:
        """Record the states actually driven. For a closed-loop planner this is
        the same list as the solution."""
        encoded = _encode_states(states, self.dt)
        if not encoded:
            raise ValueError("driven() needs at least one state")
        self._driven = encoded
        return encoded

    def build(self) -> dict:
        """Assemble the trace dict without writing it."""
        if self._driven is None:
            raise ValueError(
                "driven() has not been called: a trace without `driven` cannot be "
                "loaded on its own"
            )
        if not self._plans:
            raise ValueError("plan() has not been called: a trace needs at least one plan")
        track: dict = {}
        if self.role is not None:
            track["role"] = self.role
        else:
            track["name"] = self.name
        track["driven"] = self._driven
        track["plans"] = self._plans
        if self.vehicle:
            track["vehicle"] = self.vehicle
        trace: dict = {"schema": SCHEMA}
        if self.scenario is not None:
            trace["scenario"] = str(self.scenario)
        if self.producer:
            trace["producer"] = self.producer
        trace["frame"] = self.frame
        trace["tracks"] = [track]
        return trace

    def write(
        self,
        path,
        solution=None,
        scenario=None,
        replanning_frequency: int = 1,
        verbose: bool = True,
    ) -> dict:
        """Self-check, then write the JSON. On failure this raises and writes
        nothing.

        Args:
            path: output path. The convention is
                `<solution name>.planning-trace.json`.
            solution: optional path to the solution XML (or its bytes), a
                `Solution` object, or a state list. When given, `driven` is
                checked against it to within 1e-6 m. When it is a path or bytes
                **and** that check passes, the solution's fingerprint is written
                as `solutionFingerprint`; see `_solution_fingerprint`.
            scenario: optional path to the scenario XML, or its bytes, whose
                fingerprint is written as `scenarioFingerprint`. Nothing is
                checked against it: the scenario is the run's input, and the
                fingerprint only says which file it was.
            replanning_frequency: how many states at the head of each plan were
                actually executed. That many are compared against `driven`.
            verbose: print one PASS / FAIL line to stdout.
        """
        trace = self.build()
        solution_states = _solution_states(solution) if solution is not None else None
        self_check(
            trace,
            self.dt,
            solution_states=solution_states,
            replanning_frequency=replanning_frequency,
            verbose=verbose,
        )
        # Written only now, after the self-check passed: the fingerprint is the
        # trace saying "my driven states are this solution", and that claim is
        # exactly what the check just proved.
        solution_fingerprint = _solution_fingerprint(solution)
        if solution_fingerprint is not None:
            trace["solutionFingerprint"] = solution_fingerprint
        if scenario is not None:
            trace["scenarioFingerprint"] = _fingerprint(_raw_bytes(scenario, "scenario"))
        out = Path(path)
        if out.parent != Path(""):
            out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(trace, indent=2) + "\n", encoding="utf-8")
        if verbose:
            n_states = sum(len(p["states"]) for p in trace["tracks"][0]["plans"])
            print(
                f"[INFO] wrote planning trace to {out} "
                f"({len(trace['tracks'][0]['driven'])} driven states, "
                f"{len(trace['tracks'][0]['plans'])} plans, {n_states} planned states)"
            )
        return trace


def _solution_states(solution):
    """Reduce a solution to a state list. Accepts a path, the XML bytes, a
    `Solution` object, or a state list."""
    if isinstance(solution, bytes):
        from tempfile import TemporaryDirectory

        from commonroad.common.solution import CommonRoadSolutionReader

        with TemporaryDirectory(prefix="drawtonomy-trace-") as directory:
            xml = Path(directory) / "solution.xml"
            xml.write_bytes(solution)
            solution = CommonRoadSolutionReader.open(str(xml))
    elif isinstance(solution, (str, Path)):
        from commonroad.common.solution import CommonRoadSolutionReader

        solution = CommonRoadSolutionReader.open(str(solution))
    pp_solutions = getattr(solution, "planning_problem_solutions", None)
    if pp_solutions is not None:
        if not pp_solutions:
            raise ValueError("solution has no planning problem solutions")
        return list(pp_solutions[0].trajectory.state_list)
    trajectory = getattr(solution, "state_list", None)
    if trajectory is not None:
        return list(trajectory)
    return list(solution)


def _raw_bytes(source, what: str) -> bytes:
    """The bytes of a file given as a path, or the bytes themselves."""
    if isinstance(source, bytes):
        return source
    if isinstance(source, (str, Path)):
        return Path(source).read_bytes()
    raise TypeError(
        f"{what} must be a path or bytes to be fingerprinted, got "
        f"{type(source).__name__}"
    )


def _solution_fingerprint(solution):
    """The fingerprint to record for `solution`, or None with a warning.

    A fingerprint names bytes, so only a solution given as a file (or as its
    bytes) has one. A `Solution` object or a state list was built in memory and
    the writer cannot know which file, if any, it will be written to - guessing
    would produce a trace claiming a solution it never saw. The caller is told,
    because a silently missing fingerprint is the difference between a verdict
    that verifies against this trace and one that cannot.
    """
    if solution is None:
        return None
    if isinstance(solution, (str, Path, bytes)):
        return _fingerprint(_raw_bytes(solution, "solution"))
    warnings.warn(
        "planning trace written without solutionFingerprint: solution was given "
        f"as {type(solution).__name__}, which has no file bytes to fingerprint. "
        "Pass the path of the solution XML instead to let a checker verdict of "
        "the same solution verify against this trace.",
        stacklevel=3,
    )
    return None


def _candidate_failures(track: dict) -> list:
    """Every way a plan's `candidates` can be malformed, all of them at once.

    A candidate is a trajectory the planner considered. The reader refuses a
    file whose candidates are malformed rather than skipping them, so a writer
    that produces one has made the whole trace unloadable - which is worth
    saying here, in full, rather than one error at a time.
    """
    failures = []
    for plan_index, plan in enumerate(track.get("plans", [])):
        candidates = plan.get("candidates")
        if candidates is None:
            continue
        if not isinstance(candidates, list):
            failures.append(
                f"planning trace self-check (candidates): plan {plan_index} has "
                f"`candidates` of type {type(candidates).__name__}, expected a list"
            )
            continue
        for index, candidate in enumerate(candidates):
            where = (
                f"planning trace self-check (candidates): candidates[{index}] of "
                f"plan {plan_index}"
            )
            if not isinstance(candidate, dict):
                failures.append(f"{where} is not an object")
                continue
            states = candidate.get("states")
            if not isinstance(states, list) or not states:
                failures.append(f"{where} has no states")
                continue
            times = []
            malformed_state = False
            for state in states:
                if not isinstance(state, dict) or not isinstance(
                    state.get("t"), (int, float)
                ):
                    failures.append(f"{where} has a state without a numeric `t`")
                    malformed_state = True
                    break
                times.append(float(state["t"]))
            if malformed_state:
                continue
            if any(b <= a for a, b in zip(times, times[1:])):
                failures.append(
                    f"{where} has states that do not advance in time "
                    f"(t={times[:5]}...)"
                )
            cost = candidate.get("cost")
            if cost is not None and (
                isinstance(cost, bool)
                or not isinstance(cost, (int, float))
                or not math.isfinite(float(cost))
            ):
                failures.append(f"{where} has a non-finite `cost` ({cost!r})")
            feasible = candidate.get("feasible")
            if feasible is not None and not isinstance(feasible, bool):
                failures.append(
                    f"{where} has `feasible` of type {type(feasible).__name__}, "
                    "expected true or false"
                )
            reason = candidate.get("reason")
            if reason is not None and (not isinstance(reason, str) or not reason):
                failures.append(f"{where} has a `reason` that is not a non-empty string")
    return failures


def self_check(
    trace: dict,
    dt: float,
    solution_states=None,
    replanning_frequency: int = 1,
    verbose: bool = True,
) -> None:
    """Check the two identities that make a trace trustworthy. Raises
    `TraceSelfCheckError` on failure.

    (a) `driven` matches the solution's trajectory. A trace can be loaded on its
        own and drives the ego from `driven`, so a mismatch would make the same
        run look different depending on which file was dropped in.

    (b) The first `replanning_frequency` states of each plan match `driven` at
        the same times. Until the next replanning the ego really does execute the
        head of the plan, so at the moment a plan is issued the planned trajectory and the
        moving body have to coincide. A mismatch is the signature of a trace
        assembled in a different frame, or through a different transform, than
        the run it claims to describe.

    Both compare positions to 1e-6 m, the precision traces are written with.

    The shape of the file is validated **first**, against
    `planning-trace-v1.schema.json`, and a file of the wrong shape is reported
    as that and nothing else. The checks above then add what a schema cannot
    state: that the numbers agree, and that a candidate's states advance in
    time. Candidates are not compared against `driven` - they are the
    trajectories the planner rejected.
    """
    failures: list[str] = [
        f"planning trace self-check (schema): {failure}"
        for failure in schema_failures(trace)
    ]
    if failures:
        # Nothing below can be trusted to read a file of the wrong shape, so the
        # schema failures are the whole report.
        raise TraceSelfCheckError("; ".join(failures))

    track = trace["tracks"][0]
    driven = track["driven"]

    failures.extend(_candidate_failures(track))

    # --- (a) driven == solution -------------------------------------------
    if solution_states is not None:
        ok_a = True
        if len(driven) != len(solution_states):
            failures.append(
                f"planning trace self-check (driven): {len(driven)} driven states "
                f"but the solution has {len(solution_states)}"
            )
            ok_a = False
        worst_driven = 0.0
        for st, ref in zip(driven, solution_states):
            step = int(round(st["t"] / dt))
            ref_step = _get(ref, "time_step")
            ref_step = (
                int(ref_step) if ref_step is not None else int(round(_get(ref, "t") / dt))
            )
            if step != ref_step:
                failures.append(
                    f"planning trace self-check (driven): time step {step} does not "
                    f"line up with the solution's {ref_step}"
                )
                ok_a = False
                break
            rx, ry = _position(ref)
            worst_driven = max(worst_driven, abs(st["x"] - rx), abs(st["y"] - ry))
        if worst_driven > POSITION_TOLERANCE:
            failures.append(
                f"planning trace self-check (driven): max position diff "
                f"{worst_driven:.3e} m > {POSITION_TOLERANCE:g} against the solution"
            )
            ok_a = False
        if ok_a and verbose:
            print(
                f"[PASS] planning trace self-check (driven): {len(driven)} states match "
                f"the solution (max position diff {worst_driven:.3e} m "
                f"<= {POSITION_TOLERANCE:g})"
            )

    # --- (b) plan heads == driven -----------------------------------------
    by_step = {int(round(st["t"] / dt)): (st["x"], st["y"]) for st in driven}
    worst = 0.0
    checked = 0
    offenders: list[tuple[int, float]] = []
    for plan in track["plans"]:
        for st in plan["states"][: max(1, int(replanning_frequency))]:
            step = int(round(st["t"] / dt))
            ref = by_step.get(step)
            if ref is None:
                # The tail of the last plan runs past what was driven, so only
                # the executed head is compared.
                continue
            d = max(abs(st["x"] - ref[0]), abs(st["y"] - ref[1]))
            checked += 1
            worst = max(worst, d)
            if d > POSITION_TOLERANCE:
                offenders.append((step, d))
    if offenders:
        failures.append(
            f"planning trace self-check (plans): {len(offenders)} of {checked} states "
            f"differ from what was driven (max {worst:.3e} m > {POSITION_TOLERANCE:g}); "
            f"first offenders={offenders[:5]}"
        )
    elif verbose:
        print(
            f"[PASS] planning trace self-check (plans): {checked} plan states match the "
            f"driven trajectory (max position diff {worst:.3e} m "
            f"<= {POSITION_TOLERANCE:g})"
        )

    if failures:
        # Told once, in one place: every failure in a single exception, and no
        # file written.
        raise TraceSelfCheckError("; ".join(failures))
