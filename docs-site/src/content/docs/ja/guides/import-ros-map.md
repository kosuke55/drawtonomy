---
title: ROS OccupancyGrid (.pgm + .yaml) をインポートする
description: nav2、Cartographer、Gmapping で構築した ROS map_server 形式の占有格子地図 (.pgm + .yaml) を drawtonomy に背景レイヤーとして読み込み、その上にパス、レーン、障害物をスケッチします。
keywords:
  - ROS 占有格子地図 アノテーション
  - nav2 地図 エディタ
  - cartographer 地図 ビューア
  - pgm 地図 描画
  - SLAM 地図 アノテーション ツール
  - 占有格子 図 描画
  - ロボティクス 地図 編集
---

drawtonomy は [nav2](https://navigation.ros.org/)、Cartographer、Gmapping などの SLAM ツールで使われる ROS `map_server` 形式に対応しています。

![drawtonomy にインポートした ROS 占有格子地図の上に矢印と棚を描いた様子](/img/ros-occupancy-grid.png)

スクリーンショットは、実際の倉庫の占有格子地図（占有セルが黒、自由セルが白）に対して、drawtonomy 内で直接パスや障害物を描き加えた様子です。

## インポート

1. **File** メニュー → **Import** を開きます。
2. ファイルダイアログで `.pgm` と対応する `.yaml` の **両方を一緒に** 選びます。
3. drawtonomy が YAML のメタデータ（解像度、しきい値）を読み取り、グリッドをキャンバスにレンダリングします。

`.pgm` だけを選んで `.yaml` を含めない場合、drawtonomy はデフォルト値（`resolution = 0.05 m/px`、標準の占有しきい値）を使用します。

## セルの色分け

| セル | 色 |
|---|---|
| 占有 | 黒 |
| 自由 | 白 |
| 不明 | グレー |

セルは drawtonomy のレーン寸法に合うスケールでレンダリングされるので、上記スクリーンショットのようにそのままレーン、パス、図形を描き重ねられます。

## 動作確認済みのツール

drawtonomy は nav2、Cartographer、Gmapping の地図で動作確認しています。標準的な `map_server` の `.pgm` + `.yaml` ペアを出力するツールであれば、他のものでも動作するはずです。

## 関連項目

- [Lanelet2 (.osm) ファイルをインポートする](/ja/guides/import-lanelet2/)
