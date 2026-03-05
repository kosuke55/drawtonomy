# <img src="./src/client/public/logo.png" width="32" height="32" align="center" /> drawtonomy

<h3 align="center">
  Whiteboard for Driving Diagrams 🚗
</h3>

<p align="center">
  Intuitively place lanes, vehicles, pedestrians, and traffic lights.<br />
  Browser-based. For autonomous driving development, traffic planning, and driving education.
</p>

<h4 align="center">
  🌐 <a href="https://drawtonomy.com">Try it now at drawtonomy.com</a> |
  💬 <a href="https://github.com/kosuke55/drawtonomy/issues">Report issues / Request features</a>
</h4>

<video src="https://github.com/user-attachments/assets/6e4eff04-1dab-4160-af51-e16a73341648" width="80%" controls></video>

## ✨ Features

- 🎨 **Infinite Canvas** - Draw extensive road networks
- 🛣️ **Lane Connection Management** - Edit with understanding of lane relationships
- ⚡ **Lane Tool** - Auto-generate from centerline or create from existing boundaries. Smooth boundaries with one click
- ➕ **Intersection Templates** - Place complex intersections with one click
- 🚙 **Rich Drawing Tools & Templates** - Various vehicles, pedestrians, traffic lights
- 🧲 **Snap Function** - Auto-snap to existing points and lines
- 🔗 **Point Sharing** - Connect shapes by sharing existing points
- 🎨 **Style Customization** - Set color, opacity, width, and style individually
- 💾 **Editable Save Format** - Re-edit while preserving lane connection info
- 🗺️ **[Lanelet2](https://github.com/fzi-forschungszentrum-informatik/Lanelet2) Support** - Import OSM format maps
- 🤖 **ROS Map Support** - Import OccupancyGrid maps (.pgm + .yaml) from SLAM

## 🎯 Main Features

### 🛣️ Lane Connection Management

Edit with understanding of lane relationships. Moving boundaries auto-transforms connected lanes. Set direction and adjacency with Next/Previous/Left/Right Lane.

<video src="https://github.com/user-attachments/assets/ca32a776-a17b-402a-b6ca-2eb64d485047" width="80%" controls></video>

### ⚡ Lane Tool

Auto-generate left and right boundaries by clicking the centerline. Efficiently create multiple lanes by specifying width, and draw connected lanes continuously. You can also create lanes by selecting two existing Linestrings.

<video src="https://github.com/user-attachments/assets/8caed5b7-5f1c-47ae-9f46-f5bdeebe86b2" width="80%" controls></video>

Smooth lane boundaries with one click from the Attribute Panel.

<video src="https://github.com/user-attachments/assets/2f38637e-59e6-4e63-9126-f3b6dd05f143" width="80%" controls></video>

### ➕ Intersection

Place complex intersection structures with templates in one click.

<video src="https://github.com/user-attachments/assets/e89e4821-b269-4cfa-9110-608b86547a6b" width="80%" controls></video>

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


### 🧲 Snap Function

Auto-snaps to existing points and lines. Hold Shift while drawing to temporarily disable snapping.

<video src="https://github.com/user-attachments/assets/0073c5b5-01df-448a-bae2-1262a5c2b3af" width="80%" controls></video>

### 🔗 Point Sharing

Hold Alt(Option) and click to share existing points and connect Linestring, Polygon, and Path.

<video src="https://github.com/user-attachments/assets/117fd365-747d-4501-a13c-8e301c2f1cde" width="80%" controls></video>

### 🎨 Style Customization

Set color, opacity, width, and style individually. Change default values from the hamburger menu.

<video src="https://github.com/user-attachments/assets/758a5ac1-65f4-456d-9ca6-d0f5edcef54d" width="80%" controls></video>

### ✏️ Segment Editing

Double-click Linestring, Lane, or Polygon to select and edit segments (between two points). Click on a segment to add new points for fine shape adjustments.

<video src="https://github.com/user-attachments/assets/5f98e894-8aba-4684-b613-65a74b299901" width="80%" controls></video>

### 📦 Export/Import

#### Supported Formats

| Format             | Export | Import | Note                  |
| ------------------ | :----: | :----: | --------------------- |
| **SVG**            | ✓      | ✓      |                       |
| **PNG**            | ✓      | ✓      |                       |
| **JPG**            | ✓      | ✓      |                       |
| **PDF**            | ✓      |        |                       |
| **EPS**            | ✓      |        | No transparency       |
| **drawtonomy.svg** | ✓      | ✓      | Re-editable           |
| **OSM (Lanelet2)** |        | ✓      |                       |
| **PGM+YAML (ROS)** |        | ✓      | OccupancyGrid map     |

> **Note on EPS export**: EPS format does not support transparency. When exporting shapes with opacity settings, the exported EPS will show shapes at full opacity, which may differ from the canvas display. For accurate transparency rendering, use PDF export instead.

<video src="https://github.com/user-attachments/assets/695be04e-9765-41df-b72a-291416858d5a" width="80%" controls></video>

#### [Lanelet2](https://github.com/fzi-forschungszentrum-informatik/Lanelet2) Import

Import Lanelet2 OSM format maps for editing. Sample maps: [Autoware Documentation](https://autowarefoundation.github.io/autoware-documentation/main/demos/planning-sim/#download-the-sample-map)

<video src="https://github.com/user-attachments/assets/77af4518-8a6b-4d9b-b5fa-86983332d137" width="80%" controls></video>

You can also select and import only specific lanes. For optimal performance, we recommend keeping the number of lanes under 500.

<video src="https://github.com/user-attachments/assets/4dfd7448-e450-455d-809e-0ac720db9bd1" width="80%" controls></video>

#### ROS OccupancyGrid Map Import

Import SLAM-generated maps from ROS `map_server` format (.pgm + .yaml). Select both files together in the file dialog. The map is automatically colored (occupied=black, free=white, unknown=gray) and scaled to match lane dimensions.

- `.pgm` + `.yaml` → Uses YAML settings (resolution, thresholds)
- `.pgm` only → Uses defaults (resolution=0.05 m/px)

Compatible with nav2, cartographer, gmapping, and other SLAM tools.

<p align="center">
  <img src="./docs/images/ros-occupancy-grid-map.png" width="80%" />
</p>

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
