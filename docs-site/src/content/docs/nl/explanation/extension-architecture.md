---
title: Extensie-architectuur
description: Hoe drawtonomy externe extensies laadt, isoleert en met ze communiceert.
---

drawtonomy-extensies zijn geen plug-ins die in de editor zijn
gecompileerd. Het zijn aparte web-apps die in een iframe worden
geladen en met de host communiceren via `postMessage`. Deze
pagina legt uit waarom, en wat daaruit volgt.

## Laden

Een extensie is een URL die naar een `manifest.json` verwijst. De
gebruiker (of een deeplink) opent de editor met
`?ext=<manifestUrl>`:

```
https://drawtonomy.com/?ext=https://my-extension.vercel.app/manifest.json
```

De editor haalt de manifest op, maakt een iframe en laadt de
entry-HTML van de extensie. Meerdere extensies kunnen tegelijk
worden geladen met herhaalde `?ext=`-parameters.

## Isolatie

Extensies draaien in een iframe met hun eigen origin. Ze kunnen
niet:

- De DOM van de editor direct aanraken.
- De localStorage van drawtonomy lezen.
- Resources laden buiten de CSP van de host.

Ze kunnen doen wat ze in de `capabilities`-array van het manifest
aanvragen (`shapes:read`, `shapes:write`, `ui:panel`, …) en wat
`postMessage` blootstelt via de `ExtensionClient` van
`@drawtonomy/sdk`.

Dit is opzettelijk. Extensies zijn third-party code; de editor
behandelt ze als niet-vertrouwd.

## Communicatie

De SDK verpakt `postMessage` in een `ExtensionClient` die u een
getypeerde, op promises gebaseerde API geeft:

```ts
import { ExtensionClient } from '@drawtonomy/sdk'

const client = new ExtensionClient()
const shapes = await client.getShapes()
await client.addShapes(newShapes)
```

Achter de schermen:

- De extensie post een verzoek naar de host-iframe.
- De host valideert tegen de capabilities van de extensie.
- De host antwoordt, of het verzoek wordt afgewezen.

## Waarom iframes

De alternatieven — npm-stijl plug-ins, Webpack module federation,
in-process scripts — vereisen allemaal dat u de code van de
extensie met uw editor vertrouwt. Ze koppelen ook de levensduur
van extensies aan de build van de editor.

iframes geven u:

- **Origin-isolatie**, browser-afgedwongen — geen JS-sandbox om
  te onderhouden.
- **Onafhankelijke deployment-cycli** — extensies leveren in hun
  eigen tempo.
- **Elk framework** — React, Vue, Svelte, vanilla JS; de host
  geeft er niet om.
- **Dezelfde code in dev en prod** — de dev-server host de editor
  op `localhost:3000`; u wijst hem aan uw extensie op
  `localhost:3001`. Zelfde `?ext=`-vlag, zelfde protocol.

De afweging is dat `postMessage` async is. Aanroepen die gratis
lijken (`getShapes()`) kosten een iframe-roundtrip. De SDK
batcht en cachet waar het kan; plaats geen aanroep in een
strakke loop.

## Lokale ontwikkeling

Het pakket `@drawtonomy/dev-server` bedient de editor lokaal
zodat u ertegenaan kunt ontwikkelen zonder netwerk-roundtrip:

```bash
pnpm add -g @drawtonomy/dev-server
drawtonomy-dev-server                          # editor op :3000
cd my-extension && pnpm dev --port 3001        # extensie op :3001
open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

De volledige handleiding staat in de openbare repo:
[Extension Development Guide](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.md).

## Zie ook

- [Extensie-SDK API](/nl/extend/extension-sdk/)
- [`@drawtonomy/sdk`-overzicht](/nl/reference/sdk/)
