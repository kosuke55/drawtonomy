---
title: 支援的匯出格式
description: drawtonomy 可讀取與寫入的格式。
keywords:
  - drawtonomy 匯出格式
  - 自駕場景格式
  - OpenDRIVE 匯出
  - OpenSCENARIO 匯出
  - Lanelet2 匯出
  - drawtonomy.svg 格式
  - esmini zip 套件
---

| 格式 | 匯出 | 匯入 | 備註 |
|---|:-:|:-:|---|
| **SVG** | ✓ | ✓ | 標準 SVG。 |
| **PNG** | ✓ | ✓ | 無損點陣。 |
| **JPG** | ✓ | ✓ | 有損點陣。 |
| **PDF** | ✓ |  | 向量,支援透明度。 |
| **EPS** | ✓ |  | 向量。**不支援透明度**——請改用 PDF。 |
| **drawtonomy.svg** | ✓ | ✓ | 可重新編輯:保留連接、共享點、足跡群組與樣式。 |
| **OSM (Lanelet2)** | ✓ | ✓ | [Lanelet2](https://github.com/fzi-forschungszentrum-informatik/Lanelet2) 道路網路。 |
| **PGM + YAML (ROS)** |  | ✓ | OccupancyGrid 地圖,ROS `map_server` 格式。 |
| **OpenDRIVE (.xodr)** | ✓ |  | ASAM 1.8。 |
| **OpenSCENARIO (.xosc)** | ✓ |  | ASAM 1.3。 |
| **esmini 套件 (.zip)** | ✓ |  | `.xodr` + `.xosc` 一起,可直接給 `esmini` 使用。 |

## 各格式保留內容

| 特性 | drawtonomy.svg | Lanelet2 | OpenDRIVE | OpenSCENARIO | PNG/SVG/PDF |
|---|:-:|:-:|:-:|:-:|:-:|
| 幾何 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 車道連接 | ✓ | ✓ | ✓ | 部分 | – |
| 共享點 | ✓ | – | – | – | – |
| 足跡群組 | ✓ | – | – | 部分 | – |
| 樣式(顏色、透明度)| ✓ | – | – | – | ✓ |
| 雙向轉換 | ✓ | ✓ | – | – | – |

## 另請參閱

- [匯出您的場景](/zh-tw/guides/export/)
- [匯出至 OpenDRIVE / OpenSCENARIO / esmini](/zh-tw/guides/export-asam/)
