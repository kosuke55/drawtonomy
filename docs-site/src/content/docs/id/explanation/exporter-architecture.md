---
title: Arsitektur exporter
description: Bagaimana kanvas menjadi snapshot, dan snapshot menjadi berkas.
---

Exporter adalah jembatan antara data in-editor drawtonomy dan
format eksternal — OpenDRIVE, OpenSCENARIO, Lanelet2, atau apa pun
yang Anda hubungkan berikutnya. Memahami pipeline adalah prasyarat
untuk menambahkan format target baru.

## Pipeline

```
Status editor ──► DrawtonomySnapshot ──► Exporter ──► Berkas / blob
                  (dapat diserialisasi)   (murni)
```

### 1. `DrawtonomySnapshot`

Snapshot adalah objek biasa: daftar bentuk ditambah cap versi dan
timestamp. Dapat diserialisasi, tidak memiliki referensi DOM, dan
satu-satunya input yang diterima exporter.

```ts
interface DrawtonomySnapshot {
  version: string
  timestamp: string
  shapes: BaseShape[]
}
```

Anda membangun snapshot dengan `createSnapshot(shapes)`, atau dengan
mem-parse `drawtonomy.svg` yang tersimpan dengan
`parseDrawtonomySvg(svg)`.

### 2. Modul exporter

Setiap format target adalah fungsi murni terpisah:

- `exporter.exportToOpenDrive(snapshot, options) → string` (XML)
- `exporter.exportToOpenScenario(snapshot, options) → string` (XML)
- `exporter.exportToLanelet2(snapshot, options) → string` (OSM XML)
- `exporter.buildEsminiZip(snapshot, options) → { blob, baseName }`

Mereka mengambil snapshot, mengembalikan string atau blob. Tidak
ada akses editor, tidak ada DOM, tidak ada dependensi async. Input
yang sama, output yang sama.

### 3. Round-trip

Untuk Lanelet2, SDK juga menyediakan parser:

- `exporter.parseOsmXml(osm) → ParsedOsm`
- `exporter.osmToShapes(parsed) → BaseShape[]`

Inilah yang menggerakkan alur
[impor Lanelet2](/id/guides/import-lanelet2/).

## Mengapa fungsi murni

Exporter menjalankan jalur kode yang sama di browser, di skrip CI
Node, di pipeline sisi server, atau di ekstensi peramban. Tes
berjalan terhadap fixture snapshot tanpa peramban headless.

Itulah sebabnya exporter berada di `@drawtonomy/sdk` dan bukan di
dalam editor — editor bergantung pada SDK, bukan sebaliknya.

## Menambahkan format target

Exporter adalah titik ekstensi utama untuk target baru — CARLA,
Unity, SUMO, DSL kustom. Resepnya:

1. Tambahkan modul baru di
   `packages/drawtonomy-sdk/src/exporter/`.
2. Ambil `DrawtonomySnapshot`, kembalikan string atau blob.
3. Tambahkan tes di `packages/drawtonomy-sdk/__tests__/exporter/`
   menggunakan fixture snapshot.
4. Hubungkan titik entry UI jika Anda ingin menu Export editor
   tahu tentangnya (opsional — banyak pengguna akan
   memanggilnya secara programatik).

Panduan pengembang lengkap ada di repositori publik:
[Panduan Pengembang Exporter](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.md).

## Lihat juga

- [Ekspor ke OpenDRIVE / OpenSCENARIO / esmini](/id/guides/export-asam/) —
  alur menghadap pengguna.
- [Ikhtisar `@drawtonomy/sdk`](/id/reference/sdk/)
- [API Exporter SDK](/id/extend/exporter-sdk/)
