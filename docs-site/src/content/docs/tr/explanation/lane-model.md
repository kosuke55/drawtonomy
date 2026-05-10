---
title: Şerit bağlantı modeli
description: drawtonomy'nin yol topolojisini nasıl temsil ettiği ve bunun size ne sağladığı.
keywords:
  - drawtonomy şerit modeli
  - yol topolojisi
  - şerit bağlantısı
  - sürüş senaryosu yol ağı
---

Bir drawtonomy Şeridi'nin iki sınırından ve bir merkez çizgisinden
fazlası vardır; ayrıca onu bir yol ağına bağlayan dört bağlantı yuvası
taşır — **Sonraki**, **Önceki**, **Sol** ve **Sağ**.

## Dört yuva

| Yuva | Anlam |
|---|---|
| **Sonraki** | Bu şeritteki trafiğin aktığı şerit. |
| **Önceki** | Bu şeride akan şerit. |
| **Sol** | Hemen solda olan, bir sınır paylaşan şerit. |
| **Sağ** | Hemen sağda olan, bir sınır paylaşan şerit. |

Bağlantılar çift yönlüdür: Şerit A'nın Sonraki'sini B olarak
ayarlamak ayrıca B'nin Önceki'sini A olarak ayarlar. Düzenleyici
sizin için bu değişmezi korur.

## Bağlantıların sağladığı şeyler

### Koordineli düzenleme

İki şerit bir sınırı paylaştığında — Sol/Sağ komşular oldukları için
veya Sonraki/Önceki şeritler uçtan uca buluştuğu için — o sınır tek
bir nesnedir. Üzerinde bir noktayı sürükleyin ve her iki şerit de
güncellenir.

Topoloji zaten neyin neye yapıştığını söyler, bu nedenle bir şeridi
her ince ayar yaptığınızda geometrinin elle onarılmasına gerek
yoktur.

### Tutarlı dışa aktarma

Hem [OpenDRIVE](https://www.asam.net/standards/detail/opendrive/)
hem de
[Lanelet2](https://github.com/fzi-forschungszentrum-informatik/Lanelet2)
şerit bağlantısını kodlar. drawtonomy'nin dışa aktarıcıları
bağlantı yuvalarını doğrudan kullanır, sınır durumlarında başarısız
olacak çıkarım veya buluşsal yöntemler yoktur. Düzenleyicide doğru
görünen bir sahne, çoklu çizgi torbası yerine gerçek bir yol ağı
olarak dışa aktarılır.

### İçe aktarımlarla çift yönlü dönüşüm

Lanelet2 içe aktarıcısı aynı bağlantı modelini `.osm` dosyalarından
okur. Bir Lanelet2 haritasını drawtonomy'de düzenleyebilir ve
topolojiyi kaybetmeden geri dışa aktarabilirsiniz.

## Bağlantıların ne zaman çıkarıldığı

drawtonomy, niyet açık olduğunda bağlantıları otomatik olarak
ayarlar:

- Mevcut bir şeridin uç noktasından başlayan bir şerit çizmek
  **Önceki**'yi ayarlar.
- Paralel şerit kısayolu (Şerit aracı ile <kbd>Alt</kbd>+tıklama)
  **Sol** veya **Sağ**'ı ayarlar.
- Bir [kavşak şablonu](/tr/guides/participants/) yerleştirmek her
  yaklaşım şeridini bağlar.
- [Şerit Üreteci](/tr/guides/lane-from-map/), belirsizliğin olmadığı
  yerlerde OSM topolojisinden bağlantıları çıkarır.

Diğer her şey için, Özellik Panelinde elle ayarlayın —
[Şerit bağlantılarını yönetin](/tr/guides/lane-connections/) sayfasına
bakın.

## Bağlantıların kodlamadığı şeyler

- **Seyahat yönü** Sonraki/Önceki tarafından ima edilir, ancak ayrı
  olarak kodlanmaz. Çift yönlü yollar, kendi Sonraki/Önceki
  zincirleriyle iki karşıt şerit olarak modellenir.
- Kavşaklarda **dönüş kısıtlamaları** drawtonomy'nin kendisinde
  modellenmez. OpenDRIVE/OpenSCENARIO dışa aktarımında onları
  üreten kavşak şablonu aracılığıyla görünürler.
- **Hız sınırları, yüzey türü, aydınlatma** — bunların hiçbiri yok.
  drawtonomy geometri artı topolojidir; semantik özellikler kapsam
  dışındadır.

## Ayrıca bakın

- [Şerit bağlantılarını yönetin](/tr/guides/lane-connections/) —
  düzenleyici adımları.
- [drawtonomy.svg formatı](/tr/reference/drawtonomy-svg/) —
  bağlantıların kayıtta nasıl kalıcı kılındığı.
