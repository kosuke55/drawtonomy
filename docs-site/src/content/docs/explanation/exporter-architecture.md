---
title: Exporter architecture
description: How a canvas becomes a snapshot, and a snapshot becomes a file.
---

The exporter is the bridge between drawtonomy's in-editor data and any
external format — OpenDRIVE, OpenSCENARIO, Lanelet2, or whatever you
plug in next. Understanding the pipeline is the prerequisite for
adding a new target format.

## The pipeline

```
Editor state ──► DrawtonomySnapshot ──► Exporter ──► File / blob
                  (serializable)        (pure)
```

### 1. `DrawtonomySnapshot`

A snapshot is a plain object: a list of shapes plus a version stamp and
a timestamp. It is serialisable, has no DOM references, and is the only
input the exporter takes.

```ts
interface DrawtonomySnapshot {
  version: string
  timestamp: string
  shapes: BaseShape[]
}
```

You build a snapshot with `createSnapshot(shapes)`, or by parsing a
saved `drawtonomy.svg` with `parseDrawtonomySvg(svg)`.

### 2. The exporter modules

Each target format is a separate pure function:

- `exporter.exportToOpenDrive(snapshot, options) → string` (XML)
- `exporter.exportToOpenScenario(snapshot, options) → string` (XML)
- `exporter.exportToLanelet2(snapshot, options) → string` (OSM XML)
- `exporter.buildEsminiZip(snapshot, options) → { blob, baseName }`

They take a snapshot, return a string or a blob. No editor access, no
DOM, no async dependencies. Same input → same output.

### 3. Round-trip

For Lanelet2, the SDK also ships a parser:

- `exporter.parseOsmXml(osm) → ParsedOsm`
- `exporter.osmToShapes(parsed) → BaseShape[]`

This is what powers the
[Lanelet2 import](/guides/import-lanelet2/) flow.

## Why pure functions

The exporter is the same code path whether it runs in the browser, in a
Node CI script, in a server-side pipeline, or in a browser extension.
Tests can run against snapshot fixtures with no headless browser.

This is why the exporter lives in `@drawtonomy/sdk` and not inside the
editor — the editor depends on the SDK, not the other way around.

## Adding a target format

The exporter is the main extension point for new targets — CARLA,
Unity, SUMO, custom DSLs. The recipe:

1. Add a new module under `packages/drawtonomy-sdk/src/exporter/`.
2. Take `DrawtonomySnapshot` in, return a string or blob.
3. Add tests under `packages/drawtonomy-sdk/__tests__/exporter/` using
   snapshot fixtures.
4. Wire a UI entry point if you want the editor's Export menu to know
   about it (optional — many users will call it programmatically).

The full developer guide is in the public repo:
[Exporter Developer Guide](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.md).

## See also

- [Export to OpenDRIVE / OpenSCENARIO / esmini](/guides/export-asam/) —
  the user-facing flow.
- [`@drawtonomy/sdk` overview](/reference/sdk/)
- [Exporter SDK API](/extend/exporter-sdk/)
