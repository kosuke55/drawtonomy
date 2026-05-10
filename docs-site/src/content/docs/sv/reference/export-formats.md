---
title: Exportformat som stöds
description: Vad drawtonomy kan läsa och skriva.
---

| Format | Export | Import | Anteckningar |
|---|:-:|:-:|---|
| **SVG** | ✓ | ✓ | Standard-SVG. |
| **PNG** | ✓ | ✓ | Förlustfri raster. |
| **JPG** | ✓ | ✓ | Förlustbringande raster. |
| **PDF** | ✓ |  | Vektor, stöder transparens. |
| **EPS** | ✓ |  | Vektor. **Ingen transparens** — använd PDF istället. |
| **drawtonomy.svg** | ✓ | ✓ | Återredigerbar: behåller kopplingar, delade punkter, fotavtrycksgrupper, stil. |
| **OSM (Lanelet2)** | ✓ | ✓ | [Lanelet2](https://github.com/fzi-forschungszentrum-informatik/Lanelet2)-vägnät. |
| **PGM + YAML (ROS)** |  | ✓ | OccupancyGrid-karta, ROS `map_server`-format. |
| **OpenDRIVE (.xodr)** | ✓ |  | ASAM 1.8. |
| **OpenSCENARIO (.xosc)** | ✓ |  | ASAM 1.3. |
| **esmini-paket (.zip)** | ✓ |  | `.xodr` + `.xosc` tillsammans, klar för `esmini`. |

## Vad som bevaras

| Funktion | drawtonomy.svg | Lanelet2 | OpenDRIVE | OpenSCENARIO | PNG/SVG/PDF |
|---|:-:|:-:|:-:|:-:|:-:|
| Geometri | ✓ | ✓ | ✓ | ✓ | ✓ |
| Körfältskopplingar | ✓ | ✓ | ✓ | partiell | – |
| Delade punkter | ✓ | – | – | – | – |
| Fotavtrycksgrupper | ✓ | – | – | partiell | – |
| Stil (färg, opacitet) | ✓ | – | – | – | ✓ |
| Tur och retur | ✓ | ✓ | – | – | – |

## Se även

- [Exportera din scen](/sv/guides/export/)
- [Exportera till OpenDRIVE / OpenSCENARIO / esmini](/sv/guides/export-asam/)
