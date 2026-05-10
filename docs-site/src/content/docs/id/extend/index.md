---
title: Memperluas drawtonomy
description: Bangun ekstensi, tambahkan format target, kontribusikan template.
sidebar:
  order: 0
---

drawtonomy dibangun untuk diperluas. SDK yang sama yang menggerakkan
ekstensi in-tree (AI Scene Generator, Template Preview, Exporter
Playground) adalah yang Anda gunakan.

## Pilih titik ekstensi Anda

| Anda ingin… | Baca |
|---|---|
| Menambahkan panel, generator, atau alat yang berjalan di samping editor | [SDK Ekstensi](/id/extend/extension-sdk/) |
| Menambahkan target ekspor baru (CARLA, Unity, SUMO, …) | [SDK Exporter](/id/extend/exporter-sdk/) |
| Berkontribusi template SVG baru (kendaraan, pejalan kaki, rambu) | [Template](/id/extend/templates/) |

## Di mana sumber berada

Semuanya ada di
[repositori GitHub drawtonomy](https://github.com/kosuke55/drawtonomy)
publik:

- `packages/drawtonomy-sdk/` — SDK
- `packages/drawtonomy-dev-server/` — editor lokal untuk
  pengembangan
- `extensions/` — ekstensi in-tree, berguna sebagai referensi
- `templates/` — template bentuk bawaan

PR diterima. [Panduan Template](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md)
memandu menambahkan bentuk kustom dari ujung ke ujung.
