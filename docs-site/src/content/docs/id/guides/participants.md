---
title: Tambahkan kendaraan, pejalan kaki, dan lampu lalu lintas
description: Letakkan aktor dan elemen lalu lintas di kanvas menggunakan template bawaan.
---

drawtonomy menyediakan template untuk aktor dan elemen lalu lintas
yang Anda butuhkan dalam skenario mengemudi.

## Kendaraan

1. Tekan <kbd>P</kbd> untuk membuka **Participants**.
2. Pilih template kendaraan (Sedan, Bus, Truck, Motorcycle).
3. Klik di kanvas untuk menempatkan. Kendaraan muncul pada ukuran
   default templatenya.

Tarik handle sudut untuk mengubah ukuran. Tarik handle rotasi untuk
menyelaraskan dengan jalur.

## Pejalan kaki

Di menu Participants yang sama, pilih template pejalan kaki (Walking,
Simple).

## Lampu lalu lintas

Menu Participants juga mencakup sinyal kendaraan dan pejalan kaki.
Tempatkan di sudut persimpangan. Mereka adalah bentuk statis; mereka
tidak menjalankan fase sinyal.

## Template kustom

Anda dapat menambahkan template SVG sendiri dan menyumbangkan melalui
PR. Lihat
[Panduan Template](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md).

## Mengisi path dengan kendaraan

Untuk menempatkan deretan kendaraan di sepanjang path (untuk diagram
headway atau adegan follow-the-leader), gunakan
[Path Footprint](/id/guides/path-footprint/).
