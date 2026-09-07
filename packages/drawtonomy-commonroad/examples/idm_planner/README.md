# IDM planner example

[日本語](README.ja.md)

The smallest planner that can be connected to drawtonomy: one file, commonroad-io
and numpy only. The ego follows the centreline of the lanelet it starts on and
IDM (Intelligent Driver Model) car-following sets its speed. Copy it as the
starting point for a planner of your own.

```bash
pip install drawtonomy-commonroad
python3 idm_planner.py scenario.xml out/                 # IDM
python3 idm_planner.py scenario.xml out/ --mode naive    # hold the initial speed
```

Output in `out/`:

| file | |
|---|---|
| `planner_solution.xml` | the CommonRoad solution (required by drawtonomy) |
| `planner_solution.planning-trace.json` | the planning trace, one plan per second (optional, skip with `--no-trace`) |

Then judge and view:

```bash
drawtonomy-cr verdict scenario.xml out/planner_solution.xml   # needs the [checker] extra
drawtonomy-cr open out/
```

On the cut-in scenario shipped with the package
(`tests/fixtures/cutin_commonroad.xml`, a leader that cuts in and stops), the
two modes give the two verdicts:

| mode | `obstacle_collision` | the other three |
|---|---|---|
| `idm` | PASS | PASS |
| `naive` | FAIL (t=124..130, obstacle 15) | PASS |

## What to read

The file has two halves. `PLANNER-SPECIFIC` is the planning: route, IDM, the
forward simulation. `DRAWTONOMY HAND-OFF` at the bottom is the whole contract:

- `write_solution()` writes the solution with commonroad-io. The solution's
  `vehicle_type` (BMW_320i here) is the body the official checker judges with.
- `write_trace()` writes the planning trace with `TraceWriter`, declaring the
  same body so drawtonomy draws what the checker saw. This planner does not
  replan, so each "plan" is the rest of the driven profile from that second on,
  sliced from the driven states so that `write()`'s self-check passes.

Two details that matter for scenarios exported from drawtonomy:

- lanelets have no successors (lanes are only adjacent), so the route is the
  starting lanelet alone;
- a straight lane is a 2-point polyline, so positions are projected onto the
  centreline's segments, never snapped to its nearest vertex.
