# drawtonomy planning trace (`drawtonomy-planning-trace-v1`)

[日本語](planning-trace-format.ja.md)

A **planning trace** records both what an actor *drove* in one run and what its planner
*intended* at every replanning cycle. It is an open, plain-JSON file that any planner can emit
and that drawtonomy reads to replay the run and draw the planner's own output on top of an
authored scenario.

## Why this file exists

A CommonRoad solution stores one trajectory: the single path the ego actually drove. A cyclic
planner computes a new trajectory every replanning cycle, each looking several seconds ahead,
and executes only the first fraction of a second of it. The planning trace keeps both: each
track carries `driven` (the states the actor actually drove) and `plans` (what its planner
intended at each cycle). That makes a trace self-contained, so dropping one file into
drawtonomy reproduces the run. The CommonRoad solution remains the official checker format;
the trace extends it.

### How drawtonomy draws it

| Visual | Means | Source |
| --- | --- | --- |
| **Path line** | the authored spec, what the scenario *asks* the actor to do | the scenario you drew |
| **Ghost** | the authored ego, where the scenario said the vehicle would be | the scene, once a trace or solution is loaded |
| **Moving vehicle** | what the actor *actually drove* | `driven` (or the solution's trajectory) |
| **Planned trajectory** | the planner's output, what the planner *decided* | the latest plan, or the future of a plain replay |

Without a planning trace, the planned trajectory shows the future of the loaded replay (the
rest of the solution from the playhead onward). **With a planning trace loaded for an actor,
that actor's planned trajectory shows the latest plan issued at or before the current time**,
the plan whose `t` is the largest `t <= now`, sliced from the playhead forward. Before the
first plan's `t`, nothing is drawn for that actor: the planner had not produced anything yet.

When `driven` ends before the scenario does, the moving vehicle holds its last driven state and
the planned trajectory holds with it, staying sliced from the last driven time.

The path line is unchanged by a planning trace.

#### Colour = acceleration

When the states carry `v`, the planned trajectory is coloured by the **acceleration** derived
from it (central difference over neighbouring states). It is green, darker when decelerating
and lighter when accelerating:

| Colour | Means |
| --- | --- |
| `#00e89d` (`trajectory-neutral`) | constant speed, \|a\| below 0.05 m/s² |
| `#008956` (`trajectory-decel`), stronger with \|a\| | decelerating |
| `#aff8d1` (`trajectory-accel`), stronger with \|a\| | accelerating |

The scale is **relative to the trajectory**: the strongest |a| over the whole trace (every plan
plus the driven track, decided once at load) is drawn at full colour, and the ramp is **linear**
in |a| from the dead band. A trajectory that is nearly constant speed (max |a| under 0.3 m/s²)
uses 0.3 m/s² as its scale instead. The same colour in two different files therefore does not
mean the same m/s².

Each 0.1 s segment takes the colours of its two states at its two ends, with a linear gradient
between them when they differ. States without `v` are drawn in the constant-speed green.

## Example

```json
{
  "schema": "drawtonomy-planning-trace-v1",
  "scenario": "ZAM_Untitled202609011139-1_1_T-1",
  "producer": { "name": "commonroad-reactive-planner", "version": "2025.1" },
  "frame": "center",
  "tracks": [
    {
      "role": "ego",
      "vehicle": { "type": "BMW_320i", "length": 4.508, "width": 1.61, "refToCenter": 1.4227170936 },
      "driven": [
        { "t": 0.0, "x": 12.34, "y": -1.2, "h": 0.01, "v": 13.9 },
        { "t": 0.1, "x": 13.7, "y": -1.2, "h": 0.01, "v": 13.9 },
        { "t": 0.2, "x": 15.1, "y": -1.2, "h": 0.01, "v": 13.9 },
        { "t": 0.3, "x": 16.5, "y": -1.2, "h": 0.01, "v": 13.9 }
      ],
      "plans": [
        {
          "t": 0.0,
          "states": [
            { "t": 0.0, "x": 12.34, "y": -1.2, "h": 0.01, "v": 13.9 },
            { "t": 0.1, "x": 13.7, "y": -1.2, "h": 0.01, "v": 13.9 }
          ]
        },
        { "t": 0.3, "states": [{ "t": 0.3, "x": 16.5, "y": -1.2 }] }
      ]
    }
  ]
}
```

## Schema

### Top level

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `schema` | string | **yes** | Exactly `"drawtonomy-planning-trace-v1"`. Any other value is refused, naming the supported schema. |
| `frame` | `"center"` \| `"ref"` | **yes** | What the positions mean. See [Units and frames](#units-and-frames). |
| `tracks` | array | **yes** | One entry per actor, at least one. |
| `scenario` | string | no | Scenario identifier this trace was computed for. See [Matching](#matching-a-trace-to-a-scene). |
| `producer` | object | no | Free-form; `{ "name": ..., "version": ... }` by convention. Informational only. |

### `tracks[]`

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `role` | `"ego"` | exactly one of `role` / `name` | Matches the actor marked as ego in the scene. |
| `name` | string | exactly one of `role` / `name` | Matches an actor by entity name. |
| `driven` | array | **yes** | The states this actor actually drove in this run, at least one. |
| `plans` | array | **yes** | The plans this actor's planner issued, at least one. |
| `vehicle` | object | no | The body the planner planned with. See [`tracks[].vehicle`](#tracksvehicle). |

Giving both `role` and `name`, or neither, is an error.

### `tracks[].vehicle`
<a id="tracksvehicle"></a>

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `length` | number | **yes** (when `vehicle` is present) | Body length in metres, finite and > 0. |
| `width` | number | **yes** (when `vehicle` is present) | Body width in metres, finite and > 0. |
| `refToCenter` | number | no | Distance from the reference point (rear axle centre) to the body centre along the heading, metres, finite and >= 0. |
| `type` | string | no | Free label, e.g. the CommonRoad vehicle type name (`"BMW_320i"`). Shown in the replay badge tooltip, not interpreted. |

A CommonRoad planning problem carries no ego shape: the ego's size is chosen on the planner
side (the solution's `vehicle_type`) and that is the body the official checker judges collisions
with, so drawtonomy needs the same body to draw. `vehicle` records it:

- the **moving vehicle** is drawn, collision-checked and given its trajectory width at the
  planner's `length` x `width`, not the authored size;
- the **ghost** keeps the authored size, so the difference between what was authored and
  what was planned stays visible;
- `refToCenter` is used for the centre-to-reference-point conversion of `frame: "center"`
  files. When omitted the authored vehicle's reference offset is used.

Nothing is written back to the scene. For a **solution** file the same information is derived
from the benchmark id's vehicle type digit (`KS2:...` = type 2 = BMW_320i), so a solution and
its trace show the ego at the same size.

Unknown keys inside `vehicle` are ignored like everywhere else. A `vehicle` with a missing or
non-positive `length`/`width` is refused, naming the field.

### `tracks[].driven[]`

Same state schema as [`plans[].states[]`](#plansstates): `t`, `x`, `y`, optional `h` (derived
the same way when omitted) and optional `v`, in the file's `frame`. At least one state,
ascending in `t`, with no two states at the same time.

`driven` is what moves the actor, so it is **required**; omitting it is an error naming the
field. For a closed-loop planner run, `driven` is exactly the solution's trajectory: write it
from the same states the solution is written from.

### `plans[]`

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `t` | number | **yes** | The time, in seconds, at which this plan was *issued*. |
| `states` | array | **yes** | The planned states, at least one, ascending in `t`. |

`states[0].t` must equal the plan's `t` (within 1e-6): a plan has to start at the moment it
was issued. Plans are sorted by `t` on read, so the writer's order does not matter, but two
plans issued at the same `t` are an error.

### `plans[].states[]`
<a id="plansstates"></a>

| Field | Type | Required | Unit |
| --- | --- | --- | --- |
| `t` | number | **yes** | seconds |
| `x` | number | **yes** | metres |
| `y` | number | **yes** | metres |
| `h` | number | no | radians, counter-clockwise, 0 = +x. When omitted, drawtonomy derives it from the direction to the next state (the last state repeats the previous heading). Producers writing `frame: "center"` should include it: the centre-to-reference-point conversion needs the heading, and a derived heading is only an approximation on curves |
| `v` | number | no | metres per second (scalar speed) |

## Units and frames

Positions are **ENU metres with Y pointing up**, the same convention every replay format
drawtonomy reads uses. Times are **seconds** (not integer time steps), so a trace is readable
without knowing the scenario's `timeStepSize`.

`frame` says what point on the vehicle the coordinates describe:

- `"center"`: the **vehicle body centre**. This is what CommonRoad's `position` means, so a
  trace produced alongside a CommonRoad solution is almost always `"center"`.
- `"ref"`: the **reference point**, i.e. the centre of the rear axle. This is what
  OpenSCENARIO entity positions mean, and what drawtonomy uses internally.

Getting this wrong does not produce an obvious error; it produces a trajectory quietly
displaced by roughly a metre (the distance from rear axle to body centre).

## Matching a trace to a scene

A planning trace **is** a replay file, so a track is matched to an actor with the same rules as
any other replay format:

- `"role": "ego"` → the actor marked as ego in the open scene.
- `"name": "..."` → the actor with that entity name. An exact, case-sensitive match wins; a
  case-insensitive match is accepted only when it is unambiguous.

Tracks that match nothing are ignored, and drawtonomy says which names it could not place
rather than guessing.

If `scenario` is present and the open scene has a known scenario identifier, they must agree.
A mismatch is refused with an error naming both identifiers, and nothing is loaded.

## Loading

A trace **on its own is enough**. Dropping one installs it as the loaded replay: the matched
actors move along their `driven` states, the authored actors become ghosts, and the planned
trajectory shows the latest plan. Nothing else has to be loaded.

Loading a solution is optional, and it follows the ordinary rule that **any replay file
replaces the current one**: drawtonomy keeps exactly one replay loaded.

- **Trace, then solution**: the solution becomes the loaded replay. Its trajectory moves the
  actor, and because a solution carries no plans, the planned trajectory goes back to showing
  the replay's future.
- **Solution, then trace**: the trace becomes the loaded replay, bringing both `driven` and
  the plans.

While a trace is loaded, drawtonomy checks that the head of the first plan is where the run
says the actor was at that moment; a disagreement over 0.05 m is reported without blocking the
display (the plans and the driven states are then from different runs, or the `frame` is
wrong).

A trace lives exactly as long as any other replay: it is dropped when the scene is replaced
(import, New canvas, an undo across a document boundary) and when the scenario is edited, each
time saying which file was unloaded and why.

The `solution.verdict.json` sidecar
([format](verdict-sidecar.md)) attaches to a trace replay just as it does to
a solution replay: they are paired by scenario id. The verdict itself is always computed from
the CommonRoad solution by the official checker; the trace does not carry or replace it.

## File naming

Naming the file after the solution it belongs to is a **recommendation**, not a requirement:

```
planner_solution.xml
planner_solution.planning-trace.json
```

The reader identifies the file **by its `schema` field, not by its name**, so any name works;
this convention just keeps the pair together on disk.

Dropping (or selecting in Import...) the scenario and the trace **together** opens the scenario
and installs the trace as its replay in one step, so a run can be handed over as two files. If a
solution is in the same drop, the trace wins and a toast names the file that was not loaded. The
`solution.verdict.json` sidecar can come along in the same drop as well.

## Compatibility policy

The schema string carries the major version, and **v1 is additive only**:

- **Unknown fields at any level are ignored.** New optional fields can be added to v1 without
  breaking any reader, so a producer can start emitting extra information immediately.
- **A breaking change gets a new schema string** (`drawtonomy-planning-trace-v2`), and readers
  keep accepting v1. Existing files never stop working.
- A file whose schema is not recognised is refused with a message naming the supported schema,
  rather than being partially read.

### Reserved: `plans[].candidates`

`candidates` is **reserved** on a plan for the set of sampled trajectories a planner evaluated
in that cycle. It is not part of v1: writing it is harmless (it is ignored, like any unknown
field), but drawtonomy does not render it, and its shape is not yet fixed. Do not rely on it.

## Producing one

Write one with `TraceWriter` from the `drawtonomy-commonroad` package:

```bash
pip install drawtonomy-commonroad
```

```python
from drawtonomy_cr.trace import TraceWriter

w = TraceWriter(dt=0.1, vehicle=dict(length=4.508, width=1.61, refToCenter=1.4227,
                                     type="BMW_320i"))
for cycle in my_planner_loop():
    w.plan(t=cycle.t, states=cycle.trajectory)   # one entry per replanning cycle
w.driven(executed_states)                        # what the ego actually drove
w.write("solution.planning-trace.json", solution="solution.xml")
```

States can be commonroad-io `State` objects or plain
`{"x":, "y":, "orientation":, "v":, "time_step":}` dicts. `write()` runs two PASS/FAIL checks
and raises instead of writing when either fails, each printing the worst deviation:

1. **`driven` equals the solution's trajectory** (same length, same time steps, positions
   within 1e-6 m).
2. **Each plan's executed head equals `driven`** at the same time steps, so the planned
   trajectory and the moving vehicle agree at the moment a plan was issued.

### The smallest example: an IDM planner

`examples/idm_planner/` is a single file that depends on commonroad-io and numpy only: the ego
follows the centreline of its starting lanelet and IDM car-following sets its speed. It writes
the solution and the trace with the same body, and its README explains the two modes it ships
with. Copy it as the starting point for a planner of your own.

```bash
python3 idm_planner.py scenario.xml out/
```

### The worked example: commonroad-reactive-planner

`examples/reactive_planner/run_planner.py` writes a trace next to the solution it generates.
Replace the planner half with yours. The script feeds the planner's per-cycle optimal trajectory
(`optimal_traj_list`) as one `plan` per cycle and its recorded states as `driven`, running
**both** through the same call the solution uses
(`planner.convert_state_list_to_commonroad_object`) so all three agree to the last digit. The
track's `vehicle` is taken from the planner's own `config.vehicle` (length, width,
`wb_rear_axle` as `refToCenter`, the CommonRoad vehicle type name as `type`).

The script does not set a desired velocity of its own: the planner's default rule reads the
planning problem's goal `<velocity>` interval (the midpoint when the interval starts above 0,
otherwise half of its end), and falls back to the initial velocity when the goal has none.
drawtonomy writes that interval from the ego's **Goal speed limit** (`[0, max]`), so a limit
of 60 km/h makes the planner aim for 30 km/h; leave it unset to keep the initial speed.

Run it on Linux x86_64 with the planner installed next to this package:

```bash
pip install "drawtonomy-commonroad[checker]" commonroad-reactive-planner \
    commonroad-route-planner imageio matplotlib
python3 examples/reactive_planner/run_planner.py scenario.xml out/
```

Where the planner's wheels cannot be installed, `examples/reactive_planner/Dockerfile`
builds an image with everything in it. Build it from that directory and run the script
against a scenario in the current directory:

```bash
docker build --platform linux/amd64 -t cr-planner .
docker run --rm --platform linux/amd64 -v "$PWD:/work" cr-planner \
  python3 /opt/reactive_planner/run_planner.py /work/scenario.xml /work/out
```

## See also

- [`verdict-sidecar.md`](verdict-sidecar.md): the `solution.verdict.json` format that
  carries the official checker's verdict for a solution.
- [`open-server-protocol.md`](open-server-protocol.md): what `drawtonomy-cr open` serves
  and how it announces changes.
