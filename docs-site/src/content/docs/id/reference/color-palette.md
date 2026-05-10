---
title: Palette warna
description: Kunci warna drawtonomy dan nilai HEX-nya.
---

drawtonomy menggunakan palette gaya Tailwind / Material: grey-100
(paling terang) hingga grey-900 (paling gelap), ditambah warna
bernama.

## Greyscale

| Kunci | HEX | Catatan |
|---|---|---|
| `grey-100` | `#e6e6e6` | Paling terang. Default untuk Vehicle (Simple). |
| `grey-200` | `#cccccc` | |
| `grey-300` | `#b3b3b3` | Default untuk Pedestrian (Walking & Simple). |
| `grey-400` | `#999999` | |
| `grey-500` | `#808080` | Abu-abu tengah. |
| `grey-600` | `#666666` | |
| `grey-700` | `#4d4d4d` | |
| `grey-800` | `#333333` | |
| `grey-900` | `#1a1a1a` | Paling gelap. |

Angka lebih rendah = lebih terang. Mengikuti konvensi Tailwind.

## Default template

| Template | Warna default |
|---|---|
| Pedestrian (Walking) | `grey-300` |
| Pedestrian (Simple) | `grey-300` |
| Vehicle (Simple) | `grey-100` |
| Bentuk lain | `black` |

## Mengatur warna secara programatik

Gunakan `resolveColor()` dari SDK untuk mengonversi kunci ke nilai
HEX. Lihat [API Extension SDK](/id/extend/extension-sdk/) untuk
detail.
