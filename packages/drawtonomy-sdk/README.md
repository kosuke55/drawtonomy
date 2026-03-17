# @drawtonomy/sdk

SDK for building drawtonomy extensions.

[日本語](README.ja.md)

## Install

```bash
npm install @drawtonomy/sdk
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
npm run dev -- --port 3001
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
| `createSnapshot(shapes)` | Create a snapshot |

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
