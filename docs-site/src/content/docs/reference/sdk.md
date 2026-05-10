---
title: '@drawtonomy/sdk overview'
description: Packages, entry points, and how the SDK fits with the editor.
---

`@drawtonomy/sdk` is the package extension authors and headless tooling
build against. It exposes:

| Module | Purpose |
|---|---|
| `ExtensionClient` | postMessage client for iframe-hosted extensions. |
| Shape factory functions | `createLane()`, `createVehicle()`, etc. |
| `createSnapshot()` | Build a `DrawtonomySnapshot` from an array of shapes. |
| `exporter.*` | Pure functions that turn a snapshot into OpenDRIVE / OpenSCENARIO / esmini zip / Lanelet2 OSM. Also includes a Lanelet2 parser. |
| Types | `BaseShape`, `LaneShape`, `VehicleShape`, `DrawtonomySnapshot`, … |

## Install

```bash
pnpm add @drawtonomy/sdk
```

## Companion packages

| Package | Purpose |
|---|---|
| [`@drawtonomy/sdk`](https://www.npmjs.com/package/@drawtonomy/sdk) | The SDK itself. |
| [`@drawtonomy/dev-server`](https://www.npmjs.com/package/@drawtonomy/dev-server) | Local dev server that hosts the editor for extension development. |

## Source

The SDK source, tests, and examples live in the
[drawtonomy GitHub repository](https://github.com/kosuke55/drawtonomy/tree/main/packages/drawtonomy-sdk).

## See also

- [Extension SDK API](/extend/extension-sdk/) — building iframe extensions.
- [Exporter SDK API](/extend/exporter-sdk/) — adding new target formats.
