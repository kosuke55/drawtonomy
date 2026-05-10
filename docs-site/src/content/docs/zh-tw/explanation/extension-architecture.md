---
title: 擴充功能架構
description: drawtonomy 如何載入、隔離與與第三方擴充功能溝通。
keywords:
  - drawtonomy 擴充功能架構
  - iframe 擴充功能
  - postMessage 擴充
  - 自駕白板擴充
  - 編輯器外掛架構
---

drawtonomy 的擴充功能不是編譯進編輯器的外掛。它們是分離的網頁應用,載入到 iframe 中,並透過 `postMessage` 與宿主溝通。本頁說明為何如此,以及這個選擇帶來什麼結果。

## 載入

擴充功能是一個指向 `manifest.json` 的網址。使用者(或深層連結)以 `?ext=<manifestUrl>` 開啟編輯器:

```
https://drawtonomy.com/?ext=https://my-extension.vercel.app/manifest.json
```

編輯器會擷取資訊清單、建立 iframe,並載入擴充功能的進入 HTML。可使用重複的 `?ext=` 參數一次載入多個擴充功能。

## 隔離

擴充功能在具有自己來源的 iframe 中執行。它們不能:

- 直接觸碰編輯器的 DOM。
- 讀取 drawtonomy 的 localStorage。
- 載入超出宿主 CSP 的資源。

它們只能做資訊清單 `capabilities` 陣列(`shapes:read`、`shapes:write`、`ui:panel` 等)所要求的事情,以及 `postMessage` 透過 `@drawtonomy/sdk` 的 `ExtensionClient` 暴露的事情。

這是有意為之。擴充功能是第三方程式碼;編輯器將它們視為不受信任。

## 通訊

SDK 將 `postMessage` 包裝在 `ExtensionClient` 中,提供具型別、基於 promise 的 API:

```ts
import { ExtensionClient } from '@drawtonomy/sdk'

const client = new ExtensionClient()
const shapes = await client.getShapes()
await client.addShapes(newShapes)
```

底層運作:

- 擴充功能向宿主 iframe 發送請求。
- 宿主根據擴充功能的功能進行驗證。
- 宿主回應,或請求被拒絕。

## 為什麼用 iframe

替代方案——npm 風格的外掛、Webpack 模組聯邦、行程內腳本——都需要信任擴充功能的程式碼進入您的編輯器。它們也將擴充功能的生命週期與編輯器的建置綁在一起。

iframe 給您:

- **來源隔離**,由瀏覽器強制——無需維護 JS 沙箱。
- **獨立的部署週期**——擴充功能依自己的步調發布。
- **任何框架**——React、Vue、Svelte、原生 JS;宿主不在乎。
- **開發與正式環境程式碼相同**——開發伺服器在 `localhost:3000` 代管編輯器;您將其指向 `localhost:3001` 的擴充功能。相同的 `?ext=` 旗標、相同的協定。

權衡是 `postMessage` 是非同步的。看似免費的呼叫(`getShapes()`)花費一次 iframe 來回。SDK 會在可能時批次處理與快取;不要將呼叫放在緊密迴圈中。

## 本機開發

`@drawtonomy/dev-server` 套件在本機代管編輯器,讓您可在不經網路來回下開發:

```bash
pnpm add -g @drawtonomy/dev-server
drawtonomy-dev-server                          # 編輯器於 :3000
cd my-extension && pnpm dev --port 3001        # 擴充功能於 :3001
open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

完整指南位於公開儲存庫:[擴充功能開發指南](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.md)。

## 另請參閱

- [擴充 SDK API](/zh-tw/extend/extension-sdk/)
- [`@drawtonomy/sdk` 概述](/zh-tw/reference/sdk/)
