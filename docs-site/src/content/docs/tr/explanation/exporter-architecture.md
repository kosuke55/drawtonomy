---
title: Dışa aktarıcı mimarisi
description: Bir tuvalin nasıl bir anlık görüntüye, bir anlık görüntünün nasıl bir dosyaya dönüştüğü.
keywords:
  - drawtonomy dışa aktarıcı mimarisi
  - dışa aktarıcı işlem hattı
  - drawtonomy snapshot
  - OpenDRIVE dışa aktarma sdk
---

Dışa aktarıcı, drawtonomy'nin düzenleyici içi verisi ile harici
formatlar — OpenDRIVE, OpenSCENARIO, Lanelet2 veya bir sonraki
bağladığınız her şey — arasındaki köprüdür. İşlem hattını anlamak,
yeni bir hedef format eklemenin ön koşuludur.

## İşlem hattı

```
Düzenleyici durumu ──► DrawtonomySnapshot ──► Dışa Aktarıcı ──► Dosya / blob
                       (serileştirilebilir)    (saf)
```

### 1. `DrawtonomySnapshot`

Bir anlık görüntü düz bir nesnedir: bir şekil listesi artı bir
sürüm damgası ve bir zaman damgası. Serileştirilebilir, DOM
referansları yoktur ve dışa aktarıcının aldığı tek girdidir.

```ts
interface DrawtonomySnapshot {
  version: string
  timestamp: string
  shapes: BaseShape[]
}
```

Bir anlık görüntüyü `createSnapshot(shapes)` ile veya kayıtlı bir
`drawtonomy.svg`'yi `parseDrawtonomySvg(svg)` ile ayrıştırarak
oluşturursunuz.

### 2. Dışa aktarıcı modülleri

Her hedef format ayrı bir saf fonksiyondur:

- `exporter.exportToOpenDrive(snapshot, options) → string` (XML)
- `exporter.exportToOpenScenario(snapshot, options) → string` (XML)
- `exporter.exportToLanelet2(snapshot, options) → string` (OSM XML)
- `exporter.buildEsminiZip(snapshot, options) → { blob, baseName }`

Bir anlık görüntü alır, bir dize veya blob döndürürler. Düzenleyici
erişimi yok, DOM yok, asenkron bağımlılık yok. Aynı girdi, aynı
çıktı.

### 3. Çift yönlü dönüşüm

Lanelet2 için SDK ayrıca bir ayrıştırıcı sunar:

- `exporter.parseOsmXml(osm) → ParsedOsm`
- `exporter.osmToShapes(parsed) → BaseShape[]`

[Lanelet2 içe aktarımı](/tr/guides/import-lanelet2/) akışını
güçlendiren budur.

## Neden saf fonksiyonlar

Dışa aktarıcı aynı kod yolunu tarayıcıda, bir Node CI betiğinde,
bir sunucu tarafı işlem hattında veya bir tarayıcı uzantısında
çalıştırır. Testler başsız tarayıcı olmadan anlık görüntü
fikstürlerine karşı çalışır.

Bu, dışa aktarıcının düzenleyicide değil, `@drawtonomy/sdk`'da
yaşamasının nedenidir — düzenleyici SDK'ya bağlıdır, tersine
değil.

## Hedef format ekleme

Dışa aktarıcı, yeni hedefler için ana uzantı noktasıdır — CARLA,
Unity, SUMO, özel DSL'ler. Tarif:

1. `packages/drawtonomy-sdk/src/exporter/` altına yeni bir modül
   ekleyin.
2. `DrawtonomySnapshot` alın, bir dize veya blob döndürün.
3. Anlık görüntü fikstürlerini kullanarak
   `packages/drawtonomy-sdk/__tests__/exporter/` altına testler
   ekleyin.
4. Düzenleyicinin Dışa Aktar menüsünün ondan haberdar olmasını
   istiyorsanız bir UI giriş noktası bağlayın (isteğe bağlı —
   birçok kullanıcı onu programatik olarak çağıracaktır).

Tam geliştirici kılavuzu genel depodadır:
[Dışa Aktarıcı Geliştirici Kılavuzu](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.md).

## Ayrıca bakın

- [OpenDRIVE / OpenSCENARIO / esmini'ye dışa aktarın](/tr/guides/export-asam/) —
  kullanıcıya yönelik akış.
- [`@drawtonomy/sdk` genel bakışı](/tr/reference/sdk/)
- [Dışa Aktarıcı SDK API'si](/tr/extend/exporter-sdk/)
