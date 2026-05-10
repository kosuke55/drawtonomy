---
title: '@drawtonomy/sdk genel bakışı'
description: Paketler, giriş noktaları ve SDK'nın düzenleyiciyle nasıl uyduğu.
keywords:
  - drawtonomy sdk
  - drawtonomy api
  - sürüş senaryosu sdk
  - otonom sürüş aracı sdk
---

`@drawtonomy/sdk`, uzantı yazarlarının ve başsız araçların karşı
inşa ettiği pakettir. Şunları sunar:

| Modül | Amaç |
|---|---|
| `ExtensionClient` | iframe-barındırmalı uzantılar için postMessage istemcisi. |
| Şekil fabrika fonksiyonları | `createLane()`, `createVehicle()` vb. |
| `createSnapshot()` | Bir şekil dizisinden bir `DrawtonomySnapshot` oluşturun. |
| `exporter.*` | Bir anlık görüntüyü OpenDRIVE / OpenSCENARIO / esmini zip / Lanelet2 OSM'ye dönüştüren saf fonksiyonlar. Lanelet2 ayrıştırıcısı içerir. |
| Tipler | `BaseShape`, `LaneShape`, `VehicleShape`, `DrawtonomySnapshot`, … |

## Kurulum

```bash
pnpm add @drawtonomy/sdk
```

## Yardımcı paketler

| Paket | Amaç |
|---|---|
| [`@drawtonomy/sdk`](https://www.npmjs.com/package/@drawtonomy/sdk) | SDK'nın kendisi. |
| [`@drawtonomy/dev-server`](https://www.npmjs.com/package/@drawtonomy/dev-server) | Uzantı geliştirme için düzenleyiciyi barındıran yerel geliştirme sunucusu. |

## Kaynak

SDK kaynak kodu, testleri ve örnekleri
[drawtonomy GitHub deposunda](https://github.com/kosuke55/drawtonomy/tree/main/packages/drawtonomy-sdk)
yer alır.

## Ayrıca bakın

- [Uzantı SDK API'si](/tr/extend/extension-sdk/) — iframe uzantıları
  oluşturma.
- [Dışa Aktarıcı SDK API'si](/tr/extend/exporter-sdk/) — yeni hedef
  formatlar ekleme.
