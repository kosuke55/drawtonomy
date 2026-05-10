---
title: Snap & berbagi titik
description: Dua mekanisme yang berkaitan tetapi berbeda untuk menjaga keselarasan bentuk.
---

Snap dan berbagi titik keduanya menangani "titik ini berada pada
benda itu". Mereka terlihat serupa di UI, tetapi memiliki
konsekuensi yang berbeda. Mencampuradukkannya adalah sumber
paling umum dari bug "kenapa bentuk saya bergeser?".

## Snap = koordinat sama

Snapping memindahkan kursor (atau vertex yang sedang Anda tarik)
agar mendarat pada target yang ada. Hasilnya adalah dua titik
berbeda yang *kebetulan* berbagi koordinat.

Pindahkan target asli nanti dan titik snap Anda tidak mengikuti.
Mereka tidak pernah ditautkan.

Inilah yang Anda inginkan saat membuat sketsa: keselarasan yang
tepat, tanpa coupling tersembunyi.

## Berbagi = identitas sama

Titik bersama adalah satu objek yang dirujuk oleh beberapa bentuk.
Pindahkan sekali, setiap bentuk yang memiliki referensi ikut
bergerak.

Anda membuat titik bersama dengan menahan <kbd>Alt</kbd> sambil
mengklik, atau dengan menarik vertex ke vertex yang ada dalam mode
pengeditan segmen.

Inilah yang Anda inginkan untuk batas yang tidak boleh terpisah —
dua tepi jalur yang berdampingan, dua sudut polygon yang harus
tetap dilas, ujung satu path dan awal yang lain.

## Mengapa harus dibedakan

Jika dua tepi bentuk yang seharusnya sama sebenarnya adalah dua
titik snap, tarik salah satu, ekspor ke OpenDRIVE, dan jaringan
jalan terbuka di vertex tersebut. Simulator mungkin
menginterpretasikan celah sebagai diskontinuitas, atau
mengaburkannya tergantung pada alat.

Tetangga Left/Right jalur yang berbagi batas selalu menggunakan
titik bersama secara internal — itu tidak opsional dan tidak
dapat dikontrol pengguna. Untuk bentuk sembarang (Linestring,
Polygon, Path), pilihan ada di tangan Anda.

## Petunjuk visual

- Target snap menampilkan satu handle yang disorot dan menarik
  kursor.
- Titik bersama dirender sebagai handle ganda dalam mode
  pengeditan segmen.

## Lihat juga

- [Snap ke geometri yang ada](/id/guides/snap/)
- [Bagikan titik antar bentuk](/id/guides/point-sharing/)
