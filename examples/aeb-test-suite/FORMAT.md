# File formats

Terms follow the glossary in [README.md](README.md#glossary): the folder is a test suite, `testcase.yaml` is a test case, a result folder is a test run, and each entry of `runs` is one concrete scenario.

## Layout

- A folder under `testcases/` that contains `testcase.yaml` is one test case. Folders above it are groups of test cases.
- Test case IDs are unique across the repository. Results are keyed by ID, not by folder.
- A variant (e.g. `motorcycle/`) uses the parent ID plus a suffix (`TC-AEB-003-MC`), the same parameters and the same requirements.

## group.yaml (optional)

```yaml
title: Cut-in
description: A vehicle in the adjacent lane cuts in ahead of the ego and brakes.
tags: {maneuver: cut-in, road: straight}
```

Without it, the folder name is the title.

## testcase.yaml

```yaml
id: TC-AEB-001
title: Lead car brakes (CCRb)
requirements: [REQ-AEB-001]
tags: {actor: car, maneuver: braking, road: straight}
description: Same text as the xosc FileHeader description.   # functional scenario (text)
scenario: aeb-lead-brake.xosc            # logical scenario; ego marked with ObjectController Property isEgo=true
distribution: aeb-lead-brake.pvd.xosc    # parameter ranges of the logical scenario: OpenSCENARIO
                                         # ParameterValueDistribution (Deterministic), optional
diagram: aeb-lead-brake.drawtonomy.svg   # functional scenario (diagram), editable drawtonomy SVG
ego: Ego                                 # ego entity name
target: Lead                             # main target entity name (TTC, gap)
sut: [aeb]                               # SUTs to run; empty = scenario only
parameters:                              # display order; names match xosc ParameterDeclaration
  - {name: EgoSpeed, label: Ego speed, unit: km/h}
criteria:                                # pass criteria (expected results): PASS when all hold
  - {kpi: collision, op: "==", value: false, label: No collision}
  - {kpi: min_gap, op: ">=", value: 1.0, unit: m, label: Min gap}
scenarioCheck:                           # optional, used by run_sweep.py --scenario-check
  events: [LeadBrake]
  allowCollisions: [[Ego, Lead]]
```

Tag keys follow OpenLABEL / ISO 34504: `actor` (car, motorcycle, ...), `maneuver` (cut-in, braking, stationary, ...), `road` (straight, ...). Other keys are allowed.

## requirements/REQ-*.md

```markdown
---
id: REQ-AEB-003
title: Cut-in vehicle
parent: REQ-AEB     # optional
---
Requirement text.
```

Requirements link to test cases many-to-many through `testcase.yaml` `requirements`.

## results/\<sut\>@\<version\>/\<TC-ID\>.json

A folder `results/<sut>@<version>/` is one test run (one SUT version over the whole suite), with one file per test case. Each entry of `runs` is one concrete scenario (one set of parameter values, one cell of the heatmap). Schema `drawtonomy-runs-v0`:

```json
{
  "schema": "drawtonomy-runs-v0",
  "testcase": "TC-AEB-001",
  "sut": {"id": "aeb", "version": "1.2", "label": "Sample AEB v1.2", "config": {}},
  "scenarioSha256": "<sha256 of the xosc>",
  "generatedAt": "2026-09-27T09:00:00Z",
  "dt": 0.02,
  "parameters": [{"name": "EgoSpeed", "unit": "km/h", "values": [30, 40, 50]}],
  "summary": {"total": 196, "pass": 196, "fail": 0, "error": 0},
  "runs": [{
    "id": "r0001",
    "params": {"EgoSpeed": 30, "Gap": 12, "LeadDecel": 2},
    "verdict": "PASS",
    "failed": [],
    "kpis": {"collision": false, "min_ttc": 1.42, "min_gap": 3.1, "impact_speed": 0.0,
             "max_decel": 7.8, "aeb_trigger_time": 2.34},
    "unavoidable": false,
    "log": {"path": "logs/TC-AEB-001/r0001.csv", "url": null, "sha256": "<sha256 of the file>", "bytes": 21034},
    "trace": {"path": "logs/TC-AEB-001/r0001.planning-trace.json", "url": null, "sha256": "…", "bytes": 30127},
    "series": {"t": [], "gap": [], "ego_v": [], "ego_a": [], "target_v": [], "ttc": []}
  }]
}
```

- `verdict`: `PASS`, `FAIL` or `ERROR`. `failed` lists the kpi names of failed criteria.
- Units: s, m, m/s, m/s² (deceleration is positive). `min_ttc: null` means infinite.
- `collision` and `min_gap` use oriented bounding boxes (reference point + BoundingBox.Center.x, length x width, heading), the same geometry as drawtonomy FAIL CONDITIONS.
- `unavoidable`: the run collides even with ideal braking (10 m/s², no delay, friction-limited) from t=0.
- `log` / `trace` (optional): file references of the same shape.
  - `path`: relative to the JSON file. `url` (optional, `null` = none): an https URL to read the file from instead, e.g. when logs are kept outside the repository (the server must allow CORS). `url` wins over `path`.
  - `sha256` / `bytes` (optional): of the file as stored. drawtonomy checks `sha256` after reading and does not replay a file that does not match.
  - The old form, a plain string path (`"log": "logs/TC-AEB-001/r0001.csv"`), is still read.
- `log`: esmini `--csv_logger` CSV, slimmed by `tools/slim_logs.py`:
  - rows every 0.04 s (every 2nd 0.02 s step, `Index` keeps the step number) plus the last row (the collision frame when the run stops on a collision)
  - columns per entity: `Entity_Name`, `Current_Speed`, `bb_x`, `bb_length`, `bb_width`, `World_Position_X`, `World_Position_Y`, `World_Heading_Angle`; the preamble, `#<n> <name> [unit]` headers and `, ` separator are as esmini writes them
  - positions and sizes in mm, heading 1e-4 rad, speed 1e-3 m/s
- `trace` (optional): ego planning trace, schema `drawtonomy-planning-trace-v1`, `frame: "ref"`. `driven` has the same times and positions as the Ego rows of the CSV; `plans` holds a plan every 0.5 s plus each plan whose predicted positions moved more than 0.5 m from the last kept plan (e.g. when braking starts); plan states are every 0.1 s, up to 3 s ahead.
- `series`: time series at 10 Hz.
- Scenario-only checks go to `results/scenario-check/<TC-ID>.json` with `sut: {"id": "scenario-check", "version": "-"}` and no logs (`"log": null`).

## Serving

`tools/serve.py` serves the repository root at `http://localhost:8765/` with CORS and lists all files at `/__files.json`.
