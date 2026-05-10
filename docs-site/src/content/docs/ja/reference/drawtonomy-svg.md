---
title: drawtonomy.svg 形式
description: 再編集可能な drawtonomy ファイルのディスク上の構造。
keywords:
  - drawtonomy svg 形式
  - 再編集可能 svg
  - 自動運転 シーン 保存
  - svg メタデータ レーン
---

`drawtonomy.svg` ファイルは、エディタ専用の状態を記録するメタデータを追加した通常の SVG です。

## 構造

- 視覚的な内容（パス、テキスト、画像）はプレーンな SVG です。任意の SVG ビューアが正しくレンダリングできます。
- ドキュメントの先頭にある `<metadata>` ブロックに、drawtonomy 固有のデータが格納されます:
  - 図形 ID と図形ごとのプロパティ（テンプレート、スタイルなど）
  - レーン接続スロット（`next`、`previous`、`left`、`right`）
  - 共有点の参照
  - フットプリントグループの所属
  - z-order（重なり順）

## 互換性

`drawtonomy.svg` を一般的な SVG エディタ（Illustrator、Inkscape、ブラウザ）で編集して保存すると、明示的に保持しない限りメタデータブロックが失われます。drawtonomy はそれでもファイルを開けますが、接続情報や共有点は失われています。

drawtonomy 外でラウンドトリップ可能な編集を行う場合は SDK（[`@drawtonomy/sdk`](/ja/reference/sdk/)）を使ってください — エディタを介さずにこの形式の読み書きができます。

## バージョニング

古いファイルはインポート時に自動的にマイグレーションされます。SDK の `resolveColorKey()` ヘルパーが、レガシーなカラーキー（例えば v1.x の `grey-700`）を現行のものに変換します。

## 関連項目

- [シーンをエクスポートする](/ja/guides/export/)
- [`@drawtonomy/sdk` の概要](/ja/reference/sdk/)
