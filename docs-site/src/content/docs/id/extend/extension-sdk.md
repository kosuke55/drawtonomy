---
title: SDK Ekstensi
description: Bangun ekstensi iframe dengan @drawtonomy/sdk dan @drawtonomy/dev-server.
---

Ekstensi drawtonomy adalah aplikasi web yang di-host di iframe yang
berkomunikasi dengan editor melalui `postMessage`. SDK memberi Anda
klien yang typed; dev-server memberi Anda editor lokal untuk
pengembangan.

Halaman ini adalah orientasi cepat. Panduan lengkap — skema
manifest, daftar kapabilitas, protokol pesan — ada di repositori
publik:

➡ **[Panduan Pengembangan Ekstensi](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.md)** ([日本語](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.ja.md))

## Mulai cepat

```bash
# Editor di :3000
pnpm add -g @drawtonomy/dev-server
drawtonomy-dev-server

# Ekstensi Anda di :3001
cd my-extension && pnpm dev --port 3001

open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

## Ekstensi minimal

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

## Ekstensi referensi

Ekstensi in-tree adalah contoh dengan fidelitas penuh:

- [`ai-scene-generator`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/ai-scene-generator) — pembangkitan adegan dari bahasa alami dan OpenSCENARIO.
- [`template-preview`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/template-preview) — pratinjau template bentuk.
- [`exporter-playground`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/exporter-playground) — uji exporter terhadap kanvas langsung.
- [`path-footprint-lab`](https://github.com/kosuke55/drawtonomy/tree/main/extensions/path-footprint-lab) — eksperimen Path Footprint.

## Lihat juga

- [Arsitektur ekstensi](/id/explanation/extension-architecture/) —
  mengapa iframe, mengapa postMessage.
- [Ikhtisar `@drawtonomy/sdk`](/id/reference/sdk/) — paket dan
  modulnya.
