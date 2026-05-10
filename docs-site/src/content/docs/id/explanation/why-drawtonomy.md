---
title: Mengapa drawtonomy — papan tulis yang dibangun untuk skenario mengemudi
description: Mengapa drawtonomy ada dan pilihan desain di baliknya. Dibangun khusus untuk skenario mengemudi — gambar yang masuk ke paper berkendara otonom, slide, tinjauan desain, dan penulisan skenario.
keywords:
  - mengapa drawtonomy
  - papan tulis untuk skenario mengemudi
  - alat diagram berkendara otonom
  - alat gambar untuk paper riset AV
  - perangkat lunak ilustrasi mobil otonom
  - alternatif slide untuk diagram jalan
  - papan tulis untuk tim AV
  - sketsa jaringan jalan
  - editor diagram berkendara otonom
  - alat pembuatan adegan AV
---

drawtonomy adalah papan tulis yang dibangun khusus untuk skenario
mengemudi. Sebagian besar tim membuat sketsa diagram seperti ini
hari ini di alat menggambar generik atau slide — alat-alat tersebut
berfungsi baik untuk bentuk umum, tetapi mereka tidak tahu apa itu
jalur, sehingga geometri harus digambar ulang setiap kali jalan
berbelok, persimpangan menumbuhkan cabang, atau zebra cross perlu
disejajarkan dengan jalan.

Halaman ini menjelaskan pilihan desain yang muncul dari memimpin
dengan "papan tulis untuk skenario mengemudi" alih-alih "alat yang
mengekspor ke simulator".

## Masalah yang diselesaikannya

Sebagian besar komunikasi berkendara otonom yang sebenarnya terjadi
melalui diagram: di paper, tinjauan desain, rapat perencanaan,
laporan insiden, ruang kelas, dan slide. Diagram adalah artefak yang
dilihat orang, didebatkan, dan diingat.

Alat menggambar generik pada level itu hanya memberi Anda bentuk
umum. Jalur adalah persegi panjang yang Anda gambar ulang setiap
kali jalan berbelok; zebra cross adalah tumpukan persegi panjang
yang harus terus disejajarkan secara manual; persimpangan adalah
setengah jam mengutak-atik. Lebih buruk lagi, saat geometri jalan
berubah — dan dalam pekerjaan AV ini berubah terus-menerus — Anda
mulai dari awal lagi.

drawtonomy ada untuk membuat loop tersebut cepat. Blok bangunan yang
sebenarnya dimiliki domain — jalur, persimpangan, zebra cross, lampu
lalu lintas, marka jalan, kendaraan, pejalan kaki — adalah bentuk
kelas-utama, sehingga gambar tetap akurat saat Anda iterasi.

## Di mana drawtonomy berada

Pekerjaan skenario mengemudi terjadi di beberapa level berbeda:

1. **Diagram.** Paper, slide, sketsa papan tulis, gambar dokumen
   desain, materi kelas. Cepat dan mudah secara prinsip, tetapi di
   alat generik geometri jalan harus disusun ulang setiap kali ada
   yang bergeser.
2. **Alat penulisan.** Editor OpenSCENARIO, editor jaringan jalan,
   paket gaya CAD. Tepat, lambat, mahal untuk dipelajari.
3. **Simulator.** esmini, CARLA, alat internal. Jalankan skenario,
   hasilkan data.

drawtonomy berada di level 1, dan menyeberang ke level 2 ketika Anda
butuh: mengimpor peta Lanelet2, sketsa perubahan, ekspor
OpenDRIVE/OpenSCENARIO, serahkan hasilnya ke esmini.

## Prioritas desain

### Mengutamakan papan tulis

Titik perbandingannya adalah sketsa papan tulis cepat atau slide,
bukan alat CAD. Itu menetapkan standar untuk friksi: buka URL,
gambar, bagikan. Tanpa instalasi, tanpa akun, tanpa format file
proyek. Apa pun yang akan membuat drawtonomy terasa lebih berat
daripada sketsa cepat akan dipotong.

### Sadar topologi

Jalan bukanlah sekantong polyline. drawtonomy memodelkan koneksi
jalur (Next / Previous / Left / Right) sehingga memindahkan batas
memperbarui jalur tetangga secara otomatis. Dua jalur yang berbagi
batas berbagi titik batas yang sama — tarik sekali, keduanya
bergerak. Lihat
[Model koneksi jalur](/id/explanation/lane-model/).

### Template domain mengemudi

Kendaraan (sedan, bus, truk, motor…), pejalan kaki (walking,
simple), lampu lalu lintas untuk kendaraan dan pejalan kaki, zebra
cross, marka jalan, rambu, template persimpangan. Mereka adalah
bentuk bawaan alih-alih perkiraan persegi panjang generik. Template
SVG kustom dapat ditambahkan melalui PR.

### Dapat diedit di output juga, bukan hanya di input

Setiap format output yang dihasilkan drawtonomy mempertahankan
status yang cukup untuk diedit ulang. `drawtonomy.svg` adalah
bentuk kanonik lossless: SVG biasa yang dipratinjau di mana saja
(peramban, GitHub, slide, gambar paper) dan dibuka kembali di
drawtonomy dengan setiap koneksi dan relasi tumpang tindih utuh.
Tidak ada yang terjebak dalam format yang tidak dapat Anda baca
kembali.

### Headless saat dibutuhkan

Kode exporter dan parser adalah bagian dari `@drawtonomy/sdk` dan
berjalan tanpa editor. Pipeline CI, ekstensi peramban, dan alat AI
dapat menghasilkan dan memvalidasi adegan secara programatik.

## Jembatan ke alur kerja lainnya

Setelah Anda memiliki diagram, Anda biasanya ingin melakukan
sesuatu dengannya. drawtonomy menyediakan beberapa jembatan
sehingga gambar tidak terjebak di dalam editor:

- **`drawtonomy.svg`** — default. Sematkan di paper, slide, dokumen
  Markdown; buka kembali nanti untuk terus mengedit.
- **Round-trip Lanelet2** — buka peta Lanelet2 OSM (termasuk peta
  sampel Autoware), edit, ekspor kembali. Berguna untuk membuat
  sketsa perubahan terhadap peta HD yang ada.
- **Ekspor ASAM** — OpenDRIVE 1.8 + OpenSCENARIO 1.3, opsional
  digabungkan sebagai zip siap
  [esmini](https://github.com/esmini/esmini).
- **AI Scene Generator** — jelaskan skenario dalam bahasa alami,
  atau tempel XML OpenSCENARIO, dan dapatkan kanvas yang dapat
  diedit untuk mulai disempurnakan.

Jembatan-jembatan ini berguna, tetapi diagram itu sendiri adalah
alasan keberadaan drawtonomy. Sebuah gambar di drawtonomy sudah
berharga sebagai gambar; format ini memungkinkannya mengalir ke
tahap berikutnya dari alur kerja saat dibutuhkan.

## Apa yang bukan drawtonomy

- **Bukan simulator.** Tidak menjalankan skenario. Ekspor ke
  esmini, CARLA, atau alat Anda sendiri untuk itu.
- **Bukan alat CAD.** Tidak menerapkan akurasi rekayasa (spline
  klotoid, banking, elevasi). Geometrinya 2D sederhana.
- **Bukan suite kolaborasi real-time.** Ini adalah editor
  pengguna-tunggal. Simpan, bagikan, buka kembali.

## Lihat juga

- [Model koneksi jalur](/id/explanation/lane-model/)
- [Arsitektur exporter](/id/explanation/exporter-architecture/)
- [Arsitektur ekstensi](/id/explanation/extension-architecture/)
