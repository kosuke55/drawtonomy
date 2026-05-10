---
title: Obsługiwane formaty eksportu
description: Co drawtonomy może odczytywać i zapisywać.
---

| Format | Eksport | Import | Uwagi |
|---|:-:|:-:|---|
| **SVG** | ✓ | ✓ | Standardowy SVG. |
| **PNG** | ✓ | ✓ | Bezstratny raster. |
| **JPG** | ✓ | ✓ | Stratny raster. |
| **PDF** | ✓ |  | Wektorowy, obsługuje przezroczystość. |
| **EPS** | ✓ |  | Wektorowy. **Brak przezroczystości** — zamiast tego użyj PDF. |
| **drawtonomy.svg** | ✓ | ✓ | Edytowalny ponownie: zachowuje połączenia, punkty współdzielone, grupy śladów, styl. |
| **OSM (Lanelet2)** | ✓ | ✓ | Sieci drogowe [Lanelet2](https://github.com/fzi-forschungszentrum-informatik/Lanelet2). |
| **PGM + YAML (ROS)** |  | ✓ | Mapa OccupancyGrid, format ROS `map_server`. |
| **OpenDRIVE (.xodr)** | ✓ |  | ASAM 1.8. |
| **OpenSCENARIO (.xosc)** | ✓ |  | ASAM 1.3. |
| **paczka esmini (.zip)** | ✓ |  | `.xodr` + `.xosc` razem, gotowe dla `esmini`. |

## Co jest zachowywane

| Funkcja | drawtonomy.svg | Lanelet2 | OpenDRIVE | OpenSCENARIO | PNG/SVG/PDF |
|---|:-:|:-:|:-:|:-:|:-:|
| Geometria | ✓ | ✓ | ✓ | ✓ | ✓ |
| Połączenia pasów | ✓ | ✓ | ✓ | częściowo | – |
| Punkty współdzielone | ✓ | – | – | – | – |
| Grupy śladów | ✓ | – | – | częściowo | – |
| Styl (kolor, krycie) | ✓ | – | – | – | ✓ |
| Round-trip | ✓ | ✓ | – | – | – |

## Zobacz także

- [Eksport sceny](/pl/guides/export/)
- [Eksport do OpenDRIVE / OpenSCENARIO / esmini](/pl/guides/export-asam/)
