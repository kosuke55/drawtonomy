---
title: 支持的导出格式
description: drawtonomy 能读取与写出哪些文件格式。
keywords:
  - drawtonomy 导出格式
  - 自动驾驶场景导出
  - OpenDRIVE 导出
  - OpenSCENARIO 导出
  - Lanelet2 导出
  - esmini 导出
  - 自动驾驶图导入
---

| 格式 | 导出 | 导入 | 备注 |
|---|:-:|:-:|---|
| **SVG** | ✓ | ✓ | 标准 SVG。 |
| **PNG** | ✓ | ✓ | 无损栅格图。 |
| **JPG** | ✓ | ✓ | 有损栅格图。 |
| **PDF** | ✓ |  | 矢量,支持透明度。 |
| **EPS** | ✓ |  | 矢量。**不支持透明度**——请改用 PDF。 |
| **drawtonomy.svg** | ✓ | ✓ | 可重新编辑:保留连接、共享点、足迹组、样式。 |
| **OSM (Lanelet2)** | ✓ | ✓ | [Lanelet2](https://github.com/fzi-forschungszentrum-informatik/Lanelet2) 路网。 |
| **PGM + YAML (ROS)** |  | ✓ | OccupancyGrid 地图,ROS `map_server` 格式。 |
| **OpenDRIVE (.xodr)** | ✓ |  | ASAM 1.8。 |
| **OpenSCENARIO (.xosc)** | ✓ |  | ASAM 1.3。 |
| **esmini bundle (.zip)** | ✓ |  | `.xodr` + `.xosc` 一并打包,可直接用于 `esmini`。 |

## 哪些信息会被保留

| 特性 | drawtonomy.svg | Lanelet2 | OpenDRIVE | OpenSCENARIO | PNG/SVG/PDF |
|---|:-:|:-:|:-:|:-:|:-:|
| 几何 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 车道连接 | ✓ | ✓ | ✓ | 部分 | – |
| 共享点 | ✓ | – | – | – | – |
| 足迹组 | ✓ | – | – | 部分 | – |
| 样式(颜色、不透明度) | ✓ | – | – | – | ✓ |
| 双向兼容 | ✓ | ✓ | – | – | – |

## 另请参阅

- [导出场景](/zh-cn/guides/export/)
- [导出至 OpenDRIVE / OpenSCENARIO / esmini](/zh-cn/guides/export-asam/)
