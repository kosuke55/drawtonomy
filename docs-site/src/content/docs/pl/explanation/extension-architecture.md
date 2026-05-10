---
title: Architektura rozszerzeń
description: Jak drawtonomy ładuje, izoluje i komunikuje się z rozszerzeniami stron trzecich.
---

Rozszerzenia drawtonomy nie są wtyczkami skompilowanymi w edytor. Są
osobnymi aplikacjami webowymi załadowanymi do iframe, komunikującymi
się z hostem przez `postMessage`. Ta strona wyjaśnia dlaczego i co z
tego wyboru wynika.

## Ładowanie

Rozszerzenie to URL wskazujący na `manifest.json`. Użytkownik (lub
głęboki link) otwiera edytor z `?ext=<manifestUrl>`:

```
https://drawtonomy.com/?ext=https://my-extension.vercel.app/manifest.json
```

Edytor pobiera manifest, tworzy iframe i ładuje wejściowy HTML
rozszerzenia. Wiele rozszerzeń można załadować naraz powtarzającymi
się parametrami `?ext=`.

## Izolacja

Rozszerzenia działają wewnątrz iframe z własnym pochodzeniem. Nie
mogą:

- Dotykać DOM edytora bezpośrednio.
- Czytać localStorage drawtonomy.
- Ładować zasobów poza CSP hosta.

Mogą robić to, o co proszą w tablicy `capabilities` manifestu
(`shapes:read`, `shapes:write`, `ui:panel`, …) i to, co `postMessage`
udostępnia przez `ExtensionClient` w `@drawtonomy/sdk`.

To celowe. Rozszerzenia to kod stron trzecich; edytor traktuje je
jako niezaufane.

## Komunikacja

SDK opakowuje `postMessage` w `ExtensionClient`, który daje ci
typowane API oparte na obietnicach:

```ts
import { ExtensionClient } from '@drawtonomy/sdk'

const client = new ExtensionClient()
const shapes = await client.getShapes()
await client.addShapes(newShapes)
```

Pod maską:

- Rozszerzenie wysyła żądanie do iframe hosta.
- Host sprawdza poprawność względem zdolności rozszerzenia.
- Host odpowiada lub żądanie jest odrzucane.

## Dlaczego iframe

Alternatywy — wtyczki w stylu npm, federacja modułów Webpack, skrypty
w procesie — wszystkie wymagają zaufania kodu rozszerzenia twojemu
edytorowi. Sprzęgają również okresy życia rozszerzeń z buildem
edytora.

iframe daje ci:

- **Izolację pochodzenia**, wymuszoną przez przeglądarkę — brak
  sandboxa JS do utrzymania.
- **Niezależne cykle wdrożenia** — rozszerzenia wydawane są we
  własnym tempie.
- **Dowolny framework** — React, Vue, Svelte, czysty JS; host nie
  dba.
- **Ten sam kod w dev i prod** — serwer dev hostuje edytor na
  `localhost:3000`; wskazujesz go na swoje rozszerzenie na
  `localhost:3001`. Ta sama flaga `?ext=`, ten sam protokół.

Kompromis polega na tym, że `postMessage` jest asynchroniczny.
Wywołania, które wyglądają na darmowe (`getShapes()`), kosztują
podróż w obie strony przez iframe. SDK wsadowo i buforuje, gdzie
może; nie umieszczaj wywołania w ciasnej pętli.

## Lokalny rozwój

Pakiet `@drawtonomy/dev-server` serwuje edytor lokalnie, więc możesz
rozwijać przeciwko niemu bez sieciowej podróży:

```bash
pnpm add -g @drawtonomy/dev-server
drawtonomy-dev-server                          # edytor na :3000
cd my-extension && pnpm dev --port 3001        # rozszerzenie na :3001
open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

Pełny przewodnik znajduje się w publicznym repo:
[Przewodnik Rozwoju Rozszerzeń](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.md).

## Zobacz także

- [API SDK rozszerzeń](/pl/extend/extension-sdk/)
- [Przegląd `@drawtonomy/sdk`](/pl/reference/sdk/)
