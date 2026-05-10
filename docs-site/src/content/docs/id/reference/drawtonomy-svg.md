---
title: Format drawtonomy.svg
description: Struktur on-disk dari berkas drawtonomy yang dapat diedit ulang.
---

Berkas `drawtonomy.svg` adalah SVG biasa yang ditingkatkan dengan
metadata yang merekam status khusus editor.

## Struktur

- Konten visual (path, text, image) adalah SVG biasa. Setiap viewer
  SVG merendernya dengan benar.
- Sebuah blok `<metadata>` di bagian atas dokumen menyimpan data
  spesifik drawtonomy:
  - ID bentuk dan props per-bentuk (template, gaya, dll.)
  - slot koneksi jalur (`next`, `previous`, `left`, `right`)
  - referensi titik bersama
  - keanggotaan grup footprint
  - z-order

## Kompatibilitas

Mengedit `drawtonomy.svg` di editor SVG generik (Illustrator,
Inkscape, peramban) akan menghapus blok metadata saat menyimpan
kecuali Anda mempertahankannya secara eksplisit. drawtonomy masih
dapat membuka hasilnya, tetapi koneksi dan titik bersama akan hilang.

Untuk pengeditan yang dapat round-trip di luar drawtonomy, gunakan
SDK ([`@drawtonomy/sdk`](/id/reference/sdk/)) — SDK dapat membaca
dan menulis format tanpa melalui editor.

## Versioning

Berkas yang lebih lama dimigrasikan secara otomatis saat impor.
Helper `resolveColorKey()` di SDK mengonversi kunci warna lama
(misalnya v1.x `grey-700`) ke yang sekarang.

## Lihat juga

- [Ekspor adegan Anda](/id/guides/export/)
- [Ikhtisar `@drawtonomy/sdk`](/id/reference/sdk/)
