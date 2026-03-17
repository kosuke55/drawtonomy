# AI Scene Generator

自然言語の説明からAI（Anthropic Claude / OpenAI GPT）を使って交通シーンを自動生成するdrawtonomyエクステンション。

[English version](README.md)

---

## ユーザーガイド

### セットアップ

このリポジトリから実行する場合、まずSDKをビルドしてください:

```bash
cd packages/drawtonomy-sdk
npm install
npm run build
```

次にサンプルエクステンションを起動:

```bash
cd examples/ai-scene-generator
npm install
npm run dev
```

別のターミナルでdrawtonomy dev serverを起動:

```bash
drawtonomy-dev-server
```

ブラウザで以下にアクセス:
```
http://localhost:3000/?ext=http://localhost:3001/manifest.json
```

### 使い方

1. **Provider選択** — Claude（Anthropic）または GPT（OpenAI）を選択
2. **Model選択** — 使用するモデルを選択
   - Claude: Opus 4（高性能）/ Sonnet 4（バランス）/ Haiku 4（高速・低コスト）
   - GPT: o3-mini（高性能）/ GPT-4o（バランス）/ GPT-4o mini（高速・低コスト）
3. **API Key入力** — 選択したProviderのAPIキーを入力
4. **Scene Description** — 生成したいシーンを説明（英語推奨）
5. **Generate Scene** — クリックでシーンを生成。キャンバスにシェイプが描画される

### プロンプト例

```
A two-lane road with two cars and a pedestrian crossing
```
```
An intersection with four lanes, traffic lights, and a bus turning right
```
```
A parking lot with 5 cars and a pedestrian walking
```

### 注意事項

- APIキーはブラウザのlocalStorageに保存される（sandboxed iframeでは保存されない）
- 既存のキャンバスにシェイプがある場合、コンテキストとしてAIに渡される
- 生成されたシェイプはUndoで取り消し可能

---

## 開発者ガイド

### アーキテクチャ

```
┌─────────────────────────────────────────────────────┐
│ drawtonomy Host (drawtonomy.com)                    │
│                                                     │
│   ExtensionManager                                  │
│     ↕ postMessage                                   │
│   ┌───────────────────────────────────────────────┐ │
│   │ <iframe sandbox="allow-scripts">              │ │
│   │                                               │ │
│   │   AI Scene Generator Extension                │ │
│   │                                               │ │
│   │   ┌──────────────┐   ┌───────────────────┐   │ │
│   │   │ SceneGenerator│   │ ExtensionClient   │   │ │
│   │   │ UI (React)   │   │ (@drawtonomy/sdk) │   │ │
│   │   └──────┬───────┘   └────────┬──────────┘   │ │
│   │          │                     │              │ │
│   │          ▼                     │              │ │
│   │   ┌──────────────┐            │              │ │
│   │   │ sceneGenerator│            │              │ │
│   │   │ .ts           │            │              │ │
│   │   │               │            │              │ │
│   │   │  AI API Call  │            │              │ │
│   │   │  (fetch)      │            │              │ │
│   │   └──────┬───────┘            │              │ │
│   │          │ shapes[]            │              │ │
│   │          └─────────────────────┘              │ │
│   │                   addShapes(shapes)           │ │
│   └───────────────────────────────────────────────┘ │
│                                                     │
│   → loadSnapshot() → キャンバスに描画               │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│ AI API           │
│ (Anthropic/OpenAI)│
└─────────────────┘
```

### 処理フロー

1. **初期化**: `ExtensionClient`が`ext:ready`を送信 → ホストから`ext:init`を受信
2. **コンテキスト収集**: `requestShapes()`で既存シェイプ、`requestViewport()`でビューポートを取得
3. **AI呼び出し**: シーン説明 + コンテキストをシステムプロンプトと共にAI APIに送信
4. **レスポンス解析**: AIが返すJSON配列をパースし、BaseShape[]に変換
5. **キャンバス反映**: `addShapes()`でホストに送信 → ホスト側でZod検証・ID再生成・依存順ソート → `loadSnapshot()`で描画

### ファイル構成

| ファイル | 役割 |
|---------|------|
| `manifest.json` | エクステンション定義（ID, capabilities等） |
| `package.json` | 依存関係（`@drawtonomy/sdk`, React, Vite） |
| `vite.config.ts` | Vite設定（`server.cors: true`でsandboxed iframe対応） |
| `src/main.tsx` | Reactエントリーポイント |
| `src/SceneGeneratorUI.tsx` | UIコンポーネント（Provider/Model/Key/Prompt/Generate） |
| `src/sceneGenerator.ts` | AI API呼び出し・レスポンスパース |
| `src/ExtensionClient.ts` | `@drawtonomy/sdk`のre-export |
| `src/types.ts` | `@drawtonomy/sdk`の型re-export |

### drawtonomyとのインターフェース

#### 使用しているCapability

| Capability | 用途 |
|-----------|------|
| `shapes:write` | 生成したシェイプをキャンバスに追加 |
| `shapes:read` | 既存シェイプをコンテキストとしてAIに渡す |
| `viewport:read` | ビューポートサイズをAIに渡す（配置の参考） |
| `ui:panel` | サイドパネルにUIを表示 |
| `ui:notify` | 生成完了/エラーのトースト通知 |

#### drawtonomyへの入力（shapes:write）

AIが生成するシェイプのJSON配列。以下の形式:

```typescript
interface Shape {
  id: string          // 一意のID（ホスト側で再生成される）
  type: string        // point, linestring, lane, vehicle, pedestrian等
  x: number           // X座標
  y: number           // Y座標
  rotation: number    // 回転（ラジアン）
  zIndex: number      // Z順序
  props: {            // シェイプ固有のプロパティ
    // type毎に異なる
  }
}
```

依存関係のあるシェイプ（`point → linestring → lane`）は同一バッチに含めれば、ホスト側が自動的に依存順にソートして作成する。

#### drawtonomyからの読み取り（shapes:read, viewport:read）

```typescript
// 既存シェイプの読み取り
const shapes = await client.requestShapes({ types: ['lane', 'vehicle', 'pedestrian'] })

// ビューポートの読み取り
const viewport = await client.requestViewport()
// → { x, y, zoom, width, height }
```

### AIへのシステムプロンプト

`sceneGenerator.ts`内の`SYSTEM_PROMPT`で、AIに以下を指示:

- 利用可能なシェイプタイプと各プロパティの仕様
- IDの命名規則（descriptive names）
- 依存関係の順序（point → linestring → lane）
- サイズの目安（レーン幅70-100、車両w:90 h:45）
- JSON配列のみを返すこと（説明文やmarkdown不要）

### 新しいエクステンションを作る際の参考

このサンプルを参考に新しいエクステンションを作る場合の最小ステップ:

1. `manifest.json`を作成し、必要なcapabilitiesを宣言
2. `npm install @drawtonomy/sdk`
3. `ExtensionClient`を初期化し`waitForInit()`で接続を待つ
4. `addShapes()`/`requestShapes()`等のSDK APIでdrawtonomyと通信
5. `vite.config.ts`に`server: { cors: true }`を追加（sandboxed iframe対応）

```typescript
import { ExtensionClient, createVehicle } from '@drawtonomy/sdk'

const client = new ExtensionClient('my-extension')
await client.waitForInit()

// シェイプを追加
client.addShapes([createVehicle(200, 200, { templateId: 'sedan' })])

// 既存シェイプを読み取り
const shapes = await client.requestShapes()

// 通知
client.notify('Done!', 'success')
```
