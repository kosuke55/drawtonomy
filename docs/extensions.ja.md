# drawtonomy エクステンション

[English version](extensions.md)

エクステンションは、iframeベースのプラグインシステムで、コアソースコードにアクセスせずにdrawtonomyに機能を追加できます。

`@drawtonomy/dev-server`を使うことで、drawtonomyのソースコードをクローン・ビルドすることなくエクステンションの開発・テストが可能です。

## 目次

- [クイックスタート](#クイックスタート)
- [エクステンションの読み込み方法](#エクステンションの読み込み方法)
- [エクステンションの開発](#エクステンションの開発)
- [マニフェスト](#マニフェスト)
- [ケイパビリティ](#ケイパビリティ)
- [メッセージプロトコル](#メッセージプロトコル)
- [SDKヘルパー関数](#sdkヘルパー関数)
- [デプロイ](#デプロイ)
- [セキュリティ](#セキュリティ)

---

## クイックスタート

### 1. drawtonomy Dev Serverを起動

```bash
npm install -g @drawtonomy/dev-server
drawtonomy-dev-server
# → http://localhost:3000
```

`drawtonomy.com`と同じアプリをローカルでダウンロード・配信します。

### 2. サンプルエクステンションを起動

```bash
cd examples/ai-scene-generator
npm install
npm run dev
# → http://localhost:3001
```

### 3. ブラウザで開く

```
http://localhost:3000/?ext=http://localhost:3001/manifest.json
```

右側にAI Scene GeneratorのUIを持つエクステンションパネルが表示されます。

### 4. シーンを生成

1. APIプロバイダーを選択（AnthropicまたはOpenAI）
2. モデルを選択（例: Claude Sonnet 4, GPT-4o）
3. APIキーを入力
4. シーンを記述（例: `A two-lane road with two cars and a pedestrian`）
5. "Generate Scene"をクリック

---

## エクステンションの読み込み方法

エクステンションは`?ext=<manifestUrl>`URLパラメータで読み込まれます。

```
# ローカルエクステンション（dev-server使用）
http://localhost:3000/?ext=http://localhost:3001/manifest.json

# デプロイ済みエクステンション（drawtonomy.com使用）
https://drawtonomy.com?ext=https://my-extension.vercel.app/manifest.json

# 複数エクステンション
http://localhost:3000/?ext=http://localhost:3001/manifest.json&ext=http://localhost:3002/manifest.json
```

> **注意**: `drawtonomy.com`（HTTPS）はブラウザのPrivate Network Access制限により、`localhost`（HTTP）からエクステンションを読み込めません。ローカル開発には`@drawtonomy/dev-server`を使用するか、エクステンションをHTTPSホストにデプロイしてください。

---

## エクステンションの開発

### 最小構成

```
my-extension/
  manifest.json    # エクステンション定義（必須）
  index.html       # エントリーポイント（必須）
  src/             # ソースコード
```

### ステップ1: プロジェクト作成

```bash
mkdir my-extension && cd my-extension
npm init -y
npm install @drawtonomy/sdk
```

### ステップ2: マニフェスト作成

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "description": "What this extension does",
  "author": { "name": "Your Name" },
  "entry": "./index.html",
  "capabilities": ["shapes:write", "shapes:read", "ui:panel"]
}
```

### ステップ3: エントリーポイント作成

エクステンションはiframe内で実行されます。任意のフレームワーク（React, Vue, Svelte, vanilla JS等）を使用できます。

**SDK使用（推奨）:**

```typescript
import { ExtensionClient, createVehicle } from '@drawtonomy/sdk'

const client = new ExtensionClient('my-extension')
const init = await client.waitForInit()
console.log('Connected! Capabilities:', init.grantedCapabilities)

// ボタンクリックで車両を追加
document.getElementById('addBtn')!.addEventListener('click', () => {
  client.addShapes([createVehicle(200, 200, { templateId: 'sedan' })])
})
```

**vanilla JS（SDKなし）:**

```html
<!DOCTYPE html>
<html>
<head><title>My Extension</title></head>
<body>
  <button id="addBtn">Add Vehicle</button>
  <script>
    // 1. ホストにready信号を送信
    window.parent.postMessage({ type: 'ext:ready', payload: { manifestId: 'my-extension' } }, '*')

    // 2. ホストからのinitメッセージを待機
    window.addEventListener('message', (event) => {
      if (event.data.type === 'ext:init') {
        console.log('Connected! Capabilities:', event.data.payload.grantedCapabilities)
      }
    })

    // 3. ボタンクリックでシェイプを追加
    document.getElementById('addBtn').addEventListener('click', () => {
      window.parent.postMessage({
        type: 'ext:shapes-add',
        payload: {
          shapes: [{
            id: 'my-vehicle-1',
            type: 'vehicle',
            x: 200, y: 200,
            rotation: 0, zIndex: 0,
            props: {
              w: 90, h: 45,
              color: 'black', size: 'm',
              attributes: { type: 'vehicle', subtype: 'car' },
              osmId: '', templateId: 'sedan'
            }
          }]
        }
      }, '*')
    })
  </script>
</body>
</html>
```

### ステップ4: 開発サーバーを起動

```bash
# npx serveを使用
npx serve . --port 3001

# Viteを使用
npm run dev -- --port 3001
```

### ステップ5: drawtonomyで読み込み

```bash
# ターミナル1: drawtonomy dev server
drawtonomy-dev-server

# ターミナル2: エクステンション
npm run dev -- --port 3001

# ブラウザ
open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

---

## マニフェスト

マニフェストはエクステンションのメタデータと必要な権限を定義します。

| フィールド | 必須 | 説明 |
|-----------|:---:|------|
| `id` | Yes | 一意のID（小文字英数字+ハイフン） |
| `name` | Yes | 表示名 |
| `version` | Yes | Semver形式（例: `1.0.0`） |
| `description` | Yes | 説明 |
| `author` | Yes | `{ name: string, url?: string }` |
| `entry` | Yes | エントリーHTMLへの相対パス |
| `icon` | - | アイコンへの相対パス |
| `capabilities` | Yes | 必要な権限の配列 |
| `minHostVersion` | - | 最小ホストバージョン |

---

## ケイパビリティ

エクステンションはマニフェストで宣言したケイパビリティのみ使用できます。宣言されていないケイパビリティへのメッセージはホストによって拒否されます。

| ケイパビリティ | 説明 | ユースケース |
|--------------|------|-------------|
| `shapes:write` | シェイプの追加・更新・削除 | AI生成、インポート、テンプレート |
| `shapes:read` | 既存シェイプの読み取り | エクスポート、分析 |
| `snapshot:read` | フルスナップショットの取得 | バックアップ、変換 |
| `viewport:read` | ビューポート情報の取得 | 位置を考慮した配置 |
| `selection:read` | 選択状態の読み取り | 選択中のシェイプを処理 |
| `ui:panel` | サイドパネルにiframe UIを表示 | カスタムUI |
| `ui:notify` | ホストにトースト通知を表示 | 完了通知 |

---

## メッセージプロトコル

エクステンションは`window.parent.postMessage()`を介してホストと通信します。

> **ヒント**: `@drawtonomy/sdk`の`ExtensionClient`を使用すると、postMessageを直接扱う必要がなくなります。

### エクステンション → ホスト

| メッセージ | ケイパビリティ | 説明 |
|-----------|--------------|------|
| `ext:ready` | (なし) | 接続確立。ホストが`ext:init`で応答 |
| `ext:shapes-add` | `shapes:write` | シェイプを追加 |
| `ext:shapes-update` | `shapes:write` | シェイプのプロパティを更新 |
| `ext:shapes-delete` | `shapes:write` | シェイプを削除 |
| `ext:shapes-request` | `shapes:read` | シェイプデータを要求（フィルター付き） |
| `ext:snapshot-request` | `snapshot:read` | スナップショットを要求 |
| `ext:viewport-request` | `viewport:read` | ビューポート情報を要求 |
| `ext:selection-request` | `selection:read` | 選択状態を要求 |
| `ext:notify` | `ui:notify` | トースト通知を表示 |
| `ext:resize` | `ui:panel` | iframeをリサイズ |

### ホスト → エクステンション

| メッセージ | タイミング |
|-----------|-----------|
| `ext:init` | ready後、ケイパビリティ/ビューポート情報を送信 |
| `ext:shapes-response` | shapes-requestへの応答 |
| `ext:snapshot-response` | snapshot-requestへの応答 |
| `ext:viewport-response` | viewport-requestへの応答 |
| `ext:selection-response` | selection-requestへの応答 |
| `ext:error` | エラー発生時 |

---

## SDKヘルパー関数

`@drawtonomy/sdk`パッケージはエクステンション開発用のヘルパーを提供します。

### ExtensionClient

postMessage通信をラップする高レベルAPI:

```typescript
import { ExtensionClient } from '@drawtonomy/sdk'

const client = new ExtensionClient('my-extension')

// 初期化を待機
const init = await client.waitForInit()
console.log('Capabilities:', init.grantedCapabilities)

// シェイプを追加
client.addShapes([...])

// シェイプを読み取り（Promiseを返す）
const shapes = await client.requestShapes({ types: ['vehicle'] })

// スナップショットを取得
const snapshot = await client.requestSnapshot()

// ビューポートを取得
const viewport = await client.requestViewport()

// 選択状態を取得
const selection = await client.requestSelection()

// 通知を送信
client.notify('Done!', 'success')
```

### ファクトリ関数

シェイプ作成用のヘルパー:

```typescript
import {
  createVehicle,
  createPedestrian,
  createLaneWithBoundaries,
  createRectangle,
  createText,
} from '@drawtonomy/sdk'

// 車両を作成
const car = createVehicle(200, 300, { templateId: 'sedan', color: 'blue' })

// 境界付きレーンを作成（point → linestring → laneの依存関係を処理）
const laneShapes = createLaneWithBoundaries(
  [{ x: 0, y: 0 }, { x: 500, y: 0 }],       // 左境界の点
  [{ x: 0, y: 70 }, { x: 500, y: 70 }],      // 右境界の点
  { laneOptions: { color: 'default' } }
)

// ホストに送信
client.addShapes([...laneShapes, car])
```

---

## シェイプタイプ

| タイプ | 説明 | 主要プロパティ |
|-------|------|--------------|
| `point` | 座標点 | `color`, `visible` |
| `linestring` | 線（境界） | `pointIds[]`, `color`, `strokeWidth` |
| `lane` | 道路レーン | `leftBoundaryId`, `rightBoundaryId`, `color` |
| `vehicle` | 車両 | `w`, `h`, `templateId` (`default`, `sedan`, `bus`, `truck`, `motorcycle`, `bicycle`) |
| `pedestrian` | 歩行者 | `w`, `h`, `templateId` (`filled`, `walking`, `simple`) |
| `rectangle` | 矩形 | `w`, `h`, `color`, `fill` |
| `ellipse` | 楕円 | `w`, `h`, `color`, `fill` |
| `arrow` | 矢印 | `w`, `h`, `direction` |
| `text` | テキスト | `text`, `fontSize`, `font` |
| `polygon` | ポリゴン | `pointIds[]`, `color`, `fillOpacity` |
| `traffic_light` | 信号機 | `w`, `h` |
| `crosswalk` | 横断歩道 | `pointIds[]`, `color` |
| `freehand` | フリーハンド | `points[]`, `color` |
| `image` | 画像 | `w`, `h`, `src` |

---

## デプロイ

エクステンションを公開するには、manifest.jsonとビルド出力をHTTPSでホスティングします。

### GitHub Pages

CORSヘッダーがデフォルトで含まれているため、追加設定は不要です。

```
https://drawtonomy.com?ext=https://username.github.io/my-extension/manifest.json
```

### Vercel

`vercel.json`にCORSヘッダーを追加:

```json
{
  "headers": [
    {
      "source": "/manifest.json",
      "headers": [
        { "key": "Access-Control-Allow-Origin", "value": "*" }
      ]
    }
  ]
}
```

### Netlify

`_headers`ファイルを作成:

```
/manifest.json
  Access-Control-Allow-Origin: *
```

### ローカル開発

ローカル開発には`@drawtonomy/dev-server`を使用:

```bash
# ターミナル1
drawtonomy-dev-server

# ターミナル2
npm run dev -- --port 3001

# ブラウザ
open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

---

## セキュリティ

- iframeは`sandbox="allow-scripts"`で実行（`allow-same-origin`なし）
- シェイプデータはZodスキーマでバリデーション
- IDはホスト側で自動再生成（衝突防止）
- 座標は±100,000に制限
- 追加操作あたり最大10,000シェイプ
- メッセージサイズ上限10MB
- 宣言されていないケイパビリティへのメッセージは拒否

---

## エクステンションのアイデア

- **データインポート**: CSV/GeoJSON → drawtonomyシェイプ
- **エクスポート/分析**: シェイプ統計、レーン接続グラフの可視化
- **テンプレートライブラリ**: 交差点、駐車場などの定義済みパターン
- **AI生成**: 自然言語からシーンを生成（サンプル参照）
- **外部連携**: シミュレータとの双方向データ同期
