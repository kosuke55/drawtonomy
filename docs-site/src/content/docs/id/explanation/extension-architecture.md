---
title: Arsitektur ekstensi
description: Bagaimana drawtonomy memuat, mengisolasi, dan berkomunikasi dengan ekstensi pihak ketiga.
---

Ekstensi drawtonomy bukanlah plugin yang dikompilasi ke dalam
editor. Mereka adalah aplikasi web terpisah yang dimuat ke iframe,
berkomunikasi dengan host melalui `postMessage`. Halaman ini
menjelaskan mengapa, dan apa yang muncul dari pilihan tersebut.

## Pemuatan

Ekstensi adalah URL yang menunjuk ke `manifest.json`. Pengguna
(atau deep-link) membuka editor dengan `?ext=<manifestUrl>`:

```
https://drawtonomy.com/?ext=https://my-extension.vercel.app/manifest.json
```

Editor mengambil manifest, membuat iframe, dan memuat HTML entry
ekstensi. Beberapa ekstensi dapat dimuat sekaligus dengan
parameter `?ext=` berulang.

## Isolasi

Ekstensi berjalan di dalam iframe dengan origin mereka sendiri.
Mereka tidak dapat:

- Menyentuh DOM editor secara langsung.
- Membaca localStorage drawtonomy.
- Memuat sumber daya melewati CSP host.

Mereka dapat melakukan apa yang diminta dalam array `capabilities`
manifest (`shapes:read`, `shapes:write`, `ui:panel`, …) dan apa
yang ditampilkan `postMessage` melalui `ExtensionClient` dari
`@drawtonomy/sdk`.

Ini disengaja. Ekstensi adalah kode pihak ketiga; editor
memperlakukannya sebagai tidak dipercaya.

## Komunikasi

SDK membungkus `postMessage` dalam `ExtensionClient` yang memberi
Anda API yang typed dan berbasis promise:

```ts
import { ExtensionClient } from '@drawtonomy/sdk'

const client = new ExtensionClient()
const shapes = await client.getShapes()
await client.addShapes(newShapes)
```

Di balik layar:

- Ekstensi memposting permintaan ke iframe host.
- Host memvalidasi terhadap kapabilitas ekstensi.
- Host merespons, atau permintaan ditolak.

## Mengapa iframe

Alternatifnya — plugin gaya npm, Webpack module federation,
script in-process — semuanya memerlukan kepercayaan pada kode
ekstensi dengan editor Anda. Mereka juga menyatukan masa hidup
ekstensi dengan build editor.

iframe memberi Anda:

- **Isolasi origin**, ditegakkan browser — tidak ada sandbox JS
  yang perlu dipelihara.
- **Siklus deploy independen** — ekstensi dirilis sesuai langkah
  mereka sendiri.
- **Framework apa pun** — React, Vue, Svelte, vanilla JS; host
  tidak peduli.
- **Kode yang sama di dev dan prod** — dev server menjalankan
  editor di `localhost:3000`; Anda mengarahkannya ke ekstensi Anda
  di `localhost:3001`. Flag `?ext=` yang sama, protokol yang sama.

Trade-off-nya adalah `postMessage` bersifat asinkron. Panggilan
yang terlihat bebas (`getShapes()`) memerlukan round-trip iframe.
SDK melakukan batching dan caching jika memungkinkan; jangan
menempatkan panggilan dalam loop ketat.

## Pengembangan lokal

Paket `@drawtonomy/dev-server` menyajikan editor secara lokal
sehingga Anda dapat mengembangkan tanpa round-trip jaringan:

```bash
pnpm add -g @drawtonomy/dev-server
drawtonomy-dev-server                          # editor di :3000
cd my-extension && pnpm dev --port 3001        # ekstensi di :3001
open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

Panduan lengkap ada di repositori publik:
[Panduan Pengembangan Ekstensi](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.md).

## Lihat juga

- [API Extension SDK](/id/extend/extension-sdk/)
- [Ikhtisar `@drawtonomy/sdk`](/id/reference/sdk/)
