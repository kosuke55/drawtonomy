---
title: Bir ROS OccupancyGrid (.pgm + .yaml) içe aktarın
description: nav2, Cartographer veya Gmapping ile oluşturulmuş bir ROS map_server doluluk ızgarasını (.pgm + .yaml) drawtonomy'ye bir arka plan katmanı olarak yükleyin, ardından üzerine yollar, şeritler ve engeller çizin.
keywords:
  - ROS doluluk ızgarası açıklaması
  - nav2 harita düzenleyici
  - cartographer harita görüntüleyici
  - pgm haritası üzerine çizim
  - SLAM haritası açıklama aracı
  - ROS doluluk ızgarası açıklaması
---

drawtonomy, [nav2](https://navigation.ros.org/), Cartographer,
Gmapping ve benzeri SLAM araçları tarafından kullanılan ROS
`map_server` formatını anlar.

![drawtonomy'ye içe aktarılmış ve üzerine oklar ve raflar çizilmiş bir ROS doluluk ızgarası](/img/ros-occupancy-grid.png)

Ekran görüntüsü, drawtonomy içinde doğrudan üzerine yollar ve engeller
çizilmiş gerçek bir depo doluluk ızgarasını (dolu hücreler siyah, boş
hücreler beyaz) gösterir.

## İçe aktarma

1. **Dosya** menüsünü → **İçe Aktar**'ı açın.
2. Dosya iletişim kutusunda `.pgm` ve eşleşen `.yaml` dosyasının
   **her ikisini** birlikte seçin.
3. drawtonomy YAML meta verisini (çözünürlük, eşik değerleri) okur
   ve ızgarayı tuvalde işler.

Sadece `.pgm`'yi seçer ve `.yaml`'ı seçmezseniz, drawtonomy
varsayılanları kullanır (`resolution = 0.05 m/px`, standart doluluk
eşik değerleri).

## Hücre renklendirme

| Hücre | Renk |
|---|---|
| Dolu | Siyah |
| Boş | Beyaz |
| Bilinmeyen | Gri |

Hücreler drawtonomy'nin şerit boyutlarıyla eşleşen bir ölçekte işlenir,
böylece tam olarak yukarıdaki ekran görüntüsünde olduğu gibi şeritler,
yollar ve şekilleri doğrudan üzerine çizebilirsiniz.

## Test edilen araçlar

drawtonomy, nav2, Cartographer ve Gmapping'den haritalarla
kullanılmıştır. Standart `map_server` `.pgm` + `.yaml` çiftini yayan
diğer üreticiler de çalışmalıdır.

## Ayrıca bakın

- [Bir Lanelet2 (.osm) dosyası içe aktarın](/tr/guides/import-lanelet2/)
