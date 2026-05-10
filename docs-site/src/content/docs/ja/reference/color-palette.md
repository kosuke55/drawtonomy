---
title: カラーパレット
description: drawtonomy のカラーキーと、それに対応する HEX 値。
keywords:
  - drawtonomy カラーパレット
  - 図形 色 hex
  - tailwind 風 パレット
  - 自動運転 図 配色
---

drawtonomy は Tailwind / Material 風のパレットを使用しています: grey-100（最も明るい）から grey-900（最も暗い）まで、それに名前付きの色を加えたものです。

## グレースケール

| キー | HEX | 備考 |
|---|---|---|
| `grey-100` | `#e6e6e6` | 最も明るい。Vehicle (Simple) のデフォルト。 |
| `grey-200` | `#cccccc` | |
| `grey-300` | `#b3b3b3` | Pedestrian (Walking & Simple) のデフォルト。 |
| `grey-400` | `#999999` | |
| `grey-500` | `#808080` | 中間グレー。 |
| `grey-600` | `#666666` | |
| `grey-700` | `#4d4d4d` | |
| `grey-800` | `#333333` | |
| `grey-900` | `#1a1a1a` | 最も暗い。 |

数字が小さいほど明るくなります。これは Tailwind の慣習に合わせています。

## テンプレートのデフォルト

| テンプレート | デフォルトの色 |
|---|---|
| Pedestrian (Walking) | `grey-300` |
| Pedestrian (Simple) | `grey-300` |
| Vehicle (Simple) | `grey-100` |
| その他の図形 | `black` |

## プログラム経由で色を設定する

SDK の `resolveColor()` を使ってキーから HEX 値に変換できます。詳しくは [エクステンション SDK API](/ja/extend/extension-sdk/) を参照してください。
