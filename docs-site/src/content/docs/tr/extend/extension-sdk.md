---
title: Uzantı SDK'sı
description: '@drawtonomy/sdk ve @drawtonomy/dev-server ile iframe uzantıları oluşturun.'
keywords:
  - drawtonomy uzantı sdk
  - iframe uzantısı geliştirme
  - drawtonomy dev server
  - drawtonomy api eklenti
---

drawtonomy uzantıları, düzenleyici ile `postMessage` aracılığıyla
konuşan iframe-barındırmalı web uygulamalarıdır. SDK size yazılı
bir istemci verir; geliştirme sunucusu size karşı geliştirme
yapacağınız yerel bir düzenleyici verir.

Bu sayfa hızlı bir yönlendirmedir. Tam kılavuz — manifesto şeması,
yetenekler listesi, mesaj protokolü — genel depodadır:

➡ **[Uzantı Geliştirme Kılavuzu](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.md)** ([日本語](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.ja.md))

## Hızlı başlangıç

```bash
# Düzenleyici :3000'de
pnpm add -g @drawtonomy/dev-server
drawtonomy-dev-server

# Uzantınız :3001'de
cd my-extension && pnpm dev --port 3001

open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

## Minimum uzantı

```
my-extension/
  manifest.json
  index.html
  src/
```

```json
// manifest.json
{
  "id": "my-extension",
  "name": "My Extension",
  "version": "1.0.0",
  "entry": "./index.html",
  "capabilities": ["shapes:read", "shapes:write", "ui:panel"]
}
```

```ts
// src/main.ts
import { ExtensionClient, createVehicle } from '@drawtonomy/sdk'

const client = new ExtensionClient()
await client.ready()

document.getElementById('add')!.addEventListener('click', async () => {
  await client.addShapes([createVehicle(0, 0, { templateId: 'sedan' })])
})
```

## Referans uzantıları

Ağaç içi uzantılar tam doğrulukta örneklerdir:

- [`ai-scene-generator`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/ai-scene-generator) — doğal dil ve OpenSCENARIO sahne üretimi.
- [`template-preview`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/template-preview) — bir şekil şablonunu önizleyin.
- [`exporter-playground`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/exporter-playground) — dışa aktarıcıyı canlı bir tuvale karşı kullanın.
- [`path-footprint-lab`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/path-footprint-lab) — Path Footprint deneyleri.

## Ayrıca bakın

- [Uzantı mimarisi](/tr/explanation/extension-architecture/) — neden
  iframe'ler, neden postMessage.
- [`@drawtonomy/sdk` genel bakışı](/tr/reference/sdk/) — paket ve
  modülleri.
