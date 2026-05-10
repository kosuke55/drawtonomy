---
title: Desteklenen dışa aktarma formatları
description: drawtonomy'nin neyi okuyabileceği ve yazabileceği.
keywords:
  - drawtonomy dışa aktarma formatları
  - sürüş diyagramı formatları
  - OpenDRIVE dışa aktarma
  - OpenSCENARIO dışa aktarma
  - Lanelet2 dışa aktarma
---

| Format | Dışa Aktar | İçe Aktar | Notlar |
|---|:-:|:-:|---|
| **SVG** | ✓ | ✓ | Standart SVG. |
| **PNG** | ✓ | ✓ | Kayıpsız raster. |
| **JPG** | ✓ | ✓ | Kayıplı raster. |
| **PDF** | ✓ |  | Vektör, şeffaflığı destekler. |
| **EPS** | ✓ |  | Vektör. **Şeffaflık yok** — bunun yerine PDF kullanın. |
| **drawtonomy.svg** | ✓ | ✓ | Yeniden düzenlenebilir: bağlantıları, paylaşılan noktaları, ayak izi gruplarını ve stili korur. |
| **OSM (Lanelet2)** | ✓ | ✓ | [Lanelet2](https://github.com/fzi-forschungszentrum-informatik/Lanelet2) yol ağları. |
| **PGM + YAML (ROS)** |  | ✓ | OccupancyGrid haritası, ROS `map_server` formatı. |
| **OpenDRIVE (.xodr)** | ✓ |  | ASAM 1.8. |
| **OpenSCENARIO (.xosc)** | ✓ |  | ASAM 1.3. |
| **esmini paketi (.zip)** | ✓ |  | `.xodr` + `.xosc` birlikte, `esmini` için hazır. |

## Neyin korunduğu

| Özellik | drawtonomy.svg | Lanelet2 | OpenDRIVE | OpenSCENARIO | PNG/SVG/PDF |
|---|:-:|:-:|:-:|:-:|:-:|
| Geometri | ✓ | ✓ | ✓ | ✓ | ✓ |
| Şerit bağlantıları | ✓ | ✓ | ✓ | kısmi | – |
| Paylaşılan noktalar | ✓ | – | – | – | – |
| Ayak izi grupları | ✓ | – | – | kısmi | – |
| Stil (renk, opaklık) | ✓ | – | – | – | ✓ |
| Çift yönlü dönüşüm | ✓ | ✓ | – | – | – |

## Ayrıca bakın

- [Sahnenizi dışa aktarın](/tr/guides/export/)
- [OpenDRIVE / OpenSCENARIO / esmini'ye dışa aktarın](/tr/guides/export-asam/)
