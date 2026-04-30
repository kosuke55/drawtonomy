# drawtonomy Exporter

[English](exporter.md)

`@drawtonomy/sdk` の `exporter` サブモジュールは、`DrawtonomySnapshot` を
ASAM 仕様のファイル (OpenDRIVE 1.8 / OpenSCENARIO 1.3) や esmini 用の zip
バンドルに変換します。エディタランタイムへの依存はゼロなので、ヘッドレス
ツール、サーバーサイドパイプライン、ブラウザ拡張、CI チェックなどから
そのまま呼べます。

新しいシェイプ対応、アニメーション仕様の拡張、別フォーマットアダプタ
(CARLA / Unity / SUMO 等) を追加する際の主要な拡張ポイントです。

## 目次

- [Quick Start (ユーザー向け)](#quick-start-ユーザー向け)
- [Quick Start (開発者向け)](#quick-start-開発者向け)
- [アーキテクチャ](#アーキテクチャ)
- [API リファレンス](#api-リファレンス)
- [Exporter を拡張する](#exporter-を拡張する)
- [ロードマップ](#ロードマップ)

---

## Quick Start (ユーザー向け)

1. drawtonomy でシーンを描画する (レーン、車両、信号機等)。
2. メニュー → **Export** → **Export for esmini** をクリック。
3. プロンプトでファイル名を入力する。
4. `<name>.zip` がダウンロードされる (中身は `<name>.xodr` と `<name>.xosc`)。
5. 解凍して esmini で開く:

   ```bash
   unzip <name>.zip
   esmini --osc <name>/<name>.xosc --window 60 60 1024 768
   ```

---

## Quick Start (開発者向け)

```bash
pnpm add @drawtonomy/sdk
```

```typescript
import { exporter, createSnapshot } from '@drawtonomy/sdk'

// shapes は BaseShape の配列 (後述「Snapshot の形」参照)。
const snapshot = createSnapshot(shapes)

// フォーマットごとの文字列を取得
const xodr = exporter.exportToOpenDrive(snapshot)
const xosc = exporter.exportToOpenScenario(snapshot, {
  xodrFilename: 'scene.xodr',
})

// 便利関数: 両方をまとめて esmini 用の zip にする
const { blob, baseName } = exporter.buildEsminiZip(snapshot, {
  baseName: 'my-scene',
})
```

Exporter は純関数群です (同じ入力なら必ず同じ出力、エディタや DOM へのアクセスなし)。

---

## アーキテクチャ

### Snapshot の形

```typescript
interface DrawtonomySnapshot {
  version: string
  timestamp: string
  shapes: BaseShape[]   // points, linestrings, lanes, vehicles, …
  camera?: { x: number; y: number; z: number }
}
```

Exporter は `shapes` だけを読みます。各シェイプは `id` / `type` / `x` /
`y` / `rotation` / `props` を持つ自己完結したオブジェクトで、レーンの
ジオメトリは id 参照 (lane → 2 本の境界 linestring → points) で構築されます。
Exporter 内部では id ルックアップ用 Map を作って解決しています。

### モジュール構成

```
@drawtonomy/sdk/exporter/
├── opendrive.ts        Lane / TrafficLight / Crosswalk / Polygon → .xodr
├── openscenario.ts     Vehicle / Pedestrian / Path → .xosc
├── trajectory.ts       Path → 時系列頂点列
├── laneCenterline.ts   2 本の境界ポリライン → 中心線 + 幅サンプル
├── packageEsmini.ts    .xodr + .xosc → 1 つの .zip
├── zip.ts              純 ZIP ビルダー (store mode、依存ゼロ)
├── sanitize.ts         OS セーフなファイル名サニタイズ
└── units.ts            canvas px ↔ ENU m、XML 整形ヘルパ
```

### 座標系の規約

| 軸 | drawtonomy キャンバス | OpenDRIVE / OpenSCENARIO (ENU) |
|---|---|---|
| x | 右 + | 東 + |
| y | **下 +** | **上 +** (符号反転) |
| heading | CW 正 (degree) | CCW 正 (radian) |
| 長さ単位 | ピクセル | メートル (`PIXELS_PER_METER = 16.67`) |

車両テンプレートはキャンバス上で前面が −Y (画面上方向) を向く規約のため、
`rotation = 0` は ENU では heading `π/2` (北) に対応します。このオフセットは
`exportToOpenScenario` 内で適用されます。

---

## API リファレンス

### `exportToOpenDrive(snapshot)`

```typescript
function exportToOpenDrive(snapshot: DrawtonomySnapshot): string
```

OpenDRIVE 1.8 の XML 文字列を返します。`LaneShape` は `<road>`、
`TrafficLightShape` は `<signal>`、`CrosswalkShape` と `PolygonShape` は
`<object>` として出力されます。レーン接続 (`next` / `prev`) は road レベルと
lane レベルの `<link>` 要素として書かれます。junction はまだ未対応です
(後述 [ロードマップ](#ロードマップ))。

### `exportToOpenScenario(snapshot, options?)`

```typescript
interface OpenScenarioExportOptions {
  xodrFilename?: string          // <LogicFile> から参照される
  scenarioName?: string
  templateResolver?: TemplateResolver
}

function exportToOpenScenario(
  snapshot: DrawtonomySnapshot,
  options?: OpenScenarioExportOptions
): string
```

`VehicleShape` は `templateId` から解決した category で `<ScenarioObject>`
になります。歩行者テンプレートは `<Vehicle>` ではなく `<Pedestrian>` を
出力します。footprint を持つ Path linestring は先頭 footprint の車両を
アクターとする `<FollowTrajectoryAction>` ストーリーになります。

### `buildEsminiZip(snapshot, options?)`

```typescript
interface EsminiPackageOptions {
  baseName?: string
  templateResolver?: TemplateResolver
}

interface EsminiPackageResult {
  blob: Blob
  baseName: string
}

function buildEsminiZip(
  snapshot: DrawtonomySnapshot,
  options?: EsminiPackageOptions
): EsminiPackageResult
```

両 exporter を呼び、結果を `<baseName>.zip` (中身は
`<baseName>/<baseName>.xodr` と `<baseName>/<baseName>.xosc`) として
パッケージします。ファイル名を統一しているので xosc 内の `<LogicFile>`
参照がリネームなしに解決されます。

### `buildPathTrajectory(input)`

```typescript
interface PathTrajectoryInput {
  points: { x: number; y: number }[]
  tValues?: number[]                  // 事前計算済みの正規化位置
  interval?: number                   // サンプル間 px
  offset?: number                     // 開始からのオフセット px
  speedMps?: number                   // デフォルト 10
}

interface PathSamplePoint {
  x: number       // ENU m
  y: number       // ENU m
  heading: number // ENU rad
  time: number    // s
}

function buildPathTrajectory(input: PathTrajectoryInput): PathSamplePoint[]
```

Polyline path を `<FollowTrajectoryAction>` 用の時系列頂点列に変換します。
3 つのモード: `tValues` (事前計算)、`interval` (等弧長)、フォールバック
(等速で制御点を辿る)。

### `computeCenterlineWithWidth(left, right, numSamples?)`

両境界ポリラインを同じ正規化弧長パラメータでサンプルし、サンプルごとの
中点 + 幅を返します。OpenDRIVE exporter のリファレンスライン生成と
`<width>` エントリ生成に使われます。

### `buildZip(entries)`

```typescript
interface ZipEntry { path: string; data: string | Uint8Array }
function buildZip(entries: ZipEntry[]): Blob
```

PKZIP 互換の純 ZIP ビルダー (store mode、無圧縮)。依存ゼロでブラウザ・
Node どちらでも動作します。

### `sanitizeFileBaseName(input)`

OS セーフなベース名 (path separator / 制御文字 → アンダースコア、
最大 100 文字) を返します。空になる入力に対しては `null` を返します。

---

## Exporter を拡張する

Exporter は「公開済み snapshot 形式」のみに依存しているため、新しい
シェイプ・アニメーション機能・新フォーマットの追加は
`packages/drawtonomy-sdk/src/exporter/` 配下の変更だけで完結します。

### 新しいシェイプ対応を追加する

例: `TrafficSignShape` を OpenDRIVE `<signal>` として出力する。

1. シェイプの props が公開 SDK 型定義
   (`packages/drawtonomy-sdk/src/types.ts`) に含まれていることを確認。
   不足があれば拡張する。
2. `opendrive.ts` のメイン走査ループに分岐を追加する:

   ```typescript
   for (const s of shapes) {
     // …既存の分岐…
     else if (s.type === 'traffic_sign') trafficSigns.push(s as TrafficSignShape)
   }
   ```
3. `projectToRoad` (既存ヘルパ) で最近傍 road に投影し、`<signal>` を出力。
4. `packages/drawtonomy-sdk/__tests__/exporter/` にユニットテストを追加。

OpenSCENARIO 側も同じ要領で `openscenario.ts` の `collectEntities` /
`emitVehicleEntity` に分岐を追加します。

### 新しいターゲットフォーマットを追加する

例: CARLA 拡張 OpenDRIVE を出力する `carla.ts` アダプタ。

1. `packages/drawtonomy-sdk/src/exporter/carla.ts` を作成。
2. `DrawtonomySnapshot` を入力に取り、必要に応じて `laneCenterline.ts` /
   `units.ts` を再利用。
3. `packages/drawtonomy-sdk/src/exporter/index.ts` から再エクスポート。
4. フォーマット固有の差分をカバーするテストを追加。

既存 exporter は意図的に共通インターフェースを持っていません。フォーマット
ごとの癖が大きく、早期抽象化より重複を許容する方針です。3 つ以上の
アダプタが揃った段階で統一インターフェースを再検討します。

### TemplateResolver フック

`exportToOpenScenario` は `templateResolver` オプションを受け取ります。
SDK にバンドルされていないテンプレートをホスト側が知っている場合に使えます:

```typescript
const resolver = {
  resolveTemplateId: (id) => myLegacyMap[id] ?? id,
  isPedestrianTemplate: (id) => /pedestrian|walk/.test(id),
}
exporter.exportToOpenScenario(snapshot, { templateResolver: resolver })
```

省略時は drawtonomy にバンドルされているテンプレートを前提とした
デフォルト挙動になります。

### 座標 / heading ユーティリティ

`units.ts` のヘルパを再利用してください。

```typescript
import { pxToMeter, pxToEnuX, pxToEnuY, fmt, escapeXml } from './units'
```

px ↔ m 変換係数と y 軸反転を全 exporter で一貫させるための共通モジュールです。

---

## ロードマップ

以下は将来コントリビュートが期待される項目です。いずれも
`packages/drawtonomy-sdk/src/exporter/` 配下の変更のみで完結します。

### シェイプ対応

- `TrafficSign` → OpenDRIVE `<signal>` (stop / yield / 速度制限等)
- `Others` (例: 建物) → OpenDRIVE `<object type="building">`
- 自転車テンプレート → `<Vehicle vehicleCategory="bicycle">`

### レーン接続

- junction (`<junction>`) 出力。3 本以上のレーンが端点を共有する場合の
  分岐情報。`LaneShape` は既に `next` / `prev` を持っているので、
  そのデータから判定できる。

### アニメーション機能

- 加速度プロファイル → `<SpeedActionDynamics>`
- 停止 / dwell イベント → `<StandStillCondition>`
- 信号連動の path → `<TrafficSignalCondition>`
- 車線変更 → `<LaneChangeAction>`
- 複数アクターの協調 → より複雑な `<Storyboard>` 構造

### 別フォーマット

- `carla.ts` — CARLA 拡張 OpenDRIVE、CARLA YAML シナリオ
- `unity-prefab.ts` — Unity prefab エクスポート
- `sumo.ts` — SUMO ロードネットワーク + trip 定義

### esmini 運用ノウハウ

esmini v3.0.x 向けの実装ノウハウ (crosswalk heading の規約、
`scaleMode=ModelToBB`、polygon の色指定制限等) は現状 exporter ソース内の
インラインコメントに散らばっています。本ドキュメント内の専用セクションに
集約する PR は歓迎です。

---

非自明なコントリビューションを計画している場合は、実装前に issue を立てて
設計を相談するのを推奨します。
