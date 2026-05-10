---
title: Unterstützte Exportformate
description: Was drawtonomy lesen und schreiben kann.
keywords:
  - drawtonomy Exportformate
  - OpenDRIVE Export
  - OpenSCENARIO Export
  - Lanelet2 OSM Export
  - esmini ZIP
  - drawtonomy.svg
  - ROS OccupancyGrid
  - PGM YAML Import
---

| Format | Export | Import | Hinweise |
|---|:-:|:-:|---|
| **SVG** | ✓ | ✓ | Standard-SVG. |
| **PNG** | ✓ | ✓ | Verlustfreies Raster. |
| **JPG** | ✓ | ✓ | Verlustbehaftetes Raster. |
| **PDF** | ✓ |  | Vektor, mit Transparenz-Unterstützung. |
| **EPS** | ✓ |  | Vektor. **Keine Transparenz** — verwenden Sie stattdessen PDF. |
| **drawtonomy.svg** | ✓ | ✓ | Erneut bearbeitbar: behält Verbindungen, geteilte Punkte, Footprint-Gruppen, Stil. |
| **OSM (Lanelet2)** | ✓ | ✓ | [Lanelet2](https://github.com/fzi-forschungszentrum-informatik/Lanelet2)-Straßennetze. |
| **PGM + YAML (ROS)** |  | ✓ | OccupancyGrid-Karte, ROS-`map_server`-Format. |
| **OpenDRIVE (.xodr)** | ✓ |  | ASAM 1.8. |
| **OpenSCENARIO (.xosc)** | ✓ |  | ASAM 1.3. |
| **esmini-Bundle (.zip)** | ✓ |  | `.xodr` + `.xosc` zusammen, fertig für `esmini`. |

## Was erhalten bleibt

| Merkmal | drawtonomy.svg | Lanelet2 | OpenDRIVE | OpenSCENARIO | PNG/SVG/PDF |
|---|:-:|:-:|:-:|:-:|:-:|
| Geometrie | ✓ | ✓ | ✓ | ✓ | ✓ |
| Spurverbindungen | ✓ | ✓ | ✓ | teilweise | – |
| Geteilte Punkte | ✓ | – | – | – | – |
| Footprint-Gruppen | ✓ | – | – | teilweise | – |
| Stil (Farbe, Deckkraft) | ✓ | – | – | – | ✓ |
| Hin- und Rückreise | ✓ | ✓ | – | – | – |

## Siehe auch

- [Szene exportieren](/de/guides/export/)
- [Export nach OpenDRIVE / OpenSCENARIO / esmini](/de/guides/export-asam/)
