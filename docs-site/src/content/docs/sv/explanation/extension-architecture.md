---
title: Tilläggsarkitektur
description: Hur drawtonomy laddar, isolerar och pratar med tredjepartstillägg.
---

drawtonomy-tillägg är inte plugins kompilerade in i redigeraren.
De är separata webbappar laddade i en iframe, som kommunicerar
med värden via `postMessage`. Den här sidan förklarar varför, och
vad som faller ut av det valet.

## Laddning

Ett tillägg är en URL som pekar på en `manifest.json`. Användaren
(eller en deeplink) öppnar redigeraren med `?ext=<manifestUrl>`:

```
https://drawtonomy.com/?ext=https://my-extension.vercel.app/manifest.json
```

Redigeraren hämtar manifestet, skapar en iframe och laddar
tilläggets ingångs-HTML. Flera tillägg kan laddas samtidigt med
upprepade `?ext=`-parametrar.

## Isolering

Tillägg körs inuti en iframe med sin egen origin. De kan inte:

- Röra redigerarens DOM direkt.
- Läsa drawtonomys localStorage.
- Ladda resurser förbi värdens CSP.

De kan göra vad de begär i manifestets `capabilities`-array
(`shapes:read`, `shapes:write`, `ui:panel`, …) och vad
`postMessage` exponerar via `@drawtonomy/sdk`s `ExtensionClient`.

Detta är avsiktligt. Tillägg är tredjepartskod; redigeraren
behandlar dem som otillförlitliga.

## Kommunikation

SDK:n omsluter `postMessage` i en `ExtensionClient` som ger dig
ett typat, promise-baserat API:

```ts
import { ExtensionClient } from '@drawtonomy/sdk'

const client = new ExtensionClient()
const shapes = await client.getShapes()
await client.addShapes(newShapes)
```

Under huven:

- Tillägget skickar en begäran till värd-iframen.
- Värden validerar mot tilläggets capabilities.
- Värden svarar, eller begäran avvisas.

## Varför iframes

Alternativen — npm-stilplugins, Webpack module federation,
in-process-skript — kräver alla att man litar på tilläggets kod
med din redigerare. De kopplar också tilläggens livstider till
redigerarens build.

iframes ger dig:

- **Origin-isolering**, browser-tvingad — ingen JS-sandlåda att
  underhålla.
- **Oberoende deploycykler** — tillägg levereras i sin egen takt.
- **Vilket ramverk som helst** — React, Vue, Svelte, vanilla JS;
  värden bryr sig inte.
- **Samma kod i utveckling och produktion** —
  utvecklingsservern hostar redigeraren på `localhost:3000`; du
  pekar den på ditt tillägg på `localhost:3001`. Samma `?ext=`-flagga,
  samma protokoll.

Avvägningen är att `postMessage` är asynkront. Anrop som ser ut
att vara gratis (`getShapes()`) kostar en iframe-rundresa. SDK:n
batchar och cachar där den kan; lägg inte ett anrop i en tight
loop.

## Lokal utveckling

Paketet `@drawtonomy/dev-server` serverar redigeraren lokalt så
att du kan utveckla mot den utan en nätverksrundresa:

```bash
pnpm add -g @drawtonomy/dev-server
drawtonomy-dev-server                          # redigerare på :3000
cd my-extension && pnpm dev --port 3001        # tillägg på :3001
open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

Den fullständiga guiden finns i det publika arkivet:
[Extension Development Guide](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.md).

## Se även

- [Extension SDK API](/sv/extend/extension-sdk/)
- [`@drawtonomy/sdk`-översikt](/sv/reference/sdk/)
