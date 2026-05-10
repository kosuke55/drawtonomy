---
title: Berkontribusi template
description: Tambahkan template kendaraan, pejalan kaki, rambu, atau marka jalan baru.
---

Template adalah berkas SVG ditambah entry manifest. Setelah
dikontribusikan, mereka muncul di menu Participants dan bentuk di
editor di samping template bawaan.

Alur kontribusi ada di repositori publik:

➡ **[Panduan Template](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md)**

## Kategori

| Folder | Contoh |
|---|---|
| `templates/vehicle/` | Sedan, Bus, Truck, Motorcycle |
| `templates/pedestrian/` | Walking, Simple |
| `templates/road_marking/` | Zebra cross, marka panah |
| `templates/sign/` | Stop, yield, kepala sinyal |
| `templates/other/` | Apa pun lainnya |

## Proses

1. Tambahkan SVG Anda di bawah folder kategori yang tepat.
2. Daftarkan di `templates/manifest.json`.
3. Buka PR. Sertakan tangkapan layar template yang ditempatkan di
   kanvas.

## Apa yang membuat template bagus

- Digambar pada ukuran default yang masuk akal (kendaraan sekitar
  4–5 m untuk sedan).
- Satu wilayah yang dapat diubah warnanya ditandai dengan fill
  yang dikenal, sehingga color picker Attribute Panel dapat
  mewarnai ulang.
- Tidak ada referensi font eksternal — teks dikonversi menjadi
  path jika ada.
- Ukuran berkas yang masuk akal (di bawah ~30 KB untuk template
  seukuran kendaraan).
