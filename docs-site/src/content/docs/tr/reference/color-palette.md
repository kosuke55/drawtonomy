---
title: Renk paleti
description: drawtonomy'nin renk anahtarları ve HEX değerleri.
keywords:
  - drawtonomy renkleri
  - drawtonomy palet
  - sürüş diyagramı renkleri
---

drawtonomy bir Tailwind / Material tarzı palet kullanır: grey-100
(en açık) ile grey-900 (en koyu) arası, artı adlandırılmış renkler.

## Gri tonları

| Anahtar | HEX | Notlar |
|---|---|---|
| `grey-100` | `#e6e6e6` | En açık. Vehicle (Simple) için varsayılan. |
| `grey-200` | `#cccccc` | |
| `grey-300` | `#b3b3b3` | Pedestrian (Walking & Simple) için varsayılan. |
| `grey-400` | `#999999` | |
| `grey-500` | `#808080` | Orta gri. |
| `grey-600` | `#666666` | |
| `grey-700` | `#4d4d4d` | |
| `grey-800` | `#333333` | |
| `grey-900` | `#1a1a1a` | En koyu. |

Daha düşük sayı = daha açık. Bu, Tailwind'in kuralıyla eşleşir.

## Şablon varsayılanları

| Şablon | Varsayılan renk |
|---|---|
| Pedestrian (Walking) | `grey-300` |
| Pedestrian (Simple) | `grey-300` |
| Vehicle (Simple) | `grey-100` |
| Diğer şekiller | `black` |

## Programatik olarak renk ayarlama

Bir anahtarı bir HEX değerine dönüştürmek için SDK'nın
`resolveColor()` fonksiyonunu kullanın. Ayrıntılar için
[Uzantı SDK API'si](/tr/extend/extension-sdk/) sayfasına bakın.
