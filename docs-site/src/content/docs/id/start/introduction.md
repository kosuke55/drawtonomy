---
title: Pengantar — papan tulis untuk skenario mengemudi
description: drawtonomy adalah papan tulis berbasis browser yang gratis untuk skenario mengemudi. Sketsa jalur, persimpangan, kendaraan, dan pejalan kaki untuk paper, slide, diskusi desain, dan penulisan skenario. Ekspor ke OpenDRIVE, OpenSCENARIO, dan Lanelet2.
sidebar:
  label: Pengantar
  order: 1
keywords:
  - papan tulis untuk skenario mengemudi
  - alat diagram skenario mengemudi
  - alat diagram berkendara otonom
  - gambar berkendara otonom untuk paper
  - gambar berkendara otonom untuk presentasi
  - menggambar skenario mobil otonom online
  - alat sketsa skenario lalu lintas
  - editor diagram jalur browser
  - diagram skenario untuk tinjauan desain
  - papan tulis untuk tim berkendara otonom
  - apa itu drawtonomy
  - editor OpenSCENARIO gratis
  - editor Lanelet2 di browser
  - simulasi kendaraan otonom
---

drawtonomy adalah papan tulis untuk skenario mengemudi. Jenis gambar
yang Anda sertakan dalam paper, slide yang Anda sketsa sebelum tinjauan
desain, diagram yang Anda gambar dalam panggilan saat menjelaskan kasus
tepi (corner case) kepada anggota tim, atau adegan yang Anda sketsa
sebelum menulis berkas OpenSCENARIO.

Jalur, persimpangan, kendaraan, pejalan kaki, lampu lalu lintas, marka
jalan, dan zebra cross adalah bentuk bawaan. Jalur sadar topologi —
mereka membawa koneksi Next / Previous / Left / Right — sehingga
diagram menjadi jaringan yang dapat Anda edit, bukan gambar yang harus
Anda gambar ulang setiap kali geometri jalan berubah.

Aplikasi tersedia di [drawtonomy.com](https://drawtonomy.com). SDK,
ekstensi, dan kode sumber situs dokumentasi ini ada di
[GitHub](https://github.com/kosuke55/drawtonomy).

## Untuk apa orang menggunakannya

- **Gambar untuk paper, tesis, dan laporan teknis.** Output vektor
  (`drawtonomy.svg`, PDF, EPS) yang menyatu rapi di LaTeX,
  Markdown, dan slide.
- **Slide dan presentasi.** Diagram manuver pindah jalur,
  persimpangan, kasus oklusi, dan skenario mengemudi lainnya —
  digambar dalam hitungan detik, bukan menit per bentuk.
- **Diskusi desain dan algoritma.** Permukaan sketsa bersama untuk
  membahas perilaku berkendara, kasus tepi, dan argumen keselamatan
  bersama rekan tim.
- **Penulisan skenario.** Sketsa adegan sebelum menulis XML
  OpenSCENARIO, atau impor `.xosc` yang sudah ada dan edit secara
  visual.
- **Anotasi peta dan ROS.** Telusuri jalur di atas latar satelit,
  edit peta Lanelet2 OSM, atau anotasi grid hunian ROS dengan path
  dan rintangan.

## Untuk siapa ini

- **Insinyur berkendara otonom dan ADAS** yang menggambar diagram
  untuk dokumen internal, tinjauan desain, dan laporan insiden.
- **Peneliti dan mahasiswa AV** yang menghasilkan gambar untuk
  paper, tesis, dan presentasi konferensi.
- **Penulis skenario** yang bekerja dengan simulator seperti
  [esmini](https://github.com/esmini/esmini), CARLA, atau alat
  internal.
- **Pengguna peta HD dan Lanelet2** yang membuat sketsa perubahan
  terhadap jaringan jalan yang sudah ada.
- **Tim ROS dan robotika** yang menggambar di atas grid hunian yang
  dibuat dengan nav2, Cartographer, atau Gmapping.
- **Instruktur dan edukator berkendara** yang membuat diagram untuk
  materi pengajaran.
- **Pembangun alat** yang memperluas editor dengan exporter,
  importer, atau fitur berbantuan AI baru melalui
  [SDK ekstensi](/id/extend/).

## Bagaimana dokumentasi ini disusun

Situs ini mengikuti pembagian [Diátaxis](https://diataxis.fr/). Pilih
bagian yang sesuai dengan apa yang sedang Anda kerjakan.

| Bagian | Kapan dibaca |
|---|---|
| [Tutorial](/id/tutorials/) | Anda baru dan ingin belajar dengan praktik. |
| [Panduan How-to](/id/guides/) | Anda tahu apa yang ingin dicapai dan butuh langkah-langkahnya. |
| [Referensi](/id/reference/) | Anda perlu mencari fakta yang tepat — pintasan, format, API. |
| [Penjelasan](/id/explanation/) | Anda ingin memahami mengapa drawtonomy bekerja seperti itu. |
| [Memperluas drawtonomy](/id/extend/) | Anda membangun di atas drawtonomy. |

Jika Anda tidak tahu harus mulai dari mana,
[Mulai Cepat](/id/start/quickstart/) akan membawa Anda lima menit dari
kanvas kosong hingga adegan yang diekspor.
