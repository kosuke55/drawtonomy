---
title: 図形カタログ
description: drawtonomy が作成できるすべての図形を、目的別にまとめます。
keywords:
  - drawtonomy 図形 一覧
  - 自動運転 シナリオ 図形
  - レーン 交差点 横断歩道
  - 図形 テンプレート 自動運転
---

## 運転シナリオの図形

| 図形 | 役割 |
|---|---|
| **Linestring** | 連続した線。レーン境界、縁石、標示線などに使用。 |
| **Lane** | 走行可能な車線。2 本の境界、センターライン、接続スロット（Next / Previous / Left / Right）を持つ。 |
| **Vehicle** | テンプレート化された車両（Sedan、Bus、Truck、Motorcycle）。 |
| **Pedestrian** | テンプレート化された歩行者（Walking、Simple）。 |
| **Path** | 矢印、フットプリントグループ、シナリオパスとして使う軌跡。Arrow または Band スタイル。 |
| **Polygon** | 閉じた領域（駐車場、ハッチング領域）。 |
| **Crosswalk** | 事前にスタイル設定された横断歩道。 |
| **TrafficLight** | 車両用または歩行者用の信号機。 |
| **Intersection** | 多車線の交差点テンプレート。 |

## 基本図形

| 図形 | 役割 |
|---|---|
| **LineArrow** | 1 セグメントの矢印。 |
| **Arrow** | 自由形状の矢印。 |
| **Text** | プレーン文字または注釈付き文字。 |
| **Freehand** | ペン風ストロークで描く線。 |
| **Rectangle** | 軸並行の矩形。 |
| **Ellipse** | 軸並行の楕円。 |
| **Image** | インポートされた PNG / JPG / SVG。 |

## カスタムテンプレート

車両、歩行者、道路標示、標識用の SVG テンプレートを追加できます。貢献の流れは [テンプレートガイド](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md) を参照してください。
