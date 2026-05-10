---
title: Import a ROS OccupancyGrid (.pgm + .yaml)
description: Bring a SLAM-built occupancy grid into drawtonomy as a background layer.
---

drawtonomy understands the ROS `map_server` format used by tools like
[nav2](https://navigation.ros.org/), Cartographer, and Gmapping.

## Import

1. Open the **File** menu → **Import**.
2. Select **both** the `.pgm` and matching `.yaml` file together in the
   file dialog.
3. drawtonomy reads the YAML metadata (resolution, thresholds) and
   renders the grid on the canvas.

If you select only the `.pgm` and no `.yaml`, drawtonomy uses defaults
(`resolution = 0.05 m/px`, standard occupancy thresholds).

## Cell colouring

| Cell | Color |
|---|---|
| Occupied | Black |
| Free | White |
| Unknown | Grey |

Cells are rendered at a scale that matches drawtonomy's lane dimensions,
so you can draw lanes directly on top.

## Tools tested

drawtonomy has been used with maps from nav2, Cartographer, and Gmapping.
Other producers should work as long as they emit the standard
`map_server` `.pgm` + `.yaml` pair.

## See also

- [Import a Lanelet2 (.osm) file](/guides/import-lanelet2/)
