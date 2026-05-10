---
title: Giriş — sürüş senaryoları için beyaz tahta
description: drawtonomy, sürüş senaryoları için ücretsiz, tarayıcı tabanlı bir beyaz tahtadır. Makaleler, slaytlar, tasarım tartışmaları ve senaryo oluşturma için şeritleri, kavşakları, araçları ve yayaları taslaklayın. OpenDRIVE, OpenSCENARIO ve Lanelet2'ye dışa aktarım.
sidebar:
  label: Giriş
  order: 1
keywords:
  - otonom sürüş için beyaz tahta
  - sürüş senaryosu diyagramı
  - otonom sürüş diyagram aracı
  - otonom sürüş makale görseli
  - otonom sürüş sunum görseli
  - çevrimiçi sürücüsüz sürüş senaryosu çizimi
  - trafik senaryosu taslak aracı
  - tarayıcıda şerit diyagramı düzenleyici
  - tasarım incelemesi için senaryo diyagramı
  - otonom sürüş ekipleri için beyaz tahta
  - drawtonomy nedir
  - otonom araç simülasyonu
  - ADAS senaryo
---

drawtonomy, sürüş senaryoları için bir beyaz tahtadır. Bir makaleye
koyduğunuz türden bir görsel, tasarım incelemesinden önce
taslakladığınız slayt, ekibe bir sınır durumunu açıklarken bir
görüşmede çizdiğiniz diyagram veya OpenSCENARIO dosyasını yazmadan
önce taslakladığınız sahne.

Şeritler, kavşaklar, araçlar, yayalar, trafik ışıkları, yol
işaretlemeleri ve yaya geçitleri yerleşik şekillerdir. Şeritler
topoloji bilincine sahiptir — Sonraki / Önceki / Sol / Sağ
bağlantılarını taşırlar — bu nedenle diyagram, yol geometrisi her
değiştiğinde yeniden çizdiğiniz bir resim değil, düzenleyebileceğiniz
bir ağdır.

Uygulama [drawtonomy.com](https://drawtonomy.com) adresindedir. SDK,
uzantılar ve bu dokümantasyon sitesinin kaynak kodu
[GitHub](https://github.com/kosuke55/drawtonomy)'da yer alıyor.

## Kullanıcılar bunu ne için kullanıyor

- **Makaleler, tezler ve teknik raporlar için görseller.** LaTeX,
  Markdown ve slayt setlerine temiz bir şekilde gömülen vektör çıktı
  (`drawtonomy.svg`, PDF, EPS).
- **Slaytlar ve sunumlar.** Şerit değişikliği manevraları, kavşaklar,
  görüş engeli durumları ve diğer sürüş senaryolarının diyagramları
  — şekil başına dakikalar yerine saniyeler içinde çizilir.
- **Tasarım ve algoritma tartışmaları.** Sürüş davranışı, sınır
  durumları ve takım arkadaşlarıyla güvenlik argümanları hakkında
  konuşmak için paylaşılan bir taslak yüzeyi.
- **Senaryo yazımı.** OpenSCENARIO XML yazmadan önce sahneyi
  taslaklayın veya mevcut bir `.xosc` dosyasını içe aktarıp görsel
  olarak düzenleyin.
- **Harita ve ROS açıklaması.** Bir uydu arka planı üzerinde şeritleri
  çizin, Lanelet2 OSM haritalarını düzenleyin veya bir ROS doluluk
  ızgarasını yollar ve engellerle açıklayın.

## Bu kimler için

- Dahili belgeler, tasarım incelemeleri ve olay raporları için
  diyagramlar çizen **otonom sürüş ve ADAS mühendisleri**.
- Makaleler, tezler ve konferans konuşmaları için görseller üreten
  **AV araştırmacıları ve öğrencileri**.
- [esmini](https://github.com/esmini/esmini), CARLA veya kurum içi
  araçlar gibi simülatörlerle çalışan **senaryo yazarları**.
- Mevcut bir yol ağında değişiklikleri taslaklayan **HD harita ve
  Lanelet2 kullanıcıları**.
- nav2, Cartographer veya Gmapping ile oluşturulmuş doluluk ızgaraları
  üzerine çizen **ROS ve robotik ekipleri**.
- Öğretim materyali için diyagramlar üreten **sürüş eğitmenleri ve
  eğiticileri**.
- [Uzantı SDK'sı](/tr/extend/) aracılığıyla yeni dışa aktarıcılar,
  içe aktarıcılar veya AI destekli özelliklerle düzenleyiciyi
  genişleten **araç oluşturucuları**.

## Bu dokümantasyon nasıl düzenlendi

Site [Diátaxis](https://diataxis.fr/) bölünmesini takip eder.
Yapmaya çalıştığınız şeye uyan bölümü seçin.

| Bölüm | Ne zaman okumalı |
|---|---|
| [Eğitimler](/tr/tutorials/) | Yenisinizdir ve yaparak öğrenmek istersiniz. |
| [Nasıl yapılır kılavuzları](/tr/guides/) | Neyi başaracağınızı bilirsiniz ve adımlara ihtiyacınız vardır. |
| [Referans](/tr/reference/) | Kesin bir bilgiyi aramanız gerekir — bir kısayol, bir format, bir API. |
| [Açıklama](/tr/explanation/) | drawtonomy'nin neden böyle çalıştığını anlamak istersiniz. |
| [drawtonomy'yi genişletme](/tr/extend/) | drawtonomy üzerine inşa edersiniz. |

Nereden başlayacağınızı bilmiyorsanız,
[Hızlı Başlangıç](/tr/start/quickstart/) boş bir tuvalden dışa
aktarılan bir sahneye beş dakikadır.
