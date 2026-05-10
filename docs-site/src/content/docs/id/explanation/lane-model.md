---
title: Model koneksi jalur
description: Bagaimana drawtonomy merepresentasikan topologi jalan, dan apa keuntungannya.
---

Lane drawtonomy memiliki lebih dari sekadar dua batas dan
centerline; lane juga membawa empat slot koneksi — **Next**,
**Previous**, **Left**, dan **Right** — yang menghubungkannya ke
jaringan jalan.

## Empat slot

| Slot | Arti |
|---|---|
| **Next** | Jalur tempat lalu lintas pada jalur ini mengalir. |
| **Previous** | Jalur yang mengalir ke jalur ini. |
| **Left** | Jalur tepat di sebelah kiri, berbagi batas. |
| **Right** | Jalur tepat di sebelah kanan, berbagi batas. |

Koneksi bersifat dua arah: mengatur Next dari Lane A ke B juga
mengatur Previous dari B ke A. Editor memelihara invarian ini
untuk Anda.

## Apa yang dimungkinkan oleh koneksi

### Pengeditan terkoordinasi

Ketika dua jalur berbagi batas — karena mereka adalah tetangga
Left/Right, atau karena jalur Next/Previous bertemu ujung ke ujung
— batas tersebut adalah satu objek. Tarik titik di atasnya dan
kedua jalur diperbarui.

Topologi sudah mengatakan apa yang direkatkan ke apa, sehingga
geometri tidak perlu diperbaiki secara manual setiap kali Anda
menyesuaikan jalur.

### Ekspor yang koheren

Baik [OpenDRIVE](https://www.asam.net/standards/detail/opendrive/)
dan
[Lanelet2](https://github.com/fzi-forschungszentrum-informatik/Lanelet2)
mengkodekan konektivitas jalur. Exporter drawtonomy menggunakan
slot koneksi secara langsung, tanpa inferensi atau heuristik yang
akan gagal pada kasus tepi. Adegan yang terlihat benar di editor
diekspor sebagai jaringan jalan nyata, bukan sekantong polyline.

### Round-trip dengan impor

Importer Lanelet2 membaca model koneksi yang sama dari berkas
`.osm`. Anda dapat mengedit peta Lanelet2 di drawtonomy dan
mengekspornya kembali tanpa kehilangan topologi.

## Kapan koneksi disimpulkan

drawtonomy mengatur koneksi secara otomatis ketika maksudnya jelas:

- Menggambar jalur yang dimulai pada endpoint jalur yang ada akan
  mengatur **Previous**.
- Pintasan jalur paralel (<kbd>Alt</kbd>+klik dengan alat Lane)
  mengatur **Left** atau **Right**.
- Menempatkan [template persimpangan](/id/guides/participants/)
  menghubungkan setiap jalur pendekatan.
- [Lane Generator](/id/guides/lane-from-map/) menyimpulkan koneksi
  dari topologi OSM jika tidak ambigu.

Untuk semua hal lainnya, atur secara manual di Attribute Panel —
lihat [Kelola koneksi jalur](/id/guides/lane-connections/).

## Apa yang tidak dikodekan koneksi

- **Arah perjalanan** disiratkan oleh Next/Previous, tetapi tidak
  dikodekan secara terpisah. Jalan dua arah dimodelkan sebagai
  dua jalur berlawanan dengan rantai Next/Previous mereka sendiri.
- **Pembatasan belok** di persimpangan tidak dimodelkan di
  drawtonomy itu sendiri. Mereka muncul di ekspor
  OpenDRIVE/OpenSCENARIO melalui template persimpangan yang
  menghasilkannya.
- **Batas kecepatan, jenis permukaan, pencahayaan** — tidak satu
  pun. drawtonomy adalah geometri ditambah topologi; atribut
  semantik berada di luar lingkup.

## Lihat juga

- [Kelola koneksi jalur](/id/guides/lane-connections/) — langkah
  editor.
- [Format drawtonomy.svg](/id/reference/drawtonomy-svg/) — bagaimana
  koneksi dipertahankan saat menyimpan.
