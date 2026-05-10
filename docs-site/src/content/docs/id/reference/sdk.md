---
title: Ikhtisar @drawtonomy/sdk
description: Paket, entry point, dan bagaimana SDK terhubung dengan editor.
---

`@drawtonomy/sdk` adalah paket yang menjadi dasar pembuatan
ekstensi dan tooling headless. Paket ini menampilkan:

| Modul | Tujuan |
|---|---|
| `ExtensionClient` | Klien postMessage untuk ekstensi yang di-host di iframe. |
| Fungsi factory bentuk | `createLane()`, `createVehicle()`, dll. |
| `createSnapshot()` | Membangun `DrawtonomySnapshot` dari array bentuk. |
| `exporter.*` | Fungsi murni yang mengubah snapshot menjadi OpenDRIVE / OpenSCENARIO / esmini zip / Lanelet2 OSM. Termasuk parser Lanelet2. |
| Tipe | `BaseShape`, `LaneShape`, `VehicleShape`, `DrawtonomySnapshot`, … |

## Instalasi

```bash
pnpm add @drawtonomy/sdk
```

## Paket pendamping

| Paket | Tujuan |
|---|---|
| [`@drawtonomy/sdk`](https://www.npmjs.com/package/@drawtonomy/sdk) | SDK itu sendiri. |
| [`@drawtonomy/dev-server`](https://www.npmjs.com/package/@drawtonomy/dev-server) | Dev server lokal yang menjalankan editor untuk pengembangan ekstensi. |

## Sumber

Sumber SDK, tes, dan contoh ada di
[repositori GitHub drawtonomy](https://github.com/kosuke55/drawtonomy/tree/main/packages/drawtonomy-sdk).

## Lihat juga

- [API Extension SDK](/id/extend/extension-sdk/) — membangun
  ekstensi iframe.
- [API Exporter SDK](/id/extend/exporter-sdk/) — menambahkan format
  target baru.
