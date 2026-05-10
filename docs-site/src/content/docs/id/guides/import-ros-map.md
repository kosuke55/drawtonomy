---
title: Impor ROS OccupancyGrid (.pgm + .yaml)
description: Muat grid hunian ROS map_server (.pgm + .yaml) — yang dibuat dengan nav2, Cartographer, atau Gmapping — ke drawtonomy sebagai lapisan latar, lalu sketsa path, jalur, dan rintangan di atasnya.
keywords:
  - anotasi grid hunian ROS
  - editor peta nav2
  - viewer peta cartographer
  - menggambar di peta pgm
  - alat anotasi peta SLAM
  - viewer peta ROS
  - editor peta robotika
  - alat anotasi peta hunian
  - peta gridmap navigasi
  - alat anotasi peta navigasi
---

drawtonomy memahami format ROS `map_server` yang digunakan oleh
[nav2](https://navigation.ros.org/), Cartographer, Gmapping, dan
alat SLAM serupa.

![Grid hunian ROS yang diimpor ke drawtonomy dengan panah dan rak digambar di atasnya](/img/ros-occupancy-grid.png)

Tangkapan layar menunjukkan grid hunian gudang nyata (sel terhuni
hitam, sel kosong putih) dengan path dan rintangan digambar
langsung di atasnya di dalam drawtonomy.

## Impor

1. Buka menu **File** → **Import**.
2. Pilih **kedua** berkas `.pgm` dan berkas `.yaml` yang sesuai
   bersamaan dalam dialog berkas.
3. drawtonomy membaca metadata YAML (resolusi, ambang) dan merender
   grid di kanvas.

Jika Anda hanya memilih `.pgm` tanpa `.yaml`, drawtonomy menggunakan
default (`resolution = 0.05 m/px`, ambang hunian standar).

## Pewarnaan sel

| Sel | Warna |
|---|---|
| Terhuni | Hitam |
| Kosong | Putih |
| Tidak diketahui | Abu-abu |

Sel dirender pada skala yang cocok dengan dimensi jalur drawtonomy,
sehingga Anda dapat menggambar jalur, path, dan bentuk langsung di
atasnya — persis seperti tangkapan layar di atas.

## Alat yang sudah diuji

drawtonomy telah digunakan dengan peta dari nav2, Cartographer, dan
Gmapping. Penghasil lain seharusnya berfungsi selama mereka
menghasilkan pasangan standar `.pgm` + `.yaml` `map_server`.

## Lihat juga

- [Impor berkas Lanelet2 (.osm)](/id/guides/import-lanelet2/)
