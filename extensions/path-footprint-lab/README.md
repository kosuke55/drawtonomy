# Path Footprint Lab

Development extension for experimenting with variable footprint positioning on paths.

## Quick Start

```bash
# Terminal 1: Start dev server
drawtonomy-dev-server

# Terminal 2: Start this extension
cd extensions/path-footprint-lab
pnpm install
pnpm dev

# Browser
open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

## Usage

1. Draw a path using the Path tool in the editor
2. Select the path — the extension auto-detects it
3. Choose a template (sedan, bus, truck, pedestrian, etc.)
4. Adjust t-value sliders for each footprint position (0.0 = start, 1.0 = end)
5. Click **Apply to Selected Path**

Footprints maintain their t-value positions when the path is moved or edited.

## Export

Select a format (SVG, PNG, JPEG, PDF, EPS, .drawtonomy.svg) and click **Export** to download the current scene.

## Smoothed Display Points

When requesting path shapes via `requestShapes()`, path linestrings include a `_displayPoints` property with smoothed curve coordinates. Use these for accurate position calculation:

```typescript
const shapes = await client.requestShapes({ ids: [pathId] })
const path = shapes.find(s => s.type === 'linestring' && s.props.isPath)
const displayPoints = path.props._displayPoints // smoothed coordinates
```

## Key SDK Functions

```typescript
import {
  evaluatePathAt,    // Get position + tangent at parametric t [0..1]
  snapToPath,        // Project a point onto the path
  computeArcLengths, // Arc-length parameterization
  totalArcLength,    // Total path length
  uniformTValues,    // Generate evenly-spaced t values
} from '@drawtonomy/sdk'
```

## Variable Mode

This extension uses `footprint.mode = 'variable'` with `footprint.tValues` to position footprints at arbitrary locations along the path. In variable mode:

- Each footprint maintains its own t-value position
- Dragging a footprint updates only that footprint's t-value
- Path editing causes footprints to reposition along the new curve while preserving t-values
- Template, color, and size changes on one footprint do not sync to siblings

## Contributors

- [@vishwesh5](https://github.com/vishwesh5)
