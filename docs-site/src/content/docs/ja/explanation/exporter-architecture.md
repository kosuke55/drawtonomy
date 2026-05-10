---
title: エクスポータアーキテクチャ
description: キャンバスがどのようにスナップショットになり、スナップショットがどのようにファイルになるか。
keywords:
  - エクスポータ アーキテクチャ
  - スナップショット 自動運転 シナリオ
  - opendrive 出力
  - openscenario 出力
  - lanelet2 ラウンドトリップ
---

エクスポータは、drawtonomy のエディタ内データと外部形式（OpenDRIVE、OpenSCENARIO、Lanelet2、その他自分で接続するもの）の間の橋渡しを担います。新しいターゲット形式を追加する前に、まずこのパイプラインを理解しておく必要があります。

## パイプライン

```
Editor state ──► DrawtonomySnapshot ──► Exporter ──► File / blob
                  (シリアライズ可能)     (純粋関数)
```

### 1. `DrawtonomySnapshot`

スナップショットはプレーンなオブジェクトです: 図形のリストとバージョン、タイムスタンプを含みます。シリアライズ可能で DOM への参照を持たず、エクスポータへの唯一の入力となります。

```ts
interface DrawtonomySnapshot {
  version: string
  timestamp: string
  shapes: BaseShape[]
}
```

スナップショットは `createSnapshot(shapes)` で構築するか、保存済みの `drawtonomy.svg` を `parseDrawtonomySvg(svg)` でパースして得られます。

### 2. エクスポータモジュール

各ターゲット形式は別々の純粋関数として実装されています:

- `exporter.exportToOpenDrive(snapshot, options) → string`（XML）
- `exporter.exportToOpenScenario(snapshot, options) → string`（XML）
- `exporter.exportToLanelet2(snapshot, options) → string`（OSM XML）
- `exporter.buildEsminiZip(snapshot, options) → { blob, baseName }`

スナップショットを受け取り、文字列または Blob を返します。エディタアクセスも DOM も非同期依存もなく、同じ入力からは常に同じ出力が得られます。

### 3. ラウンドトリップ

Lanelet2 については、SDK にパーサーも同梱されています:

- `exporter.parseOsmXml(osm) → ParsedOsm`
- `exporter.osmToShapes(parsed) → BaseShape[]`

これが [Lanelet2 のインポート](/ja/guides/import-lanelet2/) フローを支えています。

## 純粋関数を選んだ理由

エクスポータは、ブラウザでも、Node の CI スクリプトでも、サーバーサイドのパイプラインでも、ブラウザエクステンションでも同じコードパスで動作します。テストはヘッドレスブラウザを使わず、スナップショットのフィクスチャに対して実行できます。

これがエクスポータをエディタの中ではなく `@drawtonomy/sdk` に置いている理由です — エディタが SDK に依存し、その逆ではありません。

## ターゲット形式を追加する

エクスポータは、CARLA、Unity、SUMO、独自 DSL などの新しいターゲット向けの主要な拡張ポイントです。手順は次の通り:

1. `packages/drawtonomy-sdk/src/exporter/` 配下に新しいモジュールを追加。
2. `DrawtonomySnapshot` を入力に取り、文字列または Blob を返す。
3. `packages/drawtonomy-sdk/__tests__/exporter/` 配下にスナップショットフィクスチャを使うテストを追加。
4. エディタの Export メニューから呼び出したい場合は、UI のエントリポイントを接続（オプション — 多くのユーザーはプログラム経由で呼び出すでしょう）。

開発者向けの完全なガイドは公開リポジトリにあります:
[Exporter Developer Guide](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.md)。

## 関連項目

- [OpenDRIVE / OpenSCENARIO / esmini へエクスポート](/ja/guides/export-asam/) — ユーザー向けのフロー。
- [`@drawtonomy/sdk` の概要](/ja/reference/sdk/)
- [Exporter SDK API](/ja/extend/exporter-sdk/)
