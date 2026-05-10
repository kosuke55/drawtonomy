---
title: サポートされるエクスポート形式
description: drawtonomy が読み書きできる形式の一覧。
keywords:
  - エクスポート 形式 一覧
  - 自動運転 シナリオ エクスポート
  - opendrive openscenario lanelet2
  - svg pdf エクスポート
---

| 形式 | エクスポート | インポート | 備考 |
|---|:-:|:-:|---|
| **SVG** | ✓ | ✓ | 標準 SVG。 |
| **PNG** | ✓ | ✓ | 可逆ラスタ。 |
| **JPG** | ✓ | ✓ | 非可逆ラスタ。 |
| **PDF** | ✓ |  | ベクター、透明度対応。 |
| **EPS** | ✓ |  | ベクター。**透明度非対応** — 代わりに PDF を使用。 |
| **drawtonomy.svg** | ✓ | ✓ | 再編集可能: 接続、共有点、フットプリントグループ、スタイルを保持。 |
| **OSM (Lanelet2)** | ✓ | ✓ | [Lanelet2](https://github.com/fzi-forschungszentrum-informatik/Lanelet2) 道路ネットワーク。 |
| **PGM + YAML (ROS)** |  | ✓ | OccupancyGrid 地図、ROS `map_server` 形式。 |
| **OpenDRIVE (.xodr)** | ✓ |  | ASAM 1.8。 |
| **OpenSCENARIO (.xosc)** | ✓ |  | ASAM 1.3。 |
| **esmini バンドル (.zip)** | ✓ |  | `.xodr` + `.xosc` を同梱、`esmini` ですぐ再生可能。 |

## 保持される情報

| 機能 | drawtonomy.svg | Lanelet2 | OpenDRIVE | OpenSCENARIO | PNG/SVG/PDF |
|---|:-:|:-:|:-:|:-:|:-:|
| ジオメトリ | ✓ | ✓ | ✓ | ✓ | ✓ |
| レーン接続 | ✓ | ✓ | ✓ | 部分的 | – |
| 共有点 | ✓ | – | – | – | – |
| フットプリントグループ | ✓ | – | – | 部分的 | – |
| スタイル（色、不透明度） | ✓ | – | – | – | ✓ |
| ラウンドトリップ | ✓ | ✓ | – | – | – |

## 関連項目

- [シーンをエクスポートする](/ja/guides/export/)
- [OpenDRIVE / OpenSCENARIO / esmini へエクスポート](/ja/guides/export-asam/)
