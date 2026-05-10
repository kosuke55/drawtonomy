---
title: Uzantı mimarisi
description: drawtonomy üçüncü taraf uzantıları nasıl yükler, izole eder ve onlarla nasıl konuşur.
keywords:
  - drawtonomy uzantı mimarisi
  - drawtonomy iframe uzantısı
  - postMessage api
  - uzantı sandbox
---

drawtonomy uzantıları, düzenleyiciye derlenmiş eklentiler değildir.
Bunlar bir iframe içine yüklenmiş ayrı web uygulamalarıdır,
`postMessage` aracılığıyla ana ile iletişim kurarlar. Bu sayfa
bunun nedenini ve bu seçimden çıkanları açıklar.

## Yükleme

Bir uzantı, bir `manifest.json`'a işaret eden bir URL'dir. Kullanıcı
(veya derin bir bağlantı) düzenleyiciyi `?ext=<manifestUrl>` ile
açar:

```
https://drawtonomy.com/?ext=https://my-extension.vercel.app/manifest.json
```

Düzenleyici manifestoyu alır, bir iframe oluşturur ve uzantının
giriş HTML'sini yükler. `?ext=` parametreleri tekrarlanarak aynı
anda birden fazla uzantı yüklenebilir.

## İzolasyon

Uzantılar kendi kaynaklarına sahip bir iframe içinde çalışır.
Şunları yapamazlar:

- Düzenleyicinin DOM'una doğrudan dokunmak.
- drawtonomy'nin localStorage'ını okumak.
- Ana bilgisayarın CSP'sinin ötesinde kaynakları yüklemek.

Manifestonun `capabilities` dizisinde istedikleri şeyleri (`shapes:read`,
`shapes:write`, `ui:panel`, …) ve `postMessage`'ın `@drawtonomy/sdk`'nın
`ExtensionClient` aracılığıyla maruz bıraktığı şeyleri yapabilirler.

Bu kasıtlıdır. Uzantılar üçüncü taraf koddur; düzenleyici onları
güvenilmez olarak ele alır.

## İletişim

SDK, `postMessage`'ı size yazılı, söz tabanlı bir API veren bir
`ExtensionClient` içinde sarar:

```ts
import { ExtensionClient } from '@drawtonomy/sdk'

const client = new ExtensionClient()
const shapes = await client.getShapes()
await client.addShapes(newShapes)
```

Arka planda:

- Uzantı ana iframe'e bir istek gönderir.
- Ana, uzantının yeteneklerine karşı doğrular.
- Ana yanıt verir veya istek reddedilir.

## Neden iframe'ler

Alternatifler — npm-tarzı eklentiler, Webpack modül federasyonu,
süreç içi betikler — hepsi düzenleyicinizle uzantının koduna
güvenmenizi gerektirir. Ayrıca uzantı ömürlerini düzenleyicinin
yapısına bağlarlar.

iframe'ler size şunları verir:

- **Kaynak izolasyonu**, tarayıcı zorunlu — sürdürülecek bir JS
  sandbox yok.
- **Bağımsız dağıtım döngüleri** — uzantılar kendi tempolarında
  yayınlanır.
- **Herhangi bir çerçeve** — React, Vue, Svelte, vanilla JS; ana
  bilgisayar umursamaz.
- **Geliştirme ve üretimde aynı kod** — geliştirme sunucusu
  düzenleyiciyi `localhost:3000`'de barındırır; uzantınıza
  `localhost:3001`'de işaret edersiniz. Aynı `?ext=` bayrağı, aynı
  protokol.

Takas, `postMessage`'ın asenkron olmasıdır. Bedava görünen çağrılar
(`getShapes()`) bir iframe gidiş-dönüşüne mal olur. SDK,
yapabildiği yerlerde toplar ve önbelleğe alır; bir çağrıyı sıkı bir
döngünün içine koymayın.

## Yerel geliştirme

`@drawtonomy/dev-server` paketi, ağ gidiş-dönüşü olmadan ona karşı
geliştirme yapabilmeniz için düzenleyiciyi yerel olarak sunar:

```bash
pnpm add -g @drawtonomy/dev-server
drawtonomy-dev-server                          # düzenleyici :3000'de
cd my-extension && pnpm dev --port 3001        # uzantı :3001'de
open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

Tam kılavuz genel depodadır:
[Uzantı Geliştirme Kılavuzu](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.md).

## Ayrıca bakın

- [Uzantı SDK API'si](/tr/extend/extension-sdk/)
- [`@drawtonomy/sdk` genel bakışı](/tr/reference/sdk/)
