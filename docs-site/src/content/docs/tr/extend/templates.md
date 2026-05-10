---
title: Şablonlara katkıda bulunma
description: Yeni bir araç, yaya, işaret veya yol işaretlemesi şablonu ekleyin.
keywords:
  - drawtonomy özel şablon
  - drawtonomy araç ekleme
  - svg şablon katkısı
  - drawtonomy yaya şablonu
---

Şablonlar, SVG dosyaları artı bir manifesto girişidir. Katkıda
bulunulduktan sonra, düzenleyicinin Katılımcılar ve şekil menülerinde
yerleşik şablonların yanında görünürler.

Katkı akışı genel depodadır:

➡ **[Şablon Kılavuzu](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md)**

## Kategoriler

| Klasör | Örnekler |
|---|---|
| `templates/vehicle/` | Sedan, Bus, Truck, Motorcycle |
| `templates/pedestrian/` | Walking, Simple |
| `templates/road_marking/` | Yaya geçidi, ok işaretlemeleri |
| `templates/sign/` | Stop, yol ver, sinyal başları |
| `templates/other/` | Başka her şey |

## Süreç

1. SVG'nizi doğru kategori klasörünün altına ekleyin.
2. Onu `templates/manifest.json` içinde kaydedin.
3. Bir PR açın. Tuvale yerleştirilmiş şablonun bir ekran görüntüsünü
   ekleyin.

## İyi bir şablonu ne yapar

- Mantıklı bir varsayılan boyutta çizilmiş (sedan için araçlar
  yaklaşık 4–5 m).
- Özellik Panelinin renk seçicisinin yeniden renklendirebilmesi için
  bilinen bir dolguyla işaretlenmiş tek bir renk değiştirilebilir
  bölge.
- Harici font referansları yok — varsa metin yollara dönüştürülür.
- Makul dosya boyutu (araç boyutlu bir şablon için ~30 KB altında).
