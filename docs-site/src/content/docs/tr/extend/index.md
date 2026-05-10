---
title: drawtonomy'yi genişletme
description: Uzantılar oluşturun, hedef formatlar ekleyin, şablonlara katkıda bulunun.
sidebar:
  order: 0
---

drawtonomy genişletilmek için inşa edilmiştir. Aynı SDK, ağaç içi
uzantıları (AI Scene Generator, Template Preview, Exporter
Playground) güçlendiren ve sizin de kullanacağınız şeydir.

## Uzantı noktanızı seçin

| Şunu yapmak istiyorsanız… | Okuyun |
|---|---|
| Düzenleyiciyle birlikte çalışan bir panel, üreteç veya araç eklemek | [Uzantı SDK'sı](/tr/extend/extension-sdk/) |
| Yeni bir dışa aktarma hedefi eklemek (CARLA, Unity, SUMO, …) | [Dışa Aktarıcı SDK'sı](/tr/extend/exporter-sdk/) |
| Yeni bir SVG şablonu (araç, yaya, işaret) katkısı yapmak | [Şablonlar](/tr/extend/templates/) |

## Kaynağın yeri

Her şey genel
[drawtonomy GitHub deposundadır](https://github.com/kosuke55/drawtonomy):

- `packages/drawtonomy-sdk/` — SDK
- `packages/drawtonomy-dev-server/` — geliştirme için yerel düzenleyici
- `extensions/` — referans olarak yararlı, ağaç içi uzantılar
- `templates/` — yerleşik şekil şablonları

PR'lar memnuniyetle karşılanır.
[Şablon Kılavuzu](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md)
özel bir şekli baştan sona eklemenin yolunu gösterir.
