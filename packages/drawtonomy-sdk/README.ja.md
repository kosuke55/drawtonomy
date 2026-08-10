# @drawtonomy/sdk

drawtonomy エクステンション開発用SDK。

[English](README.md)

## インストール

```bash
pnpm add @drawtonomy/sdk
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
pnpm dev --port 3001
```

### 4. drawtonomyで読み込む

ブラウザで以下のURLにアクセス:

```
https://drawtonomy.com?ext=http://localhost:3001/manifest.json
```

## ヘッドレス利用 (Node.js)

ファクトリと exporter は純関数なので、ブラウザもエディタも不要です。
スクリプトでシーンを組み立てて ASAM 形式に出力できます
(`@drawtonomy/sdk` 0.17.0 以降が必要):

```js
// generate.mjs — 実行: node generate.mjs
import { createLaneWithBoundaries, createPathWithFootprints, createVehicle, createSnapshot, exporter } from '@drawtonomy/sdk'
import { writeFileSync } from 'node:fs'

// 500 px (= 30 m) の直線レーン。キャンバス単位は px、1 m = 16.67 px。
const lane = createLaneWithBoundaries(
  [{ x: 0, y: 0 }, { x: 500, y: 0 }],
  [{ x: 0, y: 50 }, { x: 500, y: 50 }],
)

// レーンに沿った走行パス。エクスポート時に時刻付き軌跡になる (既定 10 m/s の等速)。
const path = createPathWithFootprints(
  [{ x: 0, y: 25 }, { x: 250, y: 25 }, { x: 500, y: 25 }],
  { count: 5 },
)

const snapshot = createSnapshot([...lane, ...path, createVehicle(300, 120)])

writeFileSync('scene.xodr', exporter.exportToOpenDrive(snapshot, {}))   // OpenDRIVE 1.8
writeFileSync('scene.xosc', exporter.exportToOpenScenario(snapshot, {})) // OpenSCENARIO 1.3
writeFileSync('scene.osm', exporter.exportToLanelet2(snapshot, {}))     // Lanelet2
```

`.xosc` には時刻付き polyline の `FollowTrajectoryAction` が入るので、
上の `.xodr` と組み合わせれば esmini でそのまま再生できます。
生成した OpenDRIVE の読み戻しも可能です:

```js
const parsed = exporter.parseOpenDriveXml(xodrText)
const { lanes, linestrings, points } = exporter.odrToShapes(parsed)
```

この経路で出力される軌跡は等速です。トリガー・イベントロジック・速度
プロファイルは [drawtonomy エディタ](https://drawtonomy.com) の
シナリオモードで作成してください。

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
| `exportScene(format)` | `snapshot:export` | シーンをエクスポート（svg/png/jpeg/pdf/eps） |
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
| `createPathWithFootprints(points, options?)` | パス+フットプリントを一括作成 |
| `createSnapshot(shapes)` | スナップショットを作成 |

### 幾何計算関数

| 関数 | 説明 |
|------|------|
| `evaluatePathAt(points, t)` | パラメトリックt [0..1]での位置と接線を取得 |
| `snapToPath(points, query)` | 点をパス上の最近傍に投影 |
| `computeArcLengths(points)` | 累積弧長を計算 |
| `totalArcLength(points)` | パス全長を取得 |
| `uniformTValues(count)` | 等間隔のt値を生成 |
| `computeHeadings(points)` | 各点の進行方向角度を計算 |
| `interpolatePosition(p1, p2, t)` | 2点間の線形補間 |
| `getBoundingBox(points)` | バウンディングボックスを取得 |
| `distanceToSegment(point, a, b)` | 点からセグメントまでの距離 |

### Exporter モジュール

`DrawtonomySnapshot` を OpenDRIVE / OpenSCENARIO / Lanelet2 OSM 形式の文字列に変換します。エディタランタイムに依存しないため、ヘッドレスツール、サーバーサイドパイプライン、ブラウザ拡張等から利用可能です。Lanelet2 については OSM XML をエディタが扱える形式（point / linestring / lane）に戻すパーサも提供し、ラウンドトリップを実現します。

```typescript
import { exporter, createSnapshot } from '@drawtonomy/sdk'

const snapshot = createSnapshot(myShapes)
const xodr = exporter.exportToOpenDrive(snapshot)
const xosc = exporter.exportToOpenScenario(snapshot, { xodrFilename: 'scene.xodr' })

// .xodr + .xosc を 1 つの zip にまとめて esmini で実行可能に
const { blob, baseName } = exporter.buildEsminiZip(snapshot, { baseName: 'my-scene' })

// Lanelet2 (.osm XML) のエクスポート + 再インポート
const osm = exporter.exportToLanelet2(snapshot, { mapOrigin: { lat: 35.0, lon: 139.0 } })
const data = exporter.parseOsmXml(osm)
const imported = exporter.osmToShapes(data)
```

| 関数 | 説明 |
|------|------|
| `exporter.exportToOpenDrive(snapshot)` | OpenDRIVE 1.8 (.xodr) XML |
| `exporter.exportToOpenScenario(snapshot, options?)` | OpenSCENARIO 1.3 (.xosc) XML |
| `exporter.buildEsminiZip(snapshot, options?)` | .xodr + .xosc を 1 つの zip にまとめる |
| `exporter.exportToLanelet2(snapshot, options?)` | Lanelet2 (.osm XML) ドキュメント |
| `exporter.parseOsmXml(xml)` | Lanelet2 OSM XML を構造化データへパース |
| `exporter.osmToShapes(data, options?)` | OSM → エディタが使う point / linestring / lane レコード |
| `exporter.alignBoundaries(left, right)` | レーンの左右境界の反転フラグを判定 |
| `exporter.createShapeIdAllocator()` | `osmToShapes` で使用する ID アロケータ |
| `exporter.latLonToCanvas(lat, lon, ...)` / `canvasToLatLon(...)` | 等距円筒投影ヘルパ |
| `exporter.buildPathTrajectory(input)` | Path → 時刻付き頂点列 |
| `exporter.computeCenterlineWithWidth(left, right)` | レーン中心線 + 幅サンプル |
| `exporter.buildZip(entries)` | 純粋な ZIP ビルダー (store mode、依存なし) |
| `exporter.sanitizeFileBaseName(input)` | OS-safe なベース名サニタイザ |

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

詳細は https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.md を参照。
