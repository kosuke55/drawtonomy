# @drawtonomy/sdk

drawtonomy エクステンション開発用SDK。

[English](README.md)

## インストール

```bash
npm install @drawtonomy/sdk
```

## クイックスタート

### 1. マニフェストを作成

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "description": "何をするエクステンションか",
  "author": { "name": "Your Name" },
  "entry": "./index.html",
  "capabilities": ["shapes:write", "shapes:read", "ui:panel"]
}
```

### 2. SDKを使ってエクステンションを実装

```typescript
import { ExtensionClient, createVehicle, createLaneWithBoundaries } from '@drawtonomy/sdk'

const client = new ExtensionClient('my-extension')

// ホストとの接続を待つ
const init = await client.waitForInit()
console.log('Connected! Capabilities:', init.grantedCapabilities)

// 車両を追加
client.addShapes([
  createVehicle(200, 300, { templateId: 'sedan', color: 'blue' })
])

// レーンを一括作成
const laneShapes = createLaneWithBoundaries(
  [{ x: 0, y: 0 }, { x: 500, y: 0 }],
  [{ x: 0, y: 70 }, { x: 500, y: 70 }]
)
client.addShapes(laneShapes)

// 既存シェイプを読み取り
const vehicles = await client.requestShapes({ types: ['vehicle'] })

// 通知を表示
client.notify('完了しました', 'success')
```

### 3. 開発サーバーで起動

```bash
npm run dev -- --port 3001
```

### 4. drawtonomyで読み込む

ブラウザで以下のURLにアクセス:

```
https://drawtonomy.com?ext=http://localhost:3001/manifest.json
```

## API

### ExtensionClient

| メソッド | 必要なCapability | 説明 |
|---------|-----------------|------|
| `waitForInit()` | - | ホストとの接続を待つ |
| `addShapes(shapes)` | `shapes:write` | シェイプを追加 |
| `updateShapes(updates)` | `shapes:write` | シェイプを更新 |
| `deleteShapes(ids)` | `shapes:write` | シェイプを削除 |
| `requestShapes(filter?)` | `shapes:read` | シェイプを読み取り |
| `requestSnapshot()` | `snapshot:read` | スナップショットを取得 |
| `requestViewport()` | `viewport:read` | ビューポート情報を取得 |
| `requestSelection()` | `selection:read` | 選択状態を取得 |
| `notify(message, level?)` | `ui:notify` | 通知を表示 |
| `resize(height, width?)` | `ui:panel` | パネルサイズを変更 |

### ファクトリ関数

| 関数 | 説明 |
|------|------|
| `createPoint(x, y, options?)` | ポイントを作成 |
| `createLinestring(x, y, pointIds, options?)` | ラインストリングを作成 |
| `createLane(x, y, leftId, rightId, options?)` | レーンを作成 |
| `createLaneWithBoundaries(leftPts, rightPts, options?)` | レーン+境界を一括作成 |
| `createVehicle(x, y, options?)` | 車両を作成 |
| `createPedestrian(x, y, options?)` | 歩行者を作成 |
| `createRectangle(x, y, w, h, options?)` | 矩形を作成 |
| `createEllipse(x, y, w, h, options?)` | 楕円を作成 |
| `createText(x, y, text, options?)` | テキストを作成 |
| `createSnapshot(shapes)` | スナップショットを作成 |

## デプロイ

エクステンションは任意のHTTPSホスティングサービスにデプロイできます。

### GitHub Pages

`manifest.json`のCORSヘッダーは自動付与されるため設定不要。

### Vercel

`vercel.json`:
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

`_headers`:
```
/manifest.json
  Access-Control-Allow-Origin: *
```

### ローカル開発

Vite devサーバーはデフォルトでCORS許可済み。`localhost`はHTTPでも動作します。

## ドキュメント

詳細は https://github.com/kosuke55/drawtonomy-app/blob/main/docs/extensions.md を参照。
