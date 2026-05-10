---
title: テンプレートを貢献する
description: 新しい車両、歩行者、標識、道路標示テンプレートを追加する方法。
keywords:
  - テンプレート 貢献
  - svg 車両 テンプレート
  - 自動運転 図形 追加
  - 標識 道路標示 svg
---

テンプレートは SVG ファイルにマニフェストエントリを加えたものです。一度貢献すれば、エディタの Participants メニューや図形メニューにビルトインテンプレートと並んで表示されます。

貢献の流れは公開リポジトリにあります:

➡ **[テンプレートガイド](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md)**

## カテゴリ

| フォルダ | 例 |
|---|---|
| `templates/vehicle/` | Sedan、Bus、Truck、Motorcycle |
| `templates/pedestrian/` | Walking、Simple |
| `templates/road_marking/` | 横断歩道、矢印標示 |
| `templates/sign/` | 一時停止、譲れ、信号機ヘッド |
| `templates/other/` | その他 |

## 手順

1. 適切なカテゴリフォルダに SVG を追加します。
2. `templates/manifest.json` に登録します。
3. PR を作成します。キャンバスに配置したテンプレートのスクリーンショットを添付してください。

## 良いテンプレートの条件

- 妥当なデフォルトサイズで描かれている（セダン車両は 4 ～ 5 m 程度）。
- 単一の色変更可能領域に既知の塗りを設定し、属性パネルのカラーピッカーで色変更できるようにする。
- 外部フォント参照を含まない — 含まれる場合はパスに変換しておく。
- ファイルサイズが妥当（車両サイズのテンプレートで約 30 KB 以下）。
