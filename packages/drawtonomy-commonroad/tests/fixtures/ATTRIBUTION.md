# Fixture provenance

## `cutin_*`, `planner_solution.*`

`cutin_commonroad.xml` is a CommonRoad conversion of the esmini sample scenario
`resources/xosc/cut-in.xosc` and the road it references, `resources/xodr/e6mini.xodr`
(https://github.com/esmini/esmini). Those files are licensed under the
Mozilla Public License 2.0 (https://github.com/esmini/esmini/blob/master/LICENSE).
The conversion was made with drawtonomy: the road network became lanelets, the
two vehicles became the ego planning problem and a dynamic obstacle, and a goal
region was added. The converted file is distributed under the same MPL-2.0 terms.

`cutin_solution.*` (a naive planner, obstacle collision) and `planner_solution.*`
(commonroad-reactive-planner, all checks pass) are results computed on that
scenario. The solution files were written by the planners, the `.verdict.json`
files by `drawtonomy-cr verdict` (commonroad-drivability-checker), and the
`.planning-trace.json` file by `TraceWriter`.

`cutin_openscenario.planning-trace.json` is `planner_solution.planning-trace.json`
with the track addressed by `"name": "Ego"` instead of `"role": "ego"`, so that the
same planner result can be opened on the OpenSCENARIO original (esmini
`resources/xosc/cut-in.xosc`), whose entity is named `Ego`. The states are
unchanged, and `"frame": "center"` still describes them.

`planner-candidates/planner_solution.planning-trace.json` is a `TraceWriter` run
on the same cut-in scenario with commonroad-reactive-planner 2025.1, kept
unpruned: each of its 63 replanning cycles carries all 30 sampled candidates
(cost and states), 20 feasible and 10 rejected, instead of only the one driven
per cycle. Its driven states are the same 190 as `planner_solution.xml`, so the
`planner_solution.verdict.json` above applies to it; it exists to demonstrate
the Candidates fan in drawtonomy. Until 2026-09-21 it was named after
`cutin_solution.xml`, a different solution that it does not replay.

## `straight_*`

`straight_commonroad.xml` was drawn in drawtonomy: one straight road, an ego and
a slower vehicle ahead in the same lane, and a goal region near the end. It
contains no third-party content. `straight_idm_solution.*` and
`straight_naive_solution.*` are the output of `examples/idm_planner/idm_planner.py`
in its two modes on that scenario, judged with `drawtonomy-cr verdict`.
`tests/test_example_idm.py` regenerates them and checks that they match.

## Verdict regeneration (2026-09-18)

All four verdicts were regenerated with `drawtonomy-cr verdict`, using
commonroad-io 2024.3, commonroad-drivability-checker 2025.4.0 and triangle
20250106. Both input fingerprints identify the committed XML files. The seven
check statuses are unchanged; collision/feasibility details come from this run.

For `planner_solution` and `cutin_solution`, use `cutin_commonroad.xml` as the
scenario; for both `straight_*_solution` files, use `straight_commonroad.xml`:

```sh
drawtonomy-cr verdict tests/fixtures/cutin_commonroad.xml tests/fixtures/planner_solution.xml
```

The XML and planning traces have not been modified. A CommonRoad verdict checks
the solution XML, not the separate planning-trace JSON or OpenSCENARIO source.

## Fingerprints added to the planning traces (2026-09-21)

`solutionFingerprint` / `scenarioFingerprint` were added to the four traces that
have a CommonRoad solution behind them, by
`tests/fixtures/add_fingerprints.py`. **The states were not touched**: only the
two fields were added.

They were computed rather than produced by a planner run, because neither
producer runs here. `commonroad-reactive-planner` publishes manylinux_x86_64
wheels only and `examples/reactive_planner/Dockerfile` needs a working Docker;
the IDM fixtures could be re-run, but their PASS / FAIL statuses come from the
official checker, which is not installable here either. (The `straight_*` files
have since been regenerated on a Linux runner - see below - so their
fingerprints are now a real writer's output rather than added by this script.)

Each value is the fingerprint of the committed XML the trace's `driven` states
were checked against:

| Trace | Solution | Scenario |
| --- | --- | --- |
| `planner_solution.planning-trace.json` | `planner_solution.xml` | `cutin_commonroad.xml` |
| `straight_idm_solution.planning-trace.json` | `straight_idm_solution.xml` | `straight_commonroad.xml` |
| `straight_naive_solution.planning-trace.json` | `straight_naive_solution.xml` | `straight_commonroad.xml` |
| `planner-candidates/planner_solution.planning-trace.json` | `planner_solution.xml` | `cutin_commonroad.xml` |

The last two rows name the same solution: the candidates trace is an unpruned
run of `planner_solution`, and its 190 `driven` states match that solution to
5e-7 m. The fingerprint names the solution the trace actually replays, which is
the only value that makes the field true.

`cutin_openscenario.planning-trace.json` gets neither field: it has no
CommonRoad solution behind it, and it is the "older trace" case the app has to
keep loading and showing as unchecked.

`tests/test_trace_fixture_fingerprints.py` re-derives every value and re-runs
the 1e-6 m comparison `TraceWriter.write` makes before it agrees to write one,
and `test_reproduces_the_committed_trace_fixture` feeds one of these files back
through the writer and compares the bytes - so these hand-added fields are held
to exactly what a real run would have written.

## `straight_*` regenerated (2026-09-21)

The six `straight_idm_solution.*` and `straight_naive_solution.*` files were
regenerated by `.github/workflows/commonroad-regenerate-fixtures.yml`, run on
an `ubuntu-latest` runner because commonroad-drivability-checker publishes
manylinux_x86_64 wheels only:

https://github.com/kosuke55/drawtonomy/actions/runs/35613419629

The workflow ran `examples/idm_planner/idm_planner.py` on
`straight_commonroad.xml` in both modes and judged each solution with
`drawtonomy-cr verdict`, using commonroad-io 2024.3,
commonroad-drivability-checker 2025.4.0 and triangle 20250106.

The previous files predated the fix that starts the example's solution at the
planning problem's initial state, so both failed the official
`starts_at_correct_state`. The regenerated solutions start at time step 0 with
181 states, and the verdicts are the checker's own:

| mode | verdict |
| --- | --- |
| `idm` | PASS 7/7 |
| `naive` | FAIL 1/7 - `obstacle_collision` at t=37..44, obstacle 2. Intended: the mode holds the initial speed and ignores the car ahead. |

Each trace carries the `solutionFingerprint` / `scenarioFingerprint` the
writer itself computed during the run, because the example passes the solution
and scenario as paths.
