---
title: Ondersteunde exportformaten
description: Wat drawtonomy kan lezen en schrijven.
---

| Formaat | Export | Import | Opmerkingen |
|---|:-:|:-:|---|
| **SVG** | ✓ | ✓ | Standaard SVG. |
| **PNG** | ✓ | ✓ | Verliesvrij raster. |
| **JPG** | ✓ | ✓ | Verliesgevend raster. |
| **PDF** | ✓ |  | Vector, ondersteunt transparantie. |
| **EPS** | ✓ |  | Vector. **Geen transparantie** — gebruik in plaats daarvan PDF. |
| **drawtonomy.svg** | ✓ | ✓ | Herbewerkbaar: behoudt verbindingen, gedeelde punten, footprintgroepen, stijl. |
| **OSM (Lanelet2)** | ✓ | ✓ | [Lanelet2](https://github.com/fzi-forschungszentrum-informatik/Lanelet2)-wegennetten. |
| **PGM + YAML (ROS)** |  | ✓ | OccupancyGrid-kaart, ROS `map_server`-formaat. |
| **OpenDRIVE (.xodr)** | ✓ |  | ASAM 1.8. |
| **OpenSCENARIO (.xosc)** | ✓ |  | ASAM 1.3. |
| **esmini-bundel (.zip)** | ✓ |  | `.xodr` + `.xosc` samen, klaar voor `esmini`. |

## Wat behouden blijft

| Functie | drawtonomy.svg | Lanelet2 | OpenDRIVE | OpenSCENARIO | PNG/SVG/PDF |
|---|:-:|:-:|:-:|:-:|:-:|
| Geometrie | ✓ | ✓ | ✓ | ✓ | ✓ |
| Rijstrookverbindingen | ✓ | ✓ | ✓ | gedeeltelijk | – |
| Gedeelde punten | ✓ | – | – | – | – |
| Footprintgroepen | ✓ | – | – | gedeeltelijk | – |
| Stijl (kleur, opaciteit) | ✓ | – | – | – | ✓ |
| Round-trip | ✓ | ✓ | – | – | – |

## Zie ook

- [Uw scène exporteren](/nl/guides/export/)
- [Exporteren naar OpenDRIVE / OpenSCENARIO / esmini](/nl/guides/export-asam/)
