# @drawtonomy/sdk

SDK for building drawtonomy extensions.

[日本語](README.ja.md)

## Install

```bash
pnpm add @drawtonomy/sdk
```

## Quick Start

### 1. Create a manifest

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "description": "What this extension does",
  "author": { "name": "Your Name" },
  "entry": "./index.html",
  "capabilities": ["shapes:write", "shapes:read", "ui:panel"]
}
```

### 2. Build your extension with the SDK

```typescript
import { ExtensionClient, createVehicle, createLaneWithBoundaries } from '@drawtonomy/sdk'

const client = new ExtensionClient('my-extension')

// Wait for host connection
const init = await client.waitForInit()
console.log('Connected! Capabilities:', init.grantedCapabilities)

// Add a vehicle
client.addShapes([
  createVehicle(200, 300, { templateId: 'sedan', color: 'blue' })
])

// Create a lane with boundaries
const laneShapes = createLaneWithBoundaries(
  [{ x: 0, y: 0 }, { x: 500, y: 0 }],
  [{ x: 0, y: 70 }, { x: 500, y: 70 }]
)
client.addShapes(laneShapes)

// Read existing shapes
const vehicles = await client.requestShapes({ types: ['vehicle'] })

// Show notification
client.notify('Done!', 'success')
```

### 3. Start dev server

```bash
# Terminal 1: drawtonomy
drawtonomy-dev-server

# Terminal 2: Your extension
pnpm dev --port 3001
```

### 4. Open in browser

```
http://localhost:3000/?ext=http://localhost:3001/manifest.json
```

## API

### ExtensionClient

| Method | Required Capability | Description |
|--------|-------------------|-------------|
| `waitForInit()` | - | Wait for host connection |
| `addShapes(shapes)` | `shapes:write` | Add shapes |
| `updateShapes(updates)` | `shapes:write` | Update shapes |
| `deleteShapes(ids)` | `shapes:write` | Delete shapes |
| `requestShapes(filter?)` | `shapes:read` | Read shapes |
| `requestSnapshot()` | `snapshot:read` | Get snapshot |
| `exportScene(format)` | `snapshot:export` | Export scene (svg/png/jpeg/pdf/eps) |
| `requestViewport()` | `viewport:read` | Get viewport info |
| `requestSelection()` | `selection:read` | Get selection state |
| `notify(message, level?)` | `ui:notify` | Show notification |
| `resize(height, width?)` | `ui:panel` | Resize panel |

### Factory Functions

| Function | Description |
|----------|-------------|
| `createPoint(x, y, options?)` | Create a point |
| `createLinestring(x, y, pointIds, options?)` | Create a linestring |
| `createLane(x, y, leftId, rightId, options?)` | Create a lane |
| `createLaneWithBoundaries(leftPts, rightPts, options?)` | Create lane with boundaries |
| `createVehicle(x, y, options?)` | Create a vehicle |
| `createPedestrian(x, y, options?)` | Create a pedestrian |
| `createRectangle(x, y, w, h, options?)` | Create a rectangle |
| `createEllipse(x, y, w, h, options?)` | Create an ellipse |
| `createText(x, y, text, options?)` | Create text |
| `createPathWithFootprints(points, options?)` | Create path with footprints |
| `createSnapshot(shapes)` | Create a snapshot |

### Geometry Functions

| Function | Description |
|----------|-------------|
| `evaluatePathAt(points, t)` | Get position + tangent at parametric t [0..1] |
| `snapToPath(points, query)` | Project a point onto the nearest path location |
| `computeArcLengths(points)` | Compute cumulative arc lengths |
| `totalArcLength(points)` | Get total path length |
| `uniformTValues(count)` | Generate evenly-spaced t values |
| `computeHeadings(points)` | Compute heading angles for each point |
| `interpolatePosition(p1, p2, t)` | Linear interpolation between two points |
| `getBoundingBox(points)` | Get bounding box |
| `distanceToSegment(point, a, b)` | Point-to-segment distance |

### Snapshot

| Function | Description |
|----------|-------------|
| `parseDrawtonomySvg(svg)` | Read a `.drawtonomy.svg` source string and return the embedded `DrawtonomySnapshot`, or `null` if absent / malformed |

### Exporter Module

Convert a `DrawtonomySnapshot` into target-format strings (OpenDRIVE,
OpenSCENARIO, Lanelet2 OSM) without depending on the editor runtime — useful
for headless tooling, server-side pipelines, or browser extensions. The
Lanelet2 module additionally exposes a parser that turns OSM XML back into
editor-ready primitives (points / linestrings / lanes), enabling round-trip
workflows.

```typescript
import { exporter, createSnapshot } from '@drawtonomy/sdk'

const snapshot = createSnapshot(myShapes)
const xodr = exporter.exportToOpenDrive(snapshot)
const xosc = exporter.exportToOpenScenario(snapshot, { xodrFilename: 'scene.xodr' })

// Bundle both into a single .zip ready for esmini.
const { blob, baseName } = exporter.buildEsminiZip(snapshot, { baseName: 'my-scene' })

// Lanelet2 (.osm XML) export and round-trip.
const osm = exporter.exportToLanelet2(snapshot, { mapOrigin: { lat: 35.0, lon: 139.0 } })
const data = exporter.parseOsmXml(osm)
const imported = exporter.osmToShapes(data)
```

| Function | Description |
|----------|-------------|
| `exporter.exportToOpenDrive(snapshot)` | OpenDRIVE 1.8 (.xodr) XML |
| `exporter.exportToOpenScenario(snapshot, options?)` | OpenSCENARIO 1.3 (.xosc) XML |
| `exporter.buildEsminiZip(snapshot, options?)` | One-shot zip bundling .xodr + .xosc |
| `exporter.exportToLanelet2(snapshot, options?)` | Lanelet2 (.osm XML) document |
| `exporter.parseOsmXml(xml)` | Parse Lanelet2 OSM XML into structured data |
| `exporter.osmToShapes(data, options?)` | OSM → editor-ready point / linestring / lane records |
| `exporter.alignBoundaries(left, right)` | Decide invert flags for a lane's left / right boundary |
| `exporter.createShapeIdAllocator()` | Pluggable id allocator used by `osmToShapes` |
| `exporter.latLonToCanvas(lat, lon, ...)` / `canvasToLatLon(...)` | Equirectangular projection helpers |
| `exporter.buildPathTrajectory(input)` | Path → time-stamped vertex sequence |
| `exporter.computeCenterlineWithWidth(left, right)` | Lane centerline + width samples |
| `exporter.buildZip(entries)` | Pure ZIP builder (store mode, no deps) |
| `exporter.sanitizeFileBaseName(input)` | OS-safe base-name sanitizer |

## Deployment

Extensions can be deployed to any HTTPS hosting service.

### GitHub Pages

CORS headers are included by default — no configuration needed.

### Vercel

`vercel.json`:
```json
{
  "headers": [
    {
      "source": "/manifest.json",
      "headers": [
        { "key": "Access-Control-Allow-Origin", "value": "*" }
      ]
    }
  ]
}
```

### Netlify

`_headers`:
```
/manifest.json
  Access-Control-Allow-Origin: *
```

### Local Development

Use `@drawtonomy/dev-server` for local development. See the [Extension Development Guide](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.md) for details.

## Documentation

See the full [Extension Development Guide](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.md) for details.
