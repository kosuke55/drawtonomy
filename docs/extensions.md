# drawtonomy Extensions

[日本語版はこちら](extensions.ja.md)

Extensions are an iframe-based plugin system that lets you add functionality to drawtonomy without accessing the core source code.

You can develop and test extensions using `@drawtonomy/dev-server` — no need to clone or build the drawtonomy source code.

## Table of Contents

- [Quick Start](#quick-start)
- [How Extensions are Loaded](#how-extensions-are-loaded)
- [Developing Extensions](#developing-extensions)
- [Manifest](#manifest)
- [Capabilities](#capabilities)
- [Message Protocol](#message-protocol)
- [SDK Helper Functions](#sdk-helper-functions)
- [Deployment](#deployment)
- [Security](#security)

---

## Quick Start

### 1. Start the drawtonomy Dev Server

```bash
npm install -g @drawtonomy/dev-server
drawtonomy-dev-server
# → http://localhost:3000
```

This downloads and serves the same app as `drawtonomy.com` locally.

### 2. Start the Sample Extension

```bash
cd examples/ai-scene-generator
npm install
npm run dev
# → http://localhost:3001
```

### 3. Open in Browser

```
http://localhost:3000/?ext=http://localhost:3001/manifest.json
```

The Extension panel appears on the right with the AI Scene Generator UI.

### 4. Generate a Scene

1. Select API Provider (Anthropic or OpenAI)
2. Select Model (e.g. Claude Sonnet 4, GPT-4o)
3. Enter your API key
4. Describe the scene (e.g. `A two-lane road with two cars and a pedestrian`)
5. Click "Generate Scene"

---

## How Extensions are Loaded

Extensions are loaded via the `?ext=<manifestUrl>` URL parameter.

```
# Local extension (with dev-server)
http://localhost:3000/?ext=http://localhost:3001/manifest.json

# Deployed extension (with drawtonomy.com)
https://drawtonomy.com?ext=https://my-extension.vercel.app/manifest.json

# Multiple extensions
http://localhost:3000/?ext=http://localhost:3001/manifest.json&ext=http://localhost:3002/manifest.json
```

> **Note**: `drawtonomy.com` (HTTPS) cannot load extensions from `localhost` (HTTP) due to browser Private Network Access restrictions. Use `@drawtonomy/dev-server` for local development, or deploy your extension to an HTTPS host.

---

## Developing Extensions

### Minimum Structure

```
my-extension/
  manifest.json    # Extension definition (required)
  index.html       # Entry point (required)
  src/             # Source code
```

### Step 1: Create Project

```bash
mkdir my-extension && cd my-extension
npm init -y
npm install @drawtonomy/sdk
```

### Step 2: Create Manifest

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

### Step 3: Create Entry Point

Extensions run inside an iframe. Use any framework (React, Vue, Svelte, vanilla JS, etc.).

**With SDK (recommended):**

```typescript
import { ExtensionClient, createVehicle } from '@drawtonomy/sdk'

const client = new ExtensionClient('my-extension')
const init = await client.waitForInit()
console.log('Connected! Capabilities:', init.grantedCapabilities)

// Add a vehicle on button click
document.getElementById('addBtn')!.addEventListener('click', () => {
  client.addShapes([createVehicle(200, 200, { templateId: 'sedan' })])
})
```

**Vanilla JS (no SDK):**

```html
<!DOCTYPE html>
<html>
<head><title>My Extension</title></head>
<body>
  <button id="addBtn">Add Vehicle</button>
  <script>
    // 1. Send ready signal to host
    window.parent.postMessage({ type: 'ext:ready', payload: { manifestId: 'my-extension' } }, '*')

    // 2. Wait for init message from host
    window.addEventListener('message', (event) => {
      if (event.data.type === 'ext:init') {
        console.log('Connected! Capabilities:', event.data.payload.grantedCapabilities)
      }
    })

    // 3. Add shape on button click
    document.getElementById('addBtn').addEventListener('click', () => {
      window.parent.postMessage({
        type: 'ext:shapes-add',
        payload: {
          shapes: [{
            id: 'my-vehicle-1',
            type: 'vehicle',
            x: 200, y: 200,
            rotation: 0, zIndex: 0,
            props: {
              w: 90, h: 45,
              color: 'black', size: 'm',
              attributes: { type: 'vehicle', subtype: 'car' },
              osmId: '', templateId: 'sedan'
            }
          }]
        }
      }, '*')
    })
  </script>
</body>
</html>
```

### Step 4: Start Dev Server

```bash
# Using npx serve
npx serve . --port 3001

# Using Vite
npm run dev -- --port 3001
```

### Step 5: Load in drawtonomy

```bash
# Terminal 1: drawtonomy dev server
drawtonomy-dev-server

# Terminal 2: Your extension
npm run dev -- --port 3001

# Browser
open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

---

## Manifest

The manifest defines extension metadata and required permissions.

| Field | Required | Description |
|-------|:---:|-------------|
| `id` | Yes | Unique ID (lowercase alphanumeric + hyphens) |
| `name` | Yes | Display name |
| `version` | Yes | Semver format (e.g. `1.0.0`) |
| `description` | Yes | Description |
| `author` | Yes | `{ name: string, url?: string }` |
| `entry` | Yes | Relative path to entry HTML |
| `icon` | - | Relative path to icon |
| `capabilities` | Yes | Array of required permissions |
| `minHostVersion` | - | Minimum host version |

---

## Capabilities

Extensions can only use capabilities declared in their manifest. Messages for undeclared capabilities are rejected by the host.

| Capability | Description | Use Cases |
|-----------|-------------|-----------|
| `shapes:write` | Add, update, delete shapes | AI generation, import, templates |
| `shapes:read` | Read existing shapes | Export, analysis |
| `snapshot:read` | Get full snapshot | Backup, conversion |
| `viewport:read` | Get viewport info | Position-aware placement |
| `selection:read` | Read selection state | Process selected shapes |
| `ui:panel` | Display iframe UI in side panel | Custom UI |
| `ui:notify` | Show toast notification on host | Completion notifications |

---

## Message Protocol

Extensions communicate with the host via `window.parent.postMessage()`.

> **Tip**: Use the `ExtensionClient` from `@drawtonomy/sdk` to avoid working with postMessage directly.

### Extension → Host

| Message | Capability | Description |
|---------|-----------|-------------|
| `ext:ready` | (none) | Connection established. Host responds with `ext:init` |
| `ext:shapes-add` | `shapes:write` | Add shapes |
| `ext:shapes-update` | `shapes:write` | Update shape props |
| `ext:shapes-delete` | `shapes:write` | Delete shapes |
| `ext:shapes-request` | `shapes:read` | Request shape data (with filter) |
| `ext:snapshot-request` | `snapshot:read` | Request snapshot |
| `ext:viewport-request` | `viewport:read` | Request viewport info |
| `ext:selection-request` | `selection:read` | Request selection state |
| `ext:notify` | `ui:notify` | Show toast notification |
| `ext:resize` | `ui:panel` | Resize iframe |

### Host → Extension

| Message | Timing |
|---------|--------|
| `ext:init` | After ready, sends capability/viewport info |
| `ext:shapes-response` | Response to shapes-request |
| `ext:snapshot-response` | Response to snapshot-request |
| `ext:viewport-response` | Response to viewport-request |
| `ext:selection-response` | Response to selection-request |
| `ext:error` | On error |

---

## SDK Helper Functions

The `@drawtonomy/sdk` package provides helpers for extension development.

### ExtensionClient

High-level API wrapping postMessage communication:

```typescript
import { ExtensionClient } from '@drawtonomy/sdk'

const client = new ExtensionClient('my-extension')

// Wait for initialization
const init = await client.waitForInit()
console.log('Capabilities:', init.grantedCapabilities)

// Add shapes
client.addShapes([...])

// Read shapes (returns Promise)
const shapes = await client.requestShapes({ types: ['vehicle'] })

// Get snapshot
const snapshot = await client.requestSnapshot()

// Get viewport
const viewport = await client.requestViewport()

// Get selection
const selection = await client.requestSelection()

// Send notification
client.notify('Done!', 'success')
```

### Factory Functions

Helpers for creating shapes:

```typescript
import {
  createVehicle,
  createPedestrian,
  createLaneWithBoundaries,
  createRectangle,
  createText,
} from '@drawtonomy/sdk'

// Create a vehicle
const car = createVehicle(200, 300, { templateId: 'sedan', color: 'blue' })

// Create a lane with boundaries (handles point → linestring → lane dependencies)
const laneShapes = createLaneWithBoundaries(
  [{ x: 0, y: 0 }, { x: 500, y: 0 }],       // Left boundary points
  [{ x: 0, y: 70 }, { x: 500, y: 70 }],      // Right boundary points
  { laneOptions: { color: 'default' } }
)

// Send to host
client.addShapes([...laneShapes, car])
```

---

## Shape Types

| Type | Description | Key Props |
|------|-------------|-----------|
| `point` | Coordinate point | `color`, `visible` |
| `linestring` | Line (boundary) | `pointIds[]`, `color`, `strokeWidth` |
| `lane` | Road lane | `leftBoundaryId`, `rightBoundaryId`, `color` |
| `vehicle` | Vehicle | `w`, `h`, `templateId` (`default`, `sedan`, `bus`, `truck`, `motorcycle`, `bicycle`) |
| `pedestrian` | Pedestrian | `w`, `h`, `templateId` (`filled`, `walking`, `simple`) |
| `rectangle` | Rectangle | `w`, `h`, `color`, `fill` |
| `ellipse` | Ellipse | `w`, `h`, `color`, `fill` |
| `arrow` | Arrow | `w`, `h`, `direction` |
| `text` | Text | `text`, `fontSize`, `font` |
| `polygon` | Polygon | `pointIds[]`, `color`, `fillOpacity` |
| `traffic_light` | Traffic light | `w`, `h` |
| `crosswalk` | Crosswalk | `pointIds[]`, `color` |
| `freehand` | Freehand | `points[]`, `color` |
| `image` | Image | `w`, `h`, `src` |

---

## Deployment

To publish an extension, host the manifest.json and build output on HTTPS.

### GitHub Pages

CORS headers are included by default — no additional configuration needed.

```
https://drawtonomy.com?ext=https://username.github.io/my-extension/manifest.json
```

### Vercel

Add CORS headers in `vercel.json`:

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

Create a `_headers` file:

```
/manifest.json
  Access-Control-Allow-Origin: *
```

### Local Development

Use `@drawtonomy/dev-server` for local development:

```bash
# Terminal 1
drawtonomy-dev-server

# Terminal 2
npm run dev -- --port 3001

# Browser
open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

---

## Security

- iframes run with `sandbox="allow-scripts"` (no `allow-same-origin`)
- Shape data is validated with Zod schemas
- IDs are automatically regenerated on the host side (collision prevention)
- Coordinates are clamped to ±100,000
- Maximum 10,000 shapes per add operation
- Maximum message size of 10MB
- Messages for undeclared capabilities are rejected

---

## Extension Ideas

- **Data Import**: CSV/GeoJSON → drawtonomy shapes
- **Export/Analysis**: Shape statistics, lane connection graph visualization
- **Template Library**: Predefined patterns for intersections, parking lots, etc.
- **AI Generation**: Generate scenes from natural language (see sample)
- **External Integration**: Bidirectional data sync with simulators
