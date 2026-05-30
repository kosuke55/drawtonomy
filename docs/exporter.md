# drawtonomy Exporter

<video src="https://github.com/user-attachments/assets/1a32b360-5ffc-4967-9c28-e424c1f47aaf" width="80%" controls></video>

_Draw an intersection and a path, generate footprints, export the esmini zip,
then replay the exported `.xosc` in esmini — the vehicle follows the trajectory
built from the path._

[日本語版はこちら](exporter.ja.md)

The `exporter` sub-module of `@drawtonomy/sdk` converts a `DrawtonomySnapshot`
into ASAM-format files (OpenDRIVE 1.8 / OpenSCENARIO 1.3), esmini-ready zip
bundles, and Lanelet2 (.osm XML) maps. It has no runtime dependency on the
editor, so it can be used in headless tooling, server-side pipelines, browser
extensions, or CI checks. The Lanelet2 module additionally exposes a parser
that turns OSM XML back into editor-ready primitives, enabling import /
round-trip workflows.

This is the main extension point for adding support for new shapes,
animation features, or entirely new target formats (CARLA, Unity, SUMO, …).

> 📖 Looking for the user-facing guide (exporting from the editor and playing
> back in esmini)? See
> **[Export to OpenDRIVE / OpenSCENARIO / esmini](https://docs.drawtonomy.com/guides/export-asam/)**
> on the docs site.

## Table of Contents

- [Quick Start (User)](#quick-start-user)
- [What gets converted (and what doesn't)](#what-gets-converted-and-what-doesnt)
- [Quick Start (Developer)](#quick-start-developer)
- [Local Development](#local-development)
- [Architecture](#architecture)
- [API Reference](#api-reference)
- [Extending the Exporter](#extending-the-exporter)
- [Roadmap](#roadmap)

---

## Quick Start (User)

1. Open drawtonomy and draw a scene (lanes, vehicles, traffic lights, …).
2. Click the menu → **Export** → **Export for esmini**.
3. Enter a file base name when prompted.
4. A `<name>.zip` file is downloaded containing `<name>.xodr` and `<name>.xosc`.
5. Unzip and run with esmini:

   ```bash
   unzip <name>.zip
   esmini --osc <name>/<name>.xosc --window 60 60 1024 768
   ```

The vehicle drives along the path you drew — that line *is* the
`<FollowTrajectoryAction>` generated from it.

---

## What gets converted (and what doesn't)

The conversion is intentionally **basic**: it covers the few shapes that map
cleanly onto the ASAM data model and leaves everything else out. Knowing the
exact scope keeps the output honest — here is precisely what is emitted.

### Into OpenDRIVE (`.xodr`)

| drawtonomy shape | OpenDRIVE element | Notes |
| --- | --- | --- |
| **Lane** | one `<road>` | 1 lane = 1 independent road |
| **TrafficLight** | `<signal>` on the nearest road | vehicle / pedestrian type only |
| **Crosswalk** | `<object type="crosswalk">` | placed perpendicular to the road |
| **Polygon** (≥3 points) | `<object type="patch">` + `<outline>` | fills intersection / area visuals |

Everything else — vehicles, pedestrians, standalone points, free linestrings,
text, images — is **not** written to the `.xodr`.

How far each road goes:

- **Straight-line geometry only.** The reference line is sampled from the
  lane's left/right boundaries and emitted as `<line>` segments. No `arc`,
  `spiral`, or `poly3`.
- **Fixed lane layout.** Every road gets one left lane (`id=1`), one center
  lane (`id=0`), and one right lane (`id=-1`), all `type="driving"`.
  Multi-lane roads and multiple lane sections are not represented.
- **Road marks** are hard-coded to a `solid white 0.13 m` line.
- **No junctions.** Every road carries `junction="-1"` and **no `<junction>`
  element is generated.** Intersections are conveyed only by the polygon patch
  and by predecessor/successor links derived from the lane's `next` / `prev`
  connections (first entry only).
- **No elevation / superelevation** — `elevationProfile` and `lateralProfile`
  are emitted empty (flat, planar roads).
- Scale is fixed at **16.67 px/m**; the geographic origin is `0`.

### Into OpenSCENARIO (`.xosc`)

| drawtonomy shape | OpenSCENARIO element |
| --- | --- |
| **Vehicle** | a `<ScenarioObject>` (`<Vehicle>` or `<Pedestrian>`) |
| **Path footprint** (head vehicle) | a `<FollowTrajectoryAction>` |

A "pedestrian" is just a vehicle shape whose `templateId` matches a
pedestrian/walk pattern — it is emitted as `<Pedestrian>` instead of
`<Vehicle>`. Lanes, crosswalks, traffic lights, and free linestrings are
**not** emitted into the `.xosc`.

The scenario is deliberately minimal:

- The only dynamic behavior is **`FollowTrajectoryAction`** — a time-stamped
  polyline. There are no speed actions, lane changes, traffic-light responses,
  collision avoidance, or interaction conditions.
- Each moving entity starts at `SimulationTime ≥ 0` and the scenario has a hard
  **`StopTrigger` at 60 s**.

### How a path footprint becomes vehicle motion

A **path** is a linestring you draw; **footprints** are ghost copies of a
vehicle laid out along it (the trail visible in the editor). On export:

1. Only the **leading footprint** becomes a moving `<ScenarioObject>`. The
   trailing ghosts are a canvas-side preview and are dropped — you get **one**
   vehicle that drives the whole path, not a queue.
2. The path's control points become the trajectory vertices, in world (ENU)
   meters.
3. Each vertex gets a `time`, written as a `<Trajectory>` → `<Polyline>` of
   `<Vertex time="…">` inside a `<FollowTrajectoryAction>`.

**Speed is fixed.** The trajectory is timed at a hard-coded **10 m/s
(≈ 36 km/h)** — `DEFAULT_PATH_SPEED_MPS`. There is no speed field in the UI,
and the editor never passes `speedMps` to `buildPathTrajectory`, so esmini
reports ~36 km/h regardless of what you drew. You shape *timing*, not speed,
through the footprint layout:

- **Uniform** (path's *Variable positioning* toggle OFF) — footprints sit at
  equal arc-length intervals and time is `distance / 10 m/s`: constant speed.
  Changing the interval only changes how many vertices are written; the path
  shape and total duration are unchanged.
- **Variable** (toggle ON) — each footprint is pinned to a position along the
  path and the total duration is split into equal time slices between
  footprints. Packing footprints close together makes that leg slow; spreading
  them out makes it fast. This is the only way to vary the effective speed
  along the route.

So: dragging a footprint partway along the path in **Variable** mode re-times
that segment and **changes the exported speed plan**. Dragging in Uniform
mode, or changing the footprint *Anchor* offset, does not.

### Values that are hard-coded

For honesty about scope, these come from fixed maps or constants, not from
anything editable: vehicle category / performance presets, bundled 3D model
paths, vehicle height by category, axle geometry (derived from size), following
mode (`position`), the 60 s stop trigger, and — most importantly — the 10 m/s
trajectory speed.

> Want any of these to become editable, or a new dynamic action emitted? That
> is exactly what the [Extending the Exporter](#extending-the-exporter) and
> [Roadmap](#roadmap) sections are for.

---

## Quick Start (Developer)

```bash
pnpm add @drawtonomy/sdk
```

```typescript
import { exporter, createSnapshot } from '@drawtonomy/sdk'

// shapes is an array of BaseShape objects (see "Snapshot shape" below).
const snapshot = createSnapshot(shapes)

// Per-format strings.
const xodr = exporter.exportToOpenDrive(snapshot)
const xosc = exporter.exportToOpenScenario(snapshot, {
  xodrFilename: 'scene.xodr',
})

// Convenience: bundle both into a single .zip ready for esmini.
const { blob, baseName } = exporter.buildEsminiZip(snapshot, {
  baseName: 'my-scene',
})

// Lanelet2 (.osm XML) export and round-trip.
const osm = exporter.exportToLanelet2(snapshot, {
  mapOrigin: { lat: 35.0, lon: 139.0 },
})
const data = exporter.parseOsmXml(osm)
const imported = exporter.osmToShapes(data)
```

The exporter is pure: same input → same output, no editor or DOM access.

---

## Local Development

This section is for contributors who want to **modify the exporter itself**.

There are two complementary ways to develop:

1. **Snapshot-driven** — write a snapshot fixture, run vitest, inspect the
   generated XML. Fast iteration, no browser, ideal for new logic.
2. **esmini visual check** — feed the generated `.xodr` / `.xosc` to esmini
   and confirm the 3D playback matches expectations. Slower but catches
   issues that pure XML assertions cannot.

Most PRs start with (1), then run a fixture through (2) before opening the PR.

### Setup

```bash
git clone https://github.com/kosuke55/drawtonomy.git
cd drawtonomy
pnpm install   # installs all workspace packages
```

The exporter source lives in `packages/drawtonomy-sdk/src/exporter/`.
Tests live in `packages/drawtonomy-sdk/__tests__/exporter/`.

### Snapshot-driven development (fast loop)

The exporter is a set of pure functions over `DrawtonomySnapshot`, so you can
exercise it entirely from vitest. No editor, no browser, no esmini — just
"build a snapshot, call the exporter, assert on the XML string."

```bash
cd packages/drawtonomy-sdk

pnpm test                       # one-shot
pnpm exec vitest                # watch mode (re-runs on save)
pnpm exec vitest exporter       # only the exporter test files
pnpm build                      # tsc — catches type errors before you commit
```

#### How to obtain a snapshot

You have three options, in order of increasing realism:

**(1) Hand-build a minimal fixture in code.** Best for unit tests that target
a specific code path. The existing exporter tests under
`__tests__/exporter/` ship small `point` / `linestring` / `lane` factory
helpers you can copy.

```typescript
// __tests__/exporter/my-feature.test.ts
import { describe, it, expect } from 'vitest'
import { exportToOpenDrive } from '../../src/exporter/opendrive'
import type { DrawtonomySnapshot } from '../../src/types'

function snapshot(shapes: any[]): DrawtonomySnapshot {
  return { version: '1.1', timestamp: new Date().toISOString(), shapes }
}

describe('my new feature', () => {
  it('emits something specific', () => {
    const xml = exportToOpenDrive(snapshot([
      // smallest scene that triggers your code path
    ]))
    expect(xml).toContain('<expected-element>')
  })
})
```

**(2) Compose with SDK helpers.** When you want a realistic shape but don't
want to write every property by hand, use `createPoint` / `createLinestring`
/ `createLane` / `createLaneWithBoundaries` / `createVehicle` /
`createPathWithFootprints` / `createSnapshot`.

```typescript
import {
  createLaneWithBoundaries,
  createVehicle,
  createSnapshot,
} from '@drawtonomy/sdk'

const shapes = [
  ...createLaneWithBoundaries(
    [{ x: 0, y: -5 }, { x: 100, y: -5 }],
    [{ x: 0, y: 5 }, { x: 100, y: 5 }]
  ),
  createVehicle(50, 0, { templateId: 'sedan' }),
]
const snapshot = createSnapshot(shapes)
```

**(3) Reuse a real scene exported from drawtonomy.** Open
[drawtonomy.com](https://drawtonomy.com), draw the scene, then **Menu →
Export → drawtonomy.svg**. The downloaded file is a regular SVG with the
full snapshot embedded; pass it through `parseDrawtonomySvg` to get back a
`DrawtonomySnapshot`.

```typescript
import { readFileSync } from 'node:fs'
import { parseDrawtonomySvg } from '@drawtonomy/sdk'

const svg = readFileSync('./fixtures/my-scene.drawtonomy.svg', 'utf-8')
const snapshot = parseDrawtonomySvg(svg)
if (!snapshot) throw new Error('not a drawtonomy.svg file')
```

Saved `.drawtonomy.svg` fixtures make good regression-test inputs for
"this real scene should produce this XML".

#### Iteration tips

- Inspect the full output with `console.log(xml)` while you iterate, then
  narrow the assertion to the lines you care about once the shape stabilizes.
- For larger XML diffs, switch to `expect(xml).toMatchInlineSnapshot()`.
- Keep fixtures small — three points and one lane is usually enough.

### Validating the output with esmini

vitest assertions catch behavioral regressions, but they cannot tell you
whether esmini will actually render the output the way you expect. Once
your snapshot tests pass, run the generated XML through esmini directly.

You do not need to start drawtonomy or any browser for this — write a tiny
script that produces a `.xodr` / `.xosc` pair from a snapshot fixture, then
hand it to esmini.

#### 1. Install esmini

```bash
# macOS
brew install esmini

# Linux / Windows: see https://github.com/esmini/esmini
```

#### 2. Generate a bundle from a snapshot

The simplest way is to start from a `.drawtonomy.svg` you exported from
drawtonomy.com (see [How to obtain a snapshot](#how-to-obtain-a-snapshot)
above). The same script works with hand-built or helper-composed snapshots.

```typescript
// scripts/preview.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { parseDrawtonomySvg, exporter } from '@drawtonomy/sdk'

// Option A: real scene from drawtonomy.com
const svg = readFileSync('./fixtures/my-scene.drawtonomy.svg', 'utf-8')
const snapshot = parseDrawtonomySvg(svg)
if (!snapshot) throw new Error('not a drawtonomy.svg file')

// Option B: snapshot composed in code (uncomment to use)
// import { createLaneWithBoundaries, createVehicle, createSnapshot } from '@drawtonomy/sdk'
// const snapshot = createSnapshot([
//   ...createLaneWithBoundaries([{x:0,y:-5},{x:100,y:-5}], [{x:0,y:5},{x:100,y:5}]),
//   createVehicle(50, 0, { templateId: 'sedan' }),
// ])

mkdirSync('out', { recursive: true })
writeFileSync('out/scene.xodr', exporter.exportToOpenDrive(snapshot))
writeFileSync('out/scene.xosc', exporter.exportToOpenScenario(snapshot, {
  xodrFilename: 'scene.xodr',
}))
console.log('wrote out/scene.{xodr,xosc}')
```

Run it once you have a fresh `pnpm build` from the SDK:

```bash
cd packages/drawtonomy-sdk && pnpm build
node scripts/preview.mjs
```

#### 3. Open the result in esmini

```bash
esmini --osc out/scene.xosc --window 60 60 1024 768
```

What to check:

- Lane geometry matches your fixture's intent.
- Vehicles spawn at the expected positions and headings.
- For trajectories, vehicles follow the path with the expected timing.
- Open the XML files in a text editor; the comments emitted by the exporter
  often help locate the relevant section.

If esmini reports a parsing error, copy the line/column it prints and grep
the corresponding part of the generated XML — most issues are off-by-one
attributes or missing required fields, both easy to fix back in vitest.

#### Going further: full canvas verification

To verify the full chain (canvas → snapshot → exporter → esmini), use
the published drawtonomy app at `https://drawtonomy.com` — draw your scene,
hit **Export for esmini**, and feed the zip to esmini as above. The version
of `@drawtonomy/sdk` available there matches the latest published release,
so this flow is best used after your PR has been merged and the SDK has been
re-published.

If you want canvas-driven verification *with your local SDK build* (before
publishing), use the bundled
[`extensions/exporter-playground`](../extensions/exporter-playground/)
extension. It loads as an iframe extension, calls `requestSnapshot()` over
postMessage, and runs your local SDK's `exporter.exportTo*` against the
real canvas — no need to wait for a release cycle.

The setup needs two local servers running side-by-side: one hosting the
drawtonomy canvas, one hosting the extension. Browsers block plain HTTP
requests from HTTPS pages (and increasingly from `*.com` to `localhost` in
general), so we use [`@drawtonomy/dev-server`][dev-server] to serve the
canvas locally over HTTP — both sides become `http://localhost:*` and the
browser allows the request.

[dev-server]: https://www.npmjs.com/package/@drawtonomy/dev-server

**Terminal 1 — start the local canvas:**

```bash
pnpm dlx @drawtonomy/dev-server
# → http://localhost:3000/
```

`@drawtonomy/dev-server` downloads the published `drawtonomy.com` build
into a cache directory and serves it; you do not need any other repository
or login.

**Terminal 2 — start the extension:**

```bash
cd extensions/exporter-playground
pnpm install --ignore-workspace   # first time only
pnpm dev                          # → http://localhost:3003/
```

The extension's `manifest.json` is then reachable at
`http://localhost:3003/manifest.json`.

**Open the canvas with the extension loaded:**

Open this URL in a browser:

```
http://localhost:3000/?ext=http://localhost:3003/manifest.json
```

The Exporter Playground panel appears on the side. Draw a scene, press
**Refresh snapshot** if needed, and click any of the **Export** buttons —
the resulting `.xodr` / `.xosc` / `.zip` is generated by your local SDK
build and downloaded by the browser.

After every change to the SDK source, rebuild it and reload the canvas
page so the extension picks up the new bundle:

```bash
cd packages/drawtonomy-sdk && pnpm build
# Then hit reload in the browser tab.
```

> **Why not `https://drawtonomy.com/?ext=http://localhost:3003/...`?**
> Browsers block this combination (HTTPS page loading an HTTP iframe
> manifest from `localhost`) under Mixed Content / Private Network Access
> rules. The `dev-server` route avoids it by keeping both sides on plain
> HTTP. If you have already deployed the extension to an HTTPS host, the
> hosted-canvas form `https://drawtonomy.com/?ext=https://your-host/manifest.json`
> works, but it does not pick up your local SDK changes — it uses the
> SDK version embedded in the published canvas build.

### Writing tests

Every behavioral change should land with a test. Conventions:

- One spec file per source file: `opendrive.ts` ↔ `opendrive.test.ts`.
- Tests are pure JS objects, not snapshots from the live editor — they stay
  stable even if unrelated UI code moves around.
- Prefer narrow assertions (`expect(xml).toContain(...)`) over full-XML
  comparisons; the latter break on every cosmetic emit change.
- For numerical outputs, use `toBeCloseTo` to tolerate floating-point noise.

The CI job for `@drawtonomy/sdk` runs `pnpm build` and `pnpm test`; both
must pass on PR.

---

## Architecture

### Snapshot shape

```typescript
interface DrawtonomySnapshot {
  version: string
  timestamp: string
  shapes: BaseShape[]   // points, linestrings, lanes, vehicles, …
  camera?: { x: number; y: number; z: number }
}
```

The exporter only reads from `shapes`. Each shape is a self-describing object
with `id`, `type`, `x`, `y`, `rotation`, `props`. Lane geometry is referenced
by id (a lane points to two boundary linestrings, which point to points), so
the exporter resolves these via an internal id map.

### Module layout

```
@drawtonomy/sdk/exporter/
├── opendrive.ts        Lane / TrafficLight / Crosswalk / Polygon → .xodr
├── openscenario.ts     Vehicle / Pedestrian / Path → .xosc
├── trajectory.ts       Path → time-stamped vertex sequence
├── laneCenterline.ts   Two boundary polylines → centerline + width samples
├── packageEsmini.ts    .xodr + .xosc → single .zip
├── lanelet2.ts         Snapshot → Lanelet2 .osm XML (with sidecar round-trip)
├── osmParser.ts        Lanelet2 .osm XML → structured data + lat/lon ↔ canvas projection
├── osmToShapes.ts      OSM data → editor-ready point / linestring / lane records
├── zip.ts              Pure ZIP builder (store mode, no deps)
├── sanitize.ts         OS-safe file base name normalization
└── units.ts            Canvas px ↔ ENU meters, XML formatting helpers
```

### Coordinate conventions

| Axis | drawtonomy canvas | OpenDRIVE / OpenSCENARIO (ENU) |
|------|-------------------|-------------------------------|
| x | right + | east + |
| y | **down +** | **up +** (sign flipped) |
| heading | CW positive (degrees) | CCW positive (radians) |
| length unit | pixels | meters (`PIXELS_PER_METER = 16.67`) |

Vehicle templates face canvas −Y by convention, so `rotation = 0` maps to
ENU heading `π/2` (north). This offset is applied inside `exportToOpenScenario`.

---

## API Reference

### `exportToOpenDrive(snapshot)`

```typescript
function exportToOpenDrive(snapshot: DrawtonomySnapshot): string
```

Returns an OpenDRIVE 1.8 XML string. Each `LaneShape` becomes a `<road>`;
each `TrafficLightShape` becomes a `<signal>`; each `CrosswalkShape` and
`PolygonShape` becomes an `<object>`. Lane connectivity (`next` / `prev`) is
written as road-level and lane-level `<link>` elements. Junctions are not
yet emitted (see [Roadmap](#roadmap)).

### `exportToOpenScenario(snapshot, options?)`

```typescript
interface OpenScenarioExportOptions {
  xodrFilename?: string          // referenced by <LogicFile>
  scenarioName?: string
  templateResolver?: TemplateResolver
}

function exportToOpenScenario(
  snapshot: DrawtonomySnapshot,
  options?: OpenScenarioExportOptions
): string
```

Each `VehicleShape` becomes a `<ScenarioObject>` with category resolved from
its `templateId`. Pedestrian templates emit `<Pedestrian>` instead of
`<Vehicle>`. Path linestrings with footprints become a
`<FollowTrajectoryAction>` story for the leading footprint vehicle.

### `buildEsminiZip(snapshot, options?)`

```typescript
interface EsminiPackageOptions {
  baseName?: string
  templateResolver?: TemplateResolver
}

interface EsminiPackageResult {
  blob: Blob
  baseName: string
}

function buildEsminiZip(
  snapshot: DrawtonomySnapshot,
  options?: EsminiPackageOptions
): EsminiPackageResult
```

Convenience that calls both exporters and packages the results as
`<baseName>.zip` containing `<baseName>/<baseName>.xodr` and
`<baseName>/<baseName>.xosc`. Filenames are kept consistent so the
`<LogicFile>` reference inside the xosc resolves without renames.

### `buildPathTrajectory(input)`

```typescript
interface PathTrajectoryInput {
  points: { x: number; y: number }[]
  tValues?: number[]                  // pre-computed normalized positions
  interval?: number                   // px between samples
  offset?: number                     // px from start
  speedMps?: number                   // default 10
}

interface PathSamplePoint {
  x: number       // ENU m
  y: number       // ENU m
  heading: number // ENU rad
  time: number    // s
}

function buildPathTrajectory(input: PathTrajectoryInput): PathSamplePoint[]
```

Converts a polyline path into a time-stamped vertex sequence suitable for
`<FollowTrajectoryAction>`. Three modes: `tValues` (pre-computed), `interval`
(equal arc-length), or fallback (control points at constant speed).

### `computeCenterlineWithWidth(left, right, numSamples?)`

Samples both boundary polylines at the same normalized arc-length parameter
and returns the per-sample midpoint + width. Used by the OpenDRIVE exporter
to emit reference lines and `<width>` entries.

### `buildZip(entries)`

```typescript
interface ZipEntry { path: string; data: string | Uint8Array }
function buildZip(entries: ZipEntry[]): Blob
```

Pure PKZIP-compatible ZIP builder, store mode (no compression). No
dependencies; works in browsers and Node.

### `sanitizeFileBaseName(input)`

Returns an OS-safe base name (path separators / control chars replaced with
underscores, length-capped at 100 chars), or `null` for inputs that reduce
to empty.

### `exportToLanelet2(snapshot, options?)`

```typescript
interface OsmSidecar {
  rawXml: string         // original .osm XML captured at import time
  originLat: number
  originLon: number
}

interface MapOrigin {
  lat: number | null
  lon: number | null
}

interface Lanelet2ExportOptions {
  sidecar?: OsmSidecar | null
  mapOrigin?: MapOrigin | null
}

function exportToLanelet2(
  snapshot: DrawtonomySnapshot,
  options?: Lanelet2ExportOptions
): string
```

Returns a Lanelet2 `.osm` XML document. Each `PointShape` becomes a `<node>`,
each `LinestringShape` becomes a `<way>`, and each `LaneShape` becomes a
`<relation type="lanelet">` with `<member role="left">` / `<member role="right">`
referencing the boundary ways.

When a `sidecar` (the original `.osm` XML captured at import time) is supplied,
unrelated entries (regulatory_element, ele tags, untouched relations) are
round-tripped verbatim; shape-derived entries override the sidecar copies for
the same OSM IDs. The root `<osm>` element carries `drawtonomy_origin_lat` /
`drawtonomy_origin_lon` so re-importing the file restores the same canvas
origin (standard OSM consumers ignore unknown attributes).

Origin precedence: `sidecar` > `mapOrigin` > built-in default.

### `parseOsmXml(xml)`

```typescript
interface OsmData {
  nodes: Map<string, OsmNode>
  ways: Map<string, OsmWay>
  relations: OsmRelation[]
  drawtonomyOrigin?: { lat: number; lon: number }
}

function parseOsmXml(xmlString: string): OsmData
```

Parses Lanelet2 `.osm` XML into structured data. Uses the global `DOMParser`
when available (browser, jsdom) and falls back to a hand-rolled regex parser
sufficient for the OSM subset, so it works in plain Node without `jsdom`.
Non-lanelet relations (regulatory_element, multipolygon, …) are kept as-is so
they survive a round-trip.

### `osmToShapes(data, options?)`

```typescript
interface OsmToShapesOptions {
  idAllocator?: ShapeIdAllocator
  selectedLaneIds?: readonly string[]
}

function osmToShapes(data: OsmData, options?: OsmToShapesOptions): ImportedShapes
```

Converts parsed OSM data into editor-ready records: shared points, boundary
linestrings, lanes, plus a bounding box and the geographic origin used for the
projection. Lane direction is preserved when possible; boundaries are flipped
only when needed to keep the right-of-left invariant. Lane connectivity
(`next` / `prev`) is detected by matching boundary endpoints.

Pass `selectedLaneIds` to import only a subset of lanelet relations. Pass a
custom `idAllocator` (built via `createShapeIdAllocator`) to coordinate IDs
with the host editor's counters.

### `latLonToCanvas(lat, lon, centerLat, centerLon, scale?)` / `canvasToLatLon(...)`

Equirectangular projection helpers used by both the exporter and importer.
The default `scale = 1_855_000` corresponds to 16.67 px/m, matching
drawtonomy's visual sizing convention (3 m lane = 50 px).

### `parseDrawtonomySvg(svg)` *(SDK root, not under `exporter`)*

```typescript
function parseDrawtonomySvg(svgContent: string): DrawtonomySnapshot | null
```

Reads a `.drawtonomy.svg` source string and returns the embedded
`DrawtonomySnapshot`. Returns `null` for plain SVGs without an embedded
snapshot, malformed payloads, or non-string inputs. Accepts both
`data-drawtonomy-snapshot` (current) and `data-drawauto-snapshot` (legacy)
attributes. Works in plain Node (no `DOMParser` / `jsdom` required).

```typescript
import { parseDrawtonomySvg } from '@drawtonomy/sdk'

const snapshot = parseDrawtonomySvg(readFileSync('scene.drawtonomy.svg', 'utf-8'))
```

---

## Extending the Exporter

The exporter is the recommended extension point because all of its logic
operates on the public snapshot shape. Adding a new shape type, a new
animation feature, or an entirely new target format usually requires
changes only inside `packages/drawtonomy-sdk/src/exporter/`.

### Add support for a new shape

Example: emit `TrafficSignShape` as an OpenDRIVE `<signal>`.

1. Make sure the shape's props are part of the public SDK type definitions
   (`packages/drawtonomy-sdk/src/types.ts`). Extend if needed.
2. In `opendrive.ts`, collect the new shape type in the main scan loop:

   ```typescript
   for (const s of shapes) {
     // …existing branches…
     else if (s.type === 'traffic_sign') trafficSigns.push(s as TrafficSignShape)
   }
   ```
3. Project each shape onto the nearest road via `projectToRoad` (reuse the
   existing helper) and emit a `<signal>` entry.
4. Add a unit test in `packages/drawtonomy-sdk/__tests__/exporter/`.

The same recipe applies to OpenSCENARIO: add a branch in `collectEntities` /
`emitVehicleEntity` of `openscenario.ts`.

### Add a new target format

Example: a `carla.ts` adapter that emits CARLA-flavored OpenDRIVE.

1. Add a new file `packages/drawtonomy-sdk/src/exporter/carla.ts`.
2. Take a `DrawtonomySnapshot` as input. Reuse `laneCenterline.ts`,
   `units.ts`, etc. as needed.
3. Export from `packages/drawtonomy-sdk/src/exporter/index.ts`.
4. Add tests covering the format-specific variations.

The existing exporters intentionally do not share an interface — each format
has its own quirks, so duplication is preferred over premature abstraction.
A unifying interface will be considered once 3+ adapters exist.

### TemplateResolver hook

`exportToOpenScenario` accepts a `templateResolver` option for cases where
the host knows about templates not bundled with the SDK:

```typescript
const resolver = {
  resolveTemplateId: (id) => myLegacyMap[id] ?? id,
  isPedestrianTemplate: (id) => /pedestrian|walk/.test(id),
}
exporter.exportToOpenScenario(snapshot, { templateResolver: resolver })
```

Default behavior covers the templates bundled with drawtonomy.

### Coordinate / heading utilities

Use the helpers in `units.ts` instead of recomputing conversions:

```typescript
import { pxToMeter, pxToEnuX, pxToEnuY, fmt, escapeXml } from './units'
```

This keeps the px-to-meter constant and the y-axis flip consistent across
all exporters.

---

## Roadmap

The following are anticipated as future contributions. None of them require
changes outside of `packages/drawtonomy-sdk/src/exporter/`.

### Shape coverage

- `TrafficSign` → OpenDRIVE `<signal>` (stop / yield / speed limit)
- `Others` (e.g. buildings) → OpenDRIVE `<object type="building">`
- Bicycle template → `<Vehicle vehicleCategory="bicycle">`

### Lane connectivity

- Junction emission (`<junction>`) for lanes that share endpoints with 3+
  other lanes. The required `next` / `prev` data is already present on
  `LaneShape`.

### Animation features

- Acceleration profiles → `<SpeedActionDynamics>`
- Dwell / stop events → `<StandStillCondition>`
- Signal-aware paths → `<TrafficSignalCondition>`
- Lane changes → `<LaneChangeAction>`
- Multi-actor coordination → richer `<Storyboard>` structures

### Additional formats

- `carla.ts` — CARLA OpenDRIVE extensions, CARLA YAML scenarios
- `unity-prefab.ts` — Unity prefab export
- `sumo.ts` — SUMO road network + trip definitions

### esmini operational notes

The exporter has accumulated some implementation notes for esmini v3.0.x
(crosswalk heading conventions, `scaleMode=ModelToBB`, polygon color
limitations, …). These are currently inline comments in the exporter
sources; consolidating them into a dedicated section of this document is
welcome.

---

If you are planning a non-trivial contribution, opening an issue first is
encouraged so the design can be discussed before implementation.
