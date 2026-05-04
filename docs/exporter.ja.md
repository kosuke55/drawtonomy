# drawtonomy Exporter

<p align="center">
  <img src="https://github.com/user-attachments/assets/4185a3c7-7662-4d01-a3b2-73e17897c27a" width="80%" />
</p>

[English](exporter.md)

`@drawtonomy/sdk` の `exporter` サブモジュールは、`DrawtonomySnapshot` を
ASAM 仕様のファイル (OpenDRIVE 1.8 / OpenSCENARIO 1.3)、esmini 用の zip
バンドル、Lanelet2 (.osm XML) マップに変換します。エディタランタイムへの
依存はゼロなので、ヘッドレスツール、サーバーサイドパイプライン、
ブラウザ拡張、CI チェックなどからそのまま呼べます。Lanelet2 については
OSM XML をエディタが扱える形式（point / linestring / lane）に戻すパーサも
提供し、インポート / ラウンドトリップワークフローを実現します。

新しいシェイプ対応、アニメーション仕様の拡張、別フォーマットアダプタ
(CARLA / Unity / SUMO 等) を追加する際の主要な拡張ポイントです。

## 目次

- [Quick Start (ユーザー向け)](#quick-start-ユーザー向け)
- [Quick Start (開発者向け)](#quick-start-開発者向け)
- [ローカル開発](#ローカル開発)
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

// Lanelet2 (.osm XML) のエクスポート + 再インポート
const osm = exporter.exportToLanelet2(snapshot, {
  mapOrigin: { lat: 35.0, lon: 139.0 },
})
const data = exporter.parseOsmXml(osm)
const imported = exporter.osmToShapes(data)
```

Exporter は純関数群です (同じ入力なら必ず同じ出力、エディタや DOM へのアクセスなし)。

---

## ローカル開発

このセクションは **exporter 自体に手を入れる** コントリビューター向けです。

開発スタイルは大きく 2 通りあります。組み合わせて使います。

1. **スナップショット駆動** — snapshot のフィクスチャをコードで作って vitest を回し、
   出力 XML をアサートする。ブラウザを起動しないので速い。新しいロジックの実装に最適。
2. **esmini での目視確認** — 生成した `.xodr` / `.xosc` を esmini に食わせ、
   3D 再生が期待通りかを確認する。遅いが、純粋な XML アサートでは捕まえられない
   問題 (描画の崩れ、再生タイミング等) を捕まえられる。

通常は (1) で実装を固め、PR を出す前にフィクスチャを (2) で通します。

### セットアップ

```bash
git clone https://github.com/kosuke55/drawtonomy.git
cd drawtonomy
pnpm install   # workspace 全体をインストール
```

Exporter のソース: `packages/drawtonomy-sdk/src/exporter/`
テスト: `packages/drawtonomy-sdk/__tests__/exporter/`

### スナップショット駆動の開発 (高速ループ)

Exporter は `DrawtonomySnapshot` を入力に取る純関数なので、vitest 単体で
完結して挙動を確認できます (エディタもブラウザも esmini も不要)。
「コードで snapshot を組み立て、exporter を呼び、出力 XML をアサート」だけで開発できます。

```bash
cd packages/drawtonomy-sdk

pnpm test                       # 1 回だけ実行
pnpm exec vitest                # watch モード (保存ごとに再実行)
pnpm exec vitest exporter       # exporter テストファイルだけ
pnpm build                      # tsc で型チェック (commit 前推奨)
```

#### snapshot を用意する 3 つの方法

リアル度が低い順に 3 通りあります。

**(1) 手書きの最小フィクスチャ**。特定のコードパスを狙うユニットテストに最適。
`__tests__/exporter/` 配下の既存テストには `point` / `linestring` / `lane`
を作る小さなヘルパが用意されているので、コピペで始められます。

```typescript
// __tests__/exporter/my-feature.test.ts
import { describe, it, expect } from 'vitest'
import { exportToOpenDrive } from '../../src/exporter/opendrive'
import type { DrawtonomySnapshot } from '../../src/types'

function snapshot(shapes: any[]): DrawtonomySnapshot {
  return { version: '1.1', timestamp: new Date().toISOString(), shapes }
}

describe('my new feature', () => {
  it('emits something specific', () => {
    const xml = exportToOpenDrive(snapshot([
      // 自分のコードパスをトリガする最小のシーン
    ]))
    expect(xml).toContain('<expected-element>')
  })
})
```

**(2) SDK ヘルパで組み立てる**。プロパティを 1 つずつ書きたくないけれど
リアルなシェイプが欲しい時。`createPoint` / `createLinestring` /
`createLane` / `createLaneWithBoundaries` / `createVehicle` /
`createPathWithFootprints` / `createSnapshot` を組み合わせます。

```typescript
import {
  createLaneWithBoundaries,
  createVehicle,
  createSnapshot,
} from '@drawtonomy/sdk'

const shapes = [
  ...createLaneWithBoundaries(
    [{ x: 0, y: -5 }, { x: 100, y: -5 }],
    [{ x: 0, y: 5 }, { x: 100, y: 5 }]
  ),
  createVehicle(50, 0, { templateId: 'sedan' }),
]
const snapshot = createSnapshot(shapes)
```

**(3) drawtonomy で描いた実シーンを再利用する**。
[drawtonomy.com](https://drawtonomy.com) でシーンを描き、
**メニュー → Export → drawtonomy.svg** でダウンロード。
このファイルは snapshot を埋め込んだ通常の SVG なので、`parseDrawtonomySvg`
で `DrawtonomySnapshot` に戻せます。

```typescript
import { readFileSync } from 'node:fs'
import { parseDrawtonomySvg } from '@drawtonomy/sdk'

const svg = readFileSync('./fixtures/my-scene.drawtonomy.svg', 'utf-8')
const snapshot = parseDrawtonomySvg(svg)
if (!snapshot) throw new Error('not a drawtonomy.svg file')
```

`.drawtonomy.svg` で保存した fixture は「この実シーンを入れたらこの XML が
出てほしい」という回帰テストの入力に向いています。

#### 反復のヒント

- 開発中は `console.log(xml)` で全文を確認しながら回し、出力が安定したら
  特定の行だけアサートする形に絞り込む。
- 大きな XML 差分を扱うなら `expect(xml).toMatchInlineSnapshot()` も便利。
- フィクスチャは小さく保つ。点 3 個 + lane 1 個でだいたい足りる。

### esmini で出力を検証する

vitest は挙動の回帰を捉えますが、esmini が実際にどう描画するかまでは
教えてくれません。snapshot テストが通ったら、生成 XML を esmini に
直接食わせて目視確認します。

ブラウザは不要です。snapshot フィクスチャから `.xodr` / `.xosc` を吐く
小さなスクリプトを書き、それを esmini に渡すだけです。

#### 1. esmini をインストール

```bash
# macOS
brew install esmini

# Linux / Windows: https://github.com/esmini/esmini を参照
```

#### 2. snapshot から bundle を生成

drawtonomy.com からエクスポートした `.drawtonomy.svg` を起点にするのが一番簡単です
([snapshot を用意する 3 つの方法](#snapshot-を用意する-3-つの方法) 参照)。
手書きフィクスチャやヘルパで組み立てた snapshot でも同じスクリプトが使えます。

```typescript
// scripts/preview.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { parseDrawtonomySvg, exporter } from '@drawtonomy/sdk'

// オプション A: drawtonomy.com からの実シーン
const svg = readFileSync('./fixtures/my-scene.drawtonomy.svg', 'utf-8')
const snapshot = parseDrawtonomySvg(svg)
if (!snapshot) throw new Error('not a drawtonomy.svg file')

// オプション B: コードで組み立てた snapshot (使う場合はコメント解除)
// import { createLaneWithBoundaries, createVehicle, createSnapshot } from '@drawtonomy/sdk'
// const snapshot = createSnapshot([
//   ...createLaneWithBoundaries([{x:0,y:-5},{x:100,y:-5}], [{x:0,y:5},{x:100,y:5}]),
//   createVehicle(50, 0, { templateId: 'sedan' }),
// ])

mkdirSync('out', { recursive: true })
writeFileSync('out/scene.xodr', exporter.exportToOpenDrive(snapshot))
writeFileSync('out/scene.xosc', exporter.exportToOpenScenario(snapshot, {
  xodrFilename: 'scene.xodr',
}))
console.log('wrote out/scene.{xodr,xosc}')
```

SDK を `pnpm build` した後にスクリプトを実行:

```bash
cd packages/drawtonomy-sdk && pnpm build
node scripts/preview.mjs
```

#### 3. esmini で開く

```bash
esmini --osc out/scene.xosc --window 60 60 1024 768
```

確認ポイント:

- レーン形状がフィクスチャの意図通りか
- 車両が想定の位置・向きで spawn しているか
- trajectory がある場合、車両が想定のタイミングで path に沿って動くか
- XML をテキストエディタで開いてもよい。exporter が出すコメントが手がかりになる

esmini がパースエラーを出した場合、行番号と列を控えて生成 XML の該当箇所を
grep するのが最短です。多くは属性の過不足程度で、vitest 側で再現して直せます。

#### キャンバスからの完全な通し確認

「キャンバス → snapshot → exporter → esmini」の流れを丸ごと検証したい
場合は、公開済みの drawtonomy (`https://drawtonomy.com`) を使ってください。
シーンを描いて **Export for esmini** を実行し、上記の手順で esmini に
食わせます。drawtonomy.com に組み込まれている `@drawtonomy/sdk` は
公開済みの最新リリースなので、この通し確認は **PR がマージされて SDK が
再公開された後** に行うのが一番素直です。

リリースを待たずに **ローカル SDK のままキャンバス越しに検証したい** 場合は、
リポジトリ同梱の
[`extensions/exporter-playground`](../extensions/exporter-playground/)
を使ってください。iframe Extension として読み込まれ、`requestSnapshot()`
で取得した snapshot に対してローカル SDK の `exporter.exportTo*` を呼び、
ブラウザにダウンロードします。

ローカルサーバを 2 つ並走させる構成です: ひとつは drawtonomy のキャンバスを
ホスト、もうひとつは Extension をホスト。HTTPS ページからの HTTP リクエスト
(また最近のブラウザでは `*.com` から `localhost` への通信も) はブロック
されるので、[`@drawtonomy/dev-server`][dev-server] でキャンバスをローカルに
HTTP で配信して、両側を `http://localhost:*` に揃えます。

[dev-server]: https://www.npmjs.com/package/@drawtonomy/dev-server

**ターミナル 1 — ローカル canvas を起動:**

```bash
pnpm dlx @drawtonomy/dev-server
# → http://localhost:3000/
```

`@drawtonomy/dev-server` は公開済みの `drawtonomy.com` ビルドをキャッシュ
ディレクトリに取得して配信します。他のリポジトリやログインは不要です。

**ターミナル 2 — Extension を起動:**

```bash
cd extensions/exporter-playground
pnpm install --ignore-workspace   # 初回のみ
pnpm dev                          # → http://localhost:3003/
```

これで `http://localhost:3003/manifest.json` がアクセス可能になります。

**Extension を読み込んだ canvas を開く:**

ブラウザで以下を開きます。

```
http://localhost:3000/?ext=http://localhost:3003/manifest.json
```

サイドパネルに Exporter Playground が表示されます。シーンを描き、必要なら
**Refresh snapshot** を押して、**Export** ボタンを押すとローカル SDK で
生成された `.xodr` / `.xosc` / `.zip` がブラウザにダウンロードされます。

SDK のソースを変更したら再ビルドして、ブラウザのキャンバスタブをリロード
してください。

```bash
cd packages/drawtonomy-sdk && pnpm build
# ブラウザでリロード
```

> **`https://drawtonomy.com/?ext=http://localhost:3003/...` ではなぜダメか?**
> HTTPS のページが `localhost` の HTTP iframe manifest を読み込むのは Mixed
> Content / Private Network Access のルールでブロックされます。
> dev-server を使えば両側が plain HTTP に揃うので回避できます。
> Extension を HTTPS ホストにデプロイ済みなら、
> `https://drawtonomy.com/?ext=https://your-host/manifest.json` の形は
> 動作しますが、それは公開済みの canvas に組み込まれた SDK バージョンを
> 使う形なので、ローカル SDK の変更は反映されません。

### テストの書き方

挙動を変える PR にはテストを必ず付けてください。慣例:

- ソースとテストは 1 対 1: `opendrive.ts` ↔ `opendrive.test.ts`
- フィクスチャはコード上で plain object として組む。実エディタの snapshot を
  そのまま貼ると、UI 側の変更で壊れやすいので避ける。
- 全文比較ではなく狭いアサーション (`expect(xml).toContain(...)`) を優先。
  emit のフォーマット微調整で壊れにくくなる。
- 数値出力は `toBeCloseTo` で浮動小数の誤差を許容する。

`@drawtonomy/sdk` の CI は `pnpm build` と `pnpm test` を実行します。
PR では両方が通っている必要があります。

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
├── lanelet2.ts         Snapshot → Lanelet2 .osm XML (sidecar によるラウンドトリップ対応)
├── osmParser.ts        Lanelet2 .osm XML → 構造化データ + 緯度経度 ↔ canvas 投影
├── osmToShapes.ts      OSM データ → エディタが扱う point / linestring / lane レコード
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

### `exportToLanelet2(snapshot, options?)`

```typescript
interface OsmSidecar {
  rawXml: string         // インポート時に保存した元の .osm XML
  originLat: number
  originLon: number
}

interface MapOrigin {
  lat: number | null
  lon: number | null
}

interface Lanelet2ExportOptions {
  sidecar?: OsmSidecar | null
  mapOrigin?: MapOrigin | null
}

function exportToLanelet2(
  snapshot: DrawtonomySnapshot,
  options?: Lanelet2ExportOptions
): string
```

Lanelet2 `.osm` XML 文字列を返します。各 `PointShape` は `<node>`、各
`LinestringShape` は `<way>`、各 `LaneShape` は `<relation type="lanelet">`
として `<member role="left">` / `<member role="right">` で境界の way を参照
する形で出力されます。

`sidecar` (インポート時に保存した元の `.osm` XML) を渡すと、shape 由来でない
要素 (regulatory_element、ele タグ、未編集 relation 等) が原文のまま保持され、
shape 由来の要素は同じ OSM ID については上書きされます。ルートの `<osm>`
要素には `drawtonomy_origin_lat` / `drawtonomy_origin_lon` が埋め込まれる
ため、再インポート時に同じ canvas 原点が復元されます (標準の OSM
コンシューマは未知の属性を無視します)。

原点の優先順位: `sidecar` > `mapOrigin` > 組み込みのデフォルト。

### `parseOsmXml(xml)`

```typescript
interface OsmData {
  nodes: Map<string, OsmNode>
  ways: Map<string, OsmWay>
  relations: OsmRelation[]
  drawtonomyOrigin?: { lat: number; lon: number }
}

function parseOsmXml(xmlString: string): OsmData
```

Lanelet2 `.osm` XML を構造化データへパースします。`DOMParser` がグローバルに
存在する環境 (ブラウザ・jsdom) ではそれを使い、無い環境では OSM XML の
サブセットに対応した手書き正規表現パーサにフォールバックするため、`jsdom`
無しの素の Node でも動きます。lanelet 以外の relation (regulatory_element、
multipolygon 等) もそのまま保持され、ラウンドトリップで失われません。

### `osmToShapes(data, options?)`

```typescript
interface OsmToShapesOptions {
  idAllocator?: ShapeIdAllocator
  selectedLaneIds?: readonly string[]
}

function osmToShapes(data: OsmData, options?: OsmToShapesOptions): ImportedShapes
```

パース済み OSM データをエディタが扱う形式に変換します: 共有された point、
境界 linestring、lane、それに bounding box と投影に使った地理原点を返します。
レーンの方向は可能な限り維持され、左右関係 (right-of-left invariant) を満たす
ためにのみ境界が反転されます。lane の前後接続 (`next` / `prev`) は境界の
端点一致から検出されます。

`selectedLaneIds` を渡すと指定した lanelet relation のみインポートされます。
`createShapeIdAllocator` で作った独自の `idAllocator` を渡すことで、ホスト
エディタ側のカウンタと ID を整合させられます。

### `latLonToCanvas(lat, lon, centerLat, centerLon, scale?)` / `canvasToLatLon(...)`

エクスポーターとインポーターの両方で使う等距円筒投影ヘルパ。デフォルトの
`scale = 1_855_000` は 16.67 px/m に相当し、drawtonomy の見た目の寸法
(3 m レーン = 50 px) と一致します。

### `parseDrawtonomySvg(svg)` *(SDK ルート、`exporter` サブモジュールではない)*

```typescript
function parseDrawtonomySvg(svgContent: string): DrawtonomySnapshot | null
```

`.drawtonomy.svg` のソース文字列を読み、埋め込まれた `DrawtonomySnapshot`
を返します。snapshot を含まない通常の SVG、壊れたペイロード、文字列でない
入力に対しては `null` を返します。`data-drawtonomy-snapshot` (現行) と
`data-drawauto-snapshot` (旧形式) の両方を受け付けます。`DOMParser` /
`jsdom` を使わない実装なので、純 Node でも動きます。

```typescript
import { parseDrawtonomySvg } from '@drawtonomy/sdk'

const snapshot = parseDrawtonomySvg(readFileSync('scene.drawtonomy.svg', 'utf-8'))
```

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
