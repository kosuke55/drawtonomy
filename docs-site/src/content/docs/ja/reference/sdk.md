---
title: '@drawtonomy/sdk の概要'
description: パッケージ、エントリポイント、エディタとの関係。
keywords:
  - drawtonomy sdk
  - 自動運転 sdk
  - エクステンション開発
  - シナリオ プログラム エクスポート
---

`@drawtonomy/sdk` は、エクステンション作者やヘッドレスツールがビルドに使うパッケージです。次の機能を提供します:

| モジュール | 役割 |
|---|---|
| `ExtensionClient` | iframe ホスト型エクステンション向けの postMessage クライアント。 |
| 図形ファクトリ関数 | `createLane()`、`createVehicle()` など。 |
| `createSnapshot()` | 図形配列から `DrawtonomySnapshot` を構築。 |
| `exporter.*` | スナップショットを OpenDRIVE / OpenSCENARIO / esmini zip / Lanelet2 OSM に変換する純粋関数。Lanelet2 パーサーも含む。 |
| 型 | `BaseShape`、`LaneShape`、`VehicleShape`、`DrawtonomySnapshot` など。 |

## インストール

```bash
pnpm add @drawtonomy/sdk
```

## 関連パッケージ

| パッケージ | 役割 |
|---|---|
| [`@drawtonomy/sdk`](https://www.npmjs.com/package/@drawtonomy/sdk) | SDK 本体。 |
| [`@drawtonomy/dev-server`](https://www.npmjs.com/package/@drawtonomy/dev-server) | エクステンション開発用にエディタをホストするローカル開発サーバー。 |

## ソースコード

SDK のソースコード、テスト、サンプルは [drawtonomy GitHub リポジトリ](https://github.com/kosuke55/drawtonomy/tree/main/packages/drawtonomy-sdk) にあります。

## 関連項目

- [エクステンション SDK API](/ja/extend/extension-sdk/) — iframe エクステンションを構築する。
- [Exporter SDK API](/ja/extend/exporter-sdk/) — 新しいターゲット形式を追加する。
