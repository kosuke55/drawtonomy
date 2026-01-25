# <img src="./src/client/public/logo.png" width="32" height="32" align="center" /> drawtonomy

<h3 align="center">
  Free Whiteboard for Creating Driving Diagrams 🚗
</h3>

<p align="center">
  Intuitively place lanes, vehicles, pedestrians, and traffic lights.<br />
  Free and browser-based. For autonomous driving development, traffic planning, and driving education.
</p>

<h4 align="center">
  🌐 <a href="https://drawtonomy.com">Try it now at drawtonomy.com</a> |
  💬 <a href="https://github.com/kosuke55/drawtonomy/issues">Report issues / Request features</a>
</h4>

<p align="center">
  <img src="./docs/videos/drawtonomy-demo.gif" width="80%" />
</p>

## ✨ Features

- 🎨 **Infinite Canvas** - Freely draw extensive road networks
- 🛣️ **Lane Connection Management** - Edit with understanding of lane relationships
- ⚡ **Lane Tool** - Auto-generate from centerline or create from existing boundaries
- ➕ **Intersection Templates** - Place complex intersections with one click
- 🚙 **Rich Drawing Tools & Templates** - Various vehicles, pedestrians, traffic lights
- 🧲 **Snap Function** - Auto-snap to existing points and lines
- 🔗 **Point Sharing** - Connect shapes by sharing existing points
- 🎨 **Shape Customization** - Set color, opacity, width, and style individually
- 💾 **Editable Save Format** - Re-edit while preserving lane connection info
- 🗺️ **Lanelet2 Support** - Import industry-standard OSM format

## 🎯 Main Features

### 🛣️ Lane Connection Management

Edit with understanding of lane relationships. Moving boundaries auto-transforms connected lanes. Set direction and adjacency with Next/Previous/Left/Right Lane.

<p align="center">
  <img src="./docs/videos/lane-connection-demo.gif" width="80%" />
</p>

### ⚡ Lane Tool

Auto-generate left and right boundaries by clicking the centerline. Efficiently create multiple lanes by specifying width, and draw connected lanes continuously. You can also create lanes by selecting two existing Linestrings.

<p align="center">
  <img src="./docs/videos/lane-tool-demo.gif" width="80%" />
</p>

### ➕ Intersection

Place complex intersection structures with templates in one click.

<p align="center">
  <img src="./docs/videos/intersection-demo.gif" width="80%" />
</p>

### 🚙 Rich Drawing Tools & Templates

Drawing tools and shape templates for easily expressing autonomous driving scenarios.

**🚗 Autonomous Driving Focused:**

- Linestring (continuous lines for lane boundaries, etc.)
- Lane
- Vehicle (Sedan, Bus, Truck, Motorcycle templates)
- Pedestrian (Walking, Simple templates)
- Path (Arrow style, Band style)
- Polygon
- Crosswalk
- TrafficLight (vehicle and pedestrian signals)
- Intersection

**✏️ Basic Shapes:**

- LineArrow
- Arrow
- Text
- Freehand
- Rectangle
- Ellipse
- Image

<!-- TODO: Add template list image -->

### 🧲 Snap Function

Auto-snaps to existing points and lines. Hold Shift while drawing to temporarily disable snapping.

<p align="center">
  <img src="./docs/videos/snap-demo.gif" width="80%" />
</p>

### 🔗 Point Sharing

Hold Alt(Option) and click to share existing points and connect Linestring, Polygon, and Path.

<p align="center">
  <img src="./docs/videos/share-demo.gif" width="80%" />
</p>

### 🎨 Shape Customization

Set color, opacity, width, and style individually for each shape. Change default values for all Lanes and Polygons from the hamburger menu.

<p align="center">
  <img src="./docs/videos/style-demo.gif" width="80%" />
</p>

### ✏️ Segment Editing

Double-click Linestring, Lane, or Polygon to select and edit segments (between two points). Click on a segment to add new points for fine shape adjustments.

<p align="center">
  <img src="./docs/videos/segment-demo.gif" width="80%" />
</p>

### 📦 Export/Import

Supports export/import in re-editable formats.

<p align="center">
  <img src="./docs/videos/export-demo.gif" width="80%" />
</p>


#### Export Formats

| Format             | Description                                                                      |
| ------------------ | -------------------------------------------------------------------------------- |
| **drawtonomy.svg** | Preserves lane connection and template info (JSON internally). Re-editable       |
| **SVG**            | Vector image. No degradation when scaling                                        |
| **PNG**            | Raster image. Transparent background supported                                   |

#### Import Formats

| Format             | Description                                          |
| ------------------ | ---------------------------------------------------- |
| **SVG**            | Placed as object                                     |
| **PNG**            | Placed as object                                     |
| **drawtonomy.svg** | Fully restore previously saved data                  |
| **OSM (Lanelet2)** | Load map data in autonomous driving industry format  |

## ⌨️ Keyboard Shortcuts

### Tool Switching

| Key  | Function                           |
| ---- | ---------------------------------- |
| M    | Hand (pan tool)                    |
| V    | Select tool                        |
| L    | Create Linestring                  |
| N    | Create Lane                        |
| P    | Participants (Vehicle/Pedestrian)  |
| H    | Create Path                        |
| G    | Create Polygon                     |
| X    | Create Crosswalk                   |
| I    | Create Intersection                |
| W    | Create LineArrow                   |
| T    | Create Text                        |
| D    | Create Freehand                    |

### Edit Operations

| Key                        | Function                                        |
| -------------------------- | ----------------------------------------------- |
| Ctrl+Z / Cmd+Z             | Undo                                            |
| Ctrl+Shift+Z / Cmd+Shift+Z | Redo                                            |
| Ctrl+C / Cmd+C             | Copy                                            |
| Ctrl+V / Cmd+V             | Paste                                           |
| Delete / Backspace         | Delete                                          |
| Shift                      | Temporarily disable snap (while drawing)        |
| Alt + Click                | Share existing point (Linestring/Polygon/Path)  |
| Double-click               | Segment editing (Linestring/Lane/Polygon)       |
