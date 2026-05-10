---
title: Format ekspor yang didukung
description: Apa yang dapat dibaca dan ditulis drawtonomy.
---

| Format | Ekspor | Impor | Catatan |
|---|:-:|:-:|---|
| **SVG** | ✓ | ✓ | SVG standar. |
| **PNG** | ✓ | ✓ | Raster lossless. |
| **JPG** | ✓ | ✓ | Raster lossy. |
| **PDF** | ✓ |  | Vektor, mendukung transparansi. |
| **EPS** | ✓ |  | Vektor. **Tanpa transparansi** — gunakan PDF sebagai gantinya. |
| **drawtonomy.svg** | ✓ | ✓ | Dapat diedit ulang: mempertahankan koneksi, titik bersama, grup footprint, gaya. |
| **OSM (Lanelet2)** | ✓ | ✓ | Jaringan jalan [Lanelet2](https://github.com/fzi-forschungszentrum-informatik/Lanelet2). |
| **PGM + YAML (ROS)** |  | ✓ | Peta OccupancyGrid, format ROS `map_server`. |
| **OpenDRIVE (.xodr)** | ✓ |  | ASAM 1.8. |
| **OpenSCENARIO (.xosc)** | ✓ |  | ASAM 1.3. |
| **paket esmini (.zip)** | ✓ |  | `.xodr` + `.xosc` bersamaan, siap untuk `esmini`. |

## Apa yang dipertahankan

| Fitur | drawtonomy.svg | Lanelet2 | OpenDRIVE | OpenSCENARIO | PNG/SVG/PDF |
|---|:-:|:-:|:-:|:-:|:-:|
| Geometri | ✓ | ✓ | ✓ | ✓ | ✓ |
| Koneksi jalur | ✓ | ✓ | ✓ | sebagian | – |
| Titik bersama | ✓ | – | – | – | – |
| Grup footprint | ✓ | – | – | sebagian | – |
| Gaya (warna, opasitas) | ✓ | – | – | – | ✓ |
| Round-trip | ✓ | ✓ | – | – | – |

## Lihat juga

- [Ekspor adegan Anda](/id/guides/export/)
- [Ekspor ke OpenDRIVE / OpenSCENARIO / esmini](/id/guides/export-asam/)
