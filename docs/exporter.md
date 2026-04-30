# drawtonomy Exporter

<p align="center">
  <img src="https://github.com/user-attachments/assets/4185a3c7-7662-4d01-a3b2-73e17897c27a" width="80%" />
</p>

[日本語版はこちら](exporter.ja.md)

The `exporter` sub-module of `@drawtonomy/sdk` converts a `DrawtonomySnapshot`
into ASAM-format files (OpenDRIVE 1.8 / OpenSCENARIO 1.3) and esmini-ready
zip bundles. It has no runtime dependency on the editor, so it can be used
in headless tooling, server-side pipelines, browser extensions, or CI checks.

This is the main extension point for adding support for new shapes,
animation features, or entirely new target formats (CARLA, Unity, SUMO, …).

## Table of Contents

- [Quick Start (User)](#quick-start-user)
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

```bash
cd extensions/exporter-playground
pnpm install
pnpm dev   # http://localhost:3003
# Then open drawtonomy with ?ext=http://localhost:3003/manifest.json
```

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
