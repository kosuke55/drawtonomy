---
title: エクステンションアーキテクチャ
description: drawtonomy がサードパーティエクステンションをどのように読み込み、隔離し、通信するか。
keywords:
  - エクステンション アーキテクチャ
  - iframe postmessage
  - drawtonomy 拡張 sdk
  - エクステンション 開発
---

drawtonomy のエクステンションは、エディタにコンパイルされたプラグインではありません。iframe にロードされる別の Web アプリで、`postMessage` を介してホストと通信します。このページではその理由と、その選択から派生するものを説明します。

## 読み込み

エクステンションは `manifest.json` を指す URL です。ユーザー（またはディープリンク）が `?ext=<manifestUrl>` を付けてエディタを開きます:

```
https://drawtonomy.com/?ext=https://my-extension.vercel.app/manifest.json
```

エディタはマニフェストを取得し、iframe を作成してエクステンションのエントリ HTML を読み込みます。`?ext=` パラメータを繰り返し指定すれば、複数のエクステンションを同時に読み込めます。

## 隔離

エクステンションは独自のオリジンを持つ iframe 内で動作します。次のことは **できません**:

- エディタの DOM に直接触る。
- drawtonomy の localStorage を読み取る。
- ホストの CSP を超えてリソースを読み込む。

許可されているのは、マニフェストの `capabilities` 配列でリクエストしたもの（`shapes:read`、`shapes:write`、`ui:panel` など）と、`@drawtonomy/sdk` の `ExtensionClient` を介して `postMessage` で公開されているものだけです。

これは意図的な設計です。エクステンションはサードパーティのコードであり、エディタは信頼されないものとして扱います。

## 通信

SDK は `postMessage` を `ExtensionClient` でラップし、型付きの promise ベース API を提供します:

```ts
import { ExtensionClient } from '@drawtonomy/sdk'

const client = new ExtensionClient()
const shapes = await client.getShapes()
await client.addShapes(newShapes)
```

内部での流れ:

- エクステンションがホスト iframe にリクエストを送信。
- ホストがエクステンションの capabilities に対して検証。
- ホストが応答するか、リクエストを拒否。

## なぜ iframe か

代替案 — npm 形式のプラグイン、Webpack のモジュールフェデレーション、インプロセスのスクリプト — はいずれもエクステンションのコードをエディタに信頼させる必要があります。さらにエクステンションのライフタイムをエディタのビルドに結びつけてしまいます。

iframe には次の利点があります:

- **オリジン隔離** がブラウザレベルで強制される — 自前で JS サンドボックスを保守しなくてよい。
- **デプロイサイクルが独立** — エクステンションは独自のペースでリリースできる。
- **任意のフレームワーク** — React、Vue、Svelte、バニラ JS。ホストは関知しません。
- **開発と本番で同じコード** — 開発サーバーは `localhost:3000` でエディタをホストし、`localhost:3001` のエクステンションを指定。同じ `?ext=` フラグ、同じプロトコル。

トレードオフは `postMessage` が非同期であること。一見コストフリーに見える呼び出し（`getShapes()`）にも iframe ラウンドトリップのコストがかかります。SDK は可能な範囲でバッチ処理とキャッシュをしますが、タイトループの中に呼び出しを置くのは避けてください。

## ローカル開発

`@drawtonomy/dev-server` パッケージはエディタをローカルで提供するので、ネットワークラウンドトリップなしで開発できます:

```bash
pnpm add -g @drawtonomy/dev-server
drawtonomy-dev-server                          # editor on :3000
cd my-extension && pnpm dev --port 3001        # extension on :3001
open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

完全なガイドは公開リポジトリにあります:
[エクステンション開発ガイド](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.md)。

## 関連項目

- [エクステンション SDK API](/ja/extend/extension-sdk/)
- [`@drawtonomy/sdk` の概要](/ja/reference/sdk/)
