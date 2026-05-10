---
title: drawtonomy.svg formatı
description: Yeniden düzenlenebilir bir drawtonomy dosyasının disk üzerindeki yapısı.
keywords:
  - drawtonomy svg formatı
  - düzenlenebilir svg sürüş sahnesi
  - drawtonomy dosya formatı
  - sürüş diyagramı svg
---

Bir `drawtonomy.svg` dosyası, yalnızca düzenleyici durumunu kaydeden
meta verilerle güçlendirilmiş normal bir SVG'dir.

## Yapı

- Görsel içerik (yollar, metin, görseller) düz SVG'dir. Herhangi bir
  SVG görüntüleyici onu doğru şekilde işler.
- Belgenin başındaki bir `<metadata>` bloğu drawtonomy'ye özgü
  verileri tutar:
  - şekil kimlikleri ve şekil başına özellikler (şablon, stil vb.)
  - şerit bağlantı yuvaları (`next`, `previous`, `left`, `right`)
  - paylaşılan nokta referansları
  - ayak izi grup üyeliği
  - z-sırası

## Uyumluluk

Genel bir SVG düzenleyicide (Illustrator, Inkscape, tarayıcı) bir
`drawtonomy.svg` düzenlemek, açıkça korumadığınız sürece kayıtta
meta veri bloğunu düşürür. drawtonomy hala sonucu açabilir, ancak
bağlantılar ve paylaşılan noktalar eksik olur.

drawtonomy dışında çift yönlü düzenlemeler için, SDK'yı
([`@drawtonomy/sdk`](/tr/reference/sdk/)) kullanın — formatı
düzenleyiciden geçmeden okuyup yazabilir.

## Sürümleme

Eski dosyalar içe aktarımda otomatik olarak taşınır. SDK'daki
`resolveColorKey()` yardımcısı eski renk anahtarlarını (örneğin,
v1.x `grey-700`) mevcut olanlara dönüştürür.

## Ayrıca bakın

- [Sahnenizi dışa aktarın](/tr/guides/export/)
- [`@drawtonomy/sdk` genel bakışı](/tr/reference/sdk/)
