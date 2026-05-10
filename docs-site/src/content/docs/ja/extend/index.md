---
title: drawtonomy を拡張する
description: エクステンションの開発、新しいターゲット形式の追加、テンプレートの貢献。
sidebar:
  order: 0
---

drawtonomy は拡張されることを前提に作られています。インツリーのエクステンション（AI Scene Generator、Template Preview、Exporter Playground）と同じ SDK を使って開発できます。

## 拡張ポイントを選ぶ

| やりたいこと | 読むべきページ |
|---|---|
| エディタと並んで動くパネル、ジェネレータ、ツールを追加する | [エクステンション SDK](/ja/extend/extension-sdk/) |
| 新しいエクスポートターゲット（CARLA、Unity、SUMO など）を追加する | [Exporter SDK](/ja/extend/exporter-sdk/) |
| 新しい SVG テンプレート（車両、歩行者、標識）を貢献する | [テンプレート](/ja/extend/templates/) |

## ソースコードの場所

すべてが公開されている [drawtonomy GitHub リポジトリ](https://github.com/kosuke55/drawtonomy) にあります:

- `packages/drawtonomy-sdk/` — SDK
- `packages/drawtonomy-dev-server/` — 開発用のローカルエディタ
- `extensions/` — インツリーのエクステンション（参考に有用）
- `templates/` — ビルトインの図形テンプレート

PR は歓迎します。[テンプレートガイド](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md) では、カスタム図形を追加する一連の流れを解説しています。
