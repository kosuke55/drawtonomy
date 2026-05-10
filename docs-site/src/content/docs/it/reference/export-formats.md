---
title: Formati di esportazione supportati
description: Cosa drawtonomy può leggere e scrivere.
---

| Formato | Esportazione | Importazione | Note |
|---|:-:|:-:|---|
| **SVG** | ✓ | ✓ | SVG standard. |
| **PNG** | ✓ | ✓ | Raster senza perdita. |
| **JPG** | ✓ | ✓ | Raster con perdita. |
| **PDF** | ✓ |  | Vettoriale, supporta la trasparenza. |
| **EPS** | ✓ |  | Vettoriale. **Niente trasparenza** — usa PDF invece. |
| **drawtonomy.svg** | ✓ | ✓ | Modificabile: mantiene connessioni, punti condivisi, gruppi footprint, stile. |
| **OSM (Lanelet2)** | ✓ | ✓ | Reti stradali [Lanelet2](https://github.com/fzi-forschungszentrum-informatik/Lanelet2). |
| **PGM + YAML (ROS)** |  | ✓ | Mappa OccupancyGrid, formato `map_server` di ROS. |
| **OpenDRIVE (.xodr)** | ✓ |  | ASAM 1.8. |
| **OpenSCENARIO (.xosc)** | ✓ |  | ASAM 1.3. |
| **bundle esmini (.zip)** | ✓ |  | `.xodr` + `.xosc` insieme, pronti per `esmini`. |

## Cosa viene preservato

| Caratteristica | drawtonomy.svg | Lanelet2 | OpenDRIVE | OpenSCENARIO | PNG/SVG/PDF |
|---|:-:|:-:|:-:|:-:|:-:|
| Geometria | ✓ | ✓ | ✓ | ✓ | ✓ |
| Connessioni delle corsie | ✓ | ✓ | ✓ | parziale | – |
| Punti condivisi | ✓ | – | – | – | – |
| Gruppi footprint | ✓ | – | – | parziale | – |
| Stile (colore, opacità) | ✓ | – | – | – | ✓ |
| Round-trip | ✓ | ✓ | – | – | – |

## Vedi anche

- [Esporta la tua scena](/it/guides/export/)
- [Esporta verso OpenDRIVE / OpenSCENARIO / esmini](/it/guides/export-asam/)
