---
title: Supported export formats
description: What drawtonomy can read and write.
---

| Format | Export | Import | Notes |
|---|:-:|:-:|---|
| **SVG** | ✓ | ✓ | Standard SVG. |
| **PNG** | ✓ | ✓ | Lossless raster. |
| **JPG** | ✓ | ✓ | Lossy raster. |
| **PDF** | ✓ |  | Vector, supports transparency. |
| **EPS** | ✓ |  | Vector. **No transparency** — use PDF instead. |
| **drawtonomy.svg** | ✓ | ✓ | Re-editable: keeps connections, shared points, footprint groups, style. |
| **OSM (Lanelet2)** | ✓ | ✓ | [Lanelet2](https://github.com/fzi-forschungszentrum-informatik/Lanelet2) road networks. |
| **PGM + YAML (ROS)** |  | ✓ | OccupancyGrid map, ROS `map_server` format. |
| **OpenDRIVE (.xodr)** | ✓ |  | ASAM 1.8. |
| **OpenSCENARIO (.xosc)** | ✓ |  | ASAM 1.3. |
| **esmini bundle (.zip)** | ✓ |  | `.xodr` + `.xosc` together, ready for `esmini`. |

## What gets preserved

| Feature | drawtonomy.svg | Lanelet2 | OpenDRIVE | OpenSCENARIO | PNG/SVG/PDF |
|---|:-:|:-:|:-:|:-:|:-:|
| Geometry | ✓ | ✓ | ✓ | ✓ | ✓ |
| Lane connections | ✓ | ✓ | ✓ | partial | – |
| Shared points | ✓ | – | – | – | – |
| Footprint groups | ✓ | – | – | partial | – |
| Style (color, opacity) | ✓ | – | – | – | ✓ |
| Round-trip | ✓ | ✓ | – | – | – |

## See also

- [Export your scene](/guides/export/)
- [Export to OpenDRIVE / OpenSCENARIO / esmini](/guides/export-asam/)
