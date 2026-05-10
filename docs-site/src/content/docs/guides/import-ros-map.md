---
title: Import a ROS OccupancyGrid (.pgm + .yaml)
description: Load a ROS map_server occupancy grid (.pgm + .yaml) — built with nav2, Cartographer, or Gmapping — into drawtonomy as a background layer, then sketch paths, lanes, and obstacles on top.
keywords:
  - ROS occupancy grid annotation
  - nav2 map editor
  - cartographer map viewer
  - draw on pgm map
  - SLAM map annotation tool
---

drawtonomy understands the ROS `map_server` format used by
[nav2](https://navigation.ros.org/), Cartographer, Gmapping, and
similar SLAM tools.

![A ROS occupancy grid imported into drawtonomy with arrows and shelves drawn on top](/img/ros-occupancy-grid.png)

The screenshot shows a real warehouse occupancy grid (occupied
cells black, free cells white) with paths and obstacles drawn
directly over it inside drawtonomy.

## Import

1. Open the **File** menu → **Import**.
2. Select **both** the `.pgm` and matching `.yaml` file together
   in the file dialog.
3. drawtonomy reads the YAML metadata (resolution, thresholds) and
   renders the grid on the canvas.

If you select only the `.pgm` and no `.yaml`, drawtonomy uses
defaults (`resolution = 0.05 m/px`, standard occupancy thresholds).

## Cell colouring

| Cell | Color |
|---|---|
| Occupied | Black |
| Free | White |
| Unknown | Grey |

Cells render at a scale that matches drawtonomy's lane dimensions,
so you can draw lanes, paths, and shapes directly on top — exactly
like the screenshot above.

## Tools tested

drawtonomy has been used with maps from nav2, Cartographer, and
Gmapping. Other producers should work as long as they emit the
standard `map_server` `.pgm` + `.yaml` pair.

## See also

- [Import a Lanelet2 (.osm) file](/guides/import-lanelet2/)
