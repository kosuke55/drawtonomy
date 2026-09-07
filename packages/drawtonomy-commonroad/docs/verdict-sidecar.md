# Verdict sidecar format (`drawtonomy-verdict/1`)

[日本語](verdict-sidecar.ja.md)

A **verdict sidecar** carries the official CommonRoad checker's judgement of one
solution, as JSON, next to the solution it judges. It is produced by

```bash
drawtonomy-cr verdict scenario.xml solution.xml
```

which writes `<solution stem>.verdict.json` beside the solution (or wherever `-o`
points), and consumed by drawtonomy when the solution and the sidecar are loaded
together.

The sidecar is **optional**. The only required exchange artifact is the
CommonRoad solution XML; replay and drawtonomy's own collision badge work without
it. What the sidecar adds is the verdict of the *official* checker, including the
kinematic feasibility judgement drawtonomy cannot produce on its own.

## Whole-file shape

```json
{
  "schema": "drawtonomy-verdict/1",
  "benchmarkId": "PM1:JB1:ZAM_Example-1_1_T-1:2020a",
  "scenarioId": "ZAM_Example-1_1_T-1",
  "dt": 0.1,
  "tool": { "name": "commonroad-drivability-checker", "version": "2025.4.0" },
  "generatedAt": "2025-11-14T04:52:49Z",
  "checks": [
    {
      "name": "obstacle_collision",
      "status": "FAIL",
      "message": "CollisionException: There is a collision between the scenario obstacles and the ego vehicle in planning problem solution 16",
      "timeSteps": [127, 133],
      "obstacleId": 15
    },
    { "name": "boundary_collision", "status": "PASS" },
    { "name": "goal_reached", "status": "PASS" },
    {
      "name": "solution_feasible",
      "status": "FAIL",
      "message": "Exception: infeasible for planning problems [16]",
      "vehicleModel": "PM"
    }
  ]
}
```

| field | type | meaning |
|---|---|---|
| `schema` | string | Always `drawtonomy-verdict/1`. Required; it is how a consumer recognises the file. |
| `benchmarkId` | string | The solution's benchmark id, verbatim from the CommonRoad solution (`<model>:<cost>:<scenario id>:<version>`). |
| `scenarioId` | string | The scenario's id, from the scenario XML. Used to pair the sidecar with a loaded replay. |
| `dt` | number | The scenario's time step in seconds. Converts `timeSteps` to seconds. |
| `tool` | object | `{ "name": "commonroad-drivability-checker", "version": ... }`. The version is the installed one, read at write time, or `"unknown"` if it cannot be determined. |
| `generatedAt` | string | UTC timestamp, whole seconds, ISO 8601 with a `Z` suffix. |
| `checks` | array | One entry per check, in the order the checks were run. |

## `checks[]`

`name` and `status` are always present. `status` is one of:

| status | meaning |
|---|---|
| `PASS` | The official check ran and did not raise. |
| `FAIL` | The official check ran and raised. `message` carries the exception. |
| `SKIP` | The check **could not be run**, because a tool it needs is missing. This is not a judgement about the solution. |

The four checks written by `drawtonomy-cr verdict`, in order, are
`obstacle_collision`, `boundary_collision`, `goal_reached` and
`solution_feasible` - the four the official
`commonroad_dc.feasibility.solution_checker` provides. `name` is a free string,
so other producers may write other names, but these four are the recommended set.

### Fields that may appear on a check

| field | on | meaning |
|---|---|---|
| `message` | FAIL, SKIP | For FAIL, the official exception as `{type}: {message}`; for `solution_feasible` a richer sentence, see below. For SKIP, one line saying what is missing and how to install it. |
| `timeSteps` | FAIL | `[first, last]`, **inclusive**, **0-based**. Seconds are `step × dt`. |
| `obstacleId` | `obstacle_collision` FAIL | The id of the obstacle the ego collided with, when it could be identified. |
| `vehicleModel` | `solution_feasible` | The vehicle model of the solution's first planning problem solution (`PM`, `KS`, `ST`, ...). Written on PASS and FAIL alike whenever the solution has at least one planning problem solution. |
| `planningProblemId` | `solution_feasible` FAIL | The planning problem whose transitions were infeasible. |
| `reason` | `solution_feasible` FAIL | One of `steering_rate`, `acceleration`, `friction_circle`, `input_bounds`, `state_deviation` - the limit hit most often, ties broken by name so the output is reproducible. |
| `infeasibleTransitions` | `solution_feasible` FAIL | How many state transitions were infeasible. |
| `transitions` | `solution_feasible` FAIL | How many transitions the trajectory has in total. |
| `maxPositionError` | `solution_feasible` FAIL | Metres, rounded to 4 decimals: the largest gap between the recorded state and the state the official forward simulation produced. |
| `maxOrientationError` | `solution_feasible` FAIL, non-PM models | Radians, rounded to 4 decimals. |
| `steeringRateLimit` | `solution_feasible` FAIL, non-PM models | The model's steering rate upper bound, rad/s. |
| `accelerationLimit` | `solution_feasible` FAIL | The model's acceleration upper bound, m/s². |
| `detailError` | `solution_feasible` FAIL | Present only when collecting the detail above itself failed. The official PASS/FAIL is still authoritative and is kept. |

A FAIL **without** `timeSteps` is a judgement about the trajectory as a whole
rather than a moment in it. `solution_feasible` behaves this way when the
per-transition detail could not be recovered. Consumers should present such a
FAIL at the end of the replay ("whole trajectory") rather than at t=0.

### `solution_feasible` detail

The official `solution_feasible` only returns a bool per planning problem, so
`drawtonomy_cr.verdict` reapplies the official `state_transition_feasibility` to
every adjacent pair of states - the official `trajectory_feasibility` stops at
the first failure - and reports every failing transition:

```json
{
  "name": "solution_feasible",
  "status": "FAIL",
  "message": "14 of 147 state transitions (4.2-6.1 s) need a steering rate beyond the KS limit of 0.4 rad/s; position drifts up to 5.8 cm from the simulated state (tolerance 2 cm), orientation up to 0.019 rad (tolerance 0.03).",
  "timeSteps": [42, 61],
  "planningProblemId": 60000,
  "reason": "steering_rate",
  "infeasibleTransitions": 14,
  "transitions": 147,
  "maxPositionError": 0.0581,
  "maxOrientationError": 0.0186,
  "steeringRateLimit": 0.4,
  "accelerationLimit": 11.5,
  "vehicleModel": "KS"
}
```

Every number here comes from an official API: the input the official code
reconstructed, its `input_bounds`, `violates_friction_circle`, and the deviation
between the recorded state and `forward_simulation`'s result against the official
tolerance (2 cm position, 0.03 rad orientation). No vehicle model is implemented
in this package.

### SKIP: `boundary_collision` without `triangle`

`boundary_collision` triangulates the road with Shewchuk's Triangle, which is
free for non-commercial use but requires the author's permission for commercial
use, so it lives in the optional `[boundary]` extra rather than in the default
dependencies. Without it the official checker raises an error meaning *the check
could not be run*, not *the ego left the road*. It is therefore reported as SKIP,
with a one-line message naming the next step:

```json
{
  "name": "boundary_collision",
  "status": "SKIP",
  "message": "road boundary check skipped: the triangle package is not installed (pip install triangle; see its license)"
}
```

The other three checks still run, and `drawtonomy-cr verdict` still exits 0.
A consumer should exclude SKIP from what it counts as judged, rather than
rendering it as FAIL.

## Pairing a sidecar with a solution

A consumer matches the sidecar to a loaded replay by `scenarioId`. When
`scenarioId` is absent it can be derived from `benchmarkId` by stripping the
leading `<model>:<cost>:` and the trailing `:<version>` (e.g. `:2020a`). A
mismatch means the sidecar belongs to a different scenario and must not be
applied.

A verdict that arrives with no replay loaded cannot be applied either: the
solution has to be loaded first, or both dropped together.

By file name, the convention is `<solution stem>.verdict.json` next to the
solution - `planner_solution.xml` pairs with `planner_solution.verdict.json`.
`drawtonomy-cr open` relies on that convention to pair files when a directory
holds the output of more than one planner.

## Exit codes of `drawtonomy-cr verdict`

| code | meaning |
|---|---|
| 0 | The sidecar was written. A FAIL verdict is *inside* the JSON and is not a command failure. |
| 3 | `commonroad-drivability-checker` is not installed, so no verdict could be computed. Nothing is written - never an empty or partial sidecar. |

## See also

- [`planning-trace-format.md`](planning-trace-format.md) - the optional
  planning trace a planner can write alongside its solution.
- [`open-server-protocol.md`](open-server-protocol.md) - what `drawtonomy-cr
  open` serves, and how it announces changes.
