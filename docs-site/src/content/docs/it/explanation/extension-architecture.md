---
title: Architettura delle estensioni
description: Come drawtonomy carica, isola e dialoga con le estensioni di terze parti.
---

Le estensioni di drawtonomy non sono plugin compilati nell'editor.
Sono web app separate caricate in un iframe, che comunicano con
l'host tramite `postMessage`. Questa pagina spiega perché, e cosa
ne deriva da quella scelta.

## Caricamento

Un'estensione è un URL che punta a un `manifest.json`. L'utente
(o un deep-link) apre l'editor con `?ext=<manifestUrl>`:

```
https://drawtonomy.com/?ext=https://my-extension.vercel.app/manifest.json
```

L'editor recupera il manifest, crea un iframe e carica l'HTML di
ingresso dell'estensione. Più estensioni possono essere caricate
contemporaneamente con parametri `?ext=` ripetuti.

## Isolamento

Le estensioni girano dentro un iframe con la propria origine. Non
possono:

- Toccare direttamente il DOM dell'editor.
- Leggere il localStorage di drawtonomy.
- Caricare risorse oltre la CSP dell'host.

Possono fare ciò che chiedono nell'array `capabilities` del
manifest (`shapes:read`, `shapes:write`, `ui:panel`, …) e ciò che
`postMessage` espone tramite l'`ExtensionClient` di
`@drawtonomy/sdk`.

Questo è intenzionale. Le estensioni sono codice di terze parti;
l'editor le tratta come non affidabili.

## Comunicazione

L'SDK avvolge `postMessage` in un `ExtensionClient` che ti
fornisce un'API tipizzata e basata su promise:

```ts
import { ExtensionClient } from '@drawtonomy/sdk'

const client = new ExtensionClient()
const shapes = await client.getShapes()
await client.addShapes(newShapes)
```

Sotto il cofano:

- L'estensione invia una richiesta all'iframe host.
- L'host valida rispetto alle capabilities dell'estensione.
- L'host risponde, oppure la richiesta viene rifiutata.

## Perché gli iframe

Le alternative — plugin in stile npm, module federation di
Webpack, script in-process — richiedono tutte di fidarsi del
codice dell'estensione con il proprio editor. Accoppiano anche
i cicli di vita delle estensioni con la build dell'editor.

Gli iframe ti danno:

- **Isolamento dell'origine**, applicato dal browser — nessuna
  sandbox JS da mantenere.
- **Cicli di deploy indipendenti** — le estensioni rilasciano al
  proprio ritmo.
- **Qualsiasi framework** — React, Vue, Svelte, JS vanilla;
  all'host non importa.
- **Stesso codice in dev e prod** — il dev server ospita
  l'editor su `localhost:3000`; tu lo punti alla tua estensione
  su `localhost:3001`. Stesso flag `?ext=`, stesso protocollo.

Il compromesso è che `postMessage` è asincrono. Le chiamate che
sembrano gratuite (`getShapes()`) costano un round-trip
dell'iframe. L'SDK raggruppa e mette in cache dove può; non
metterle in un loop stretto.

## Sviluppo locale

Il pacchetto `@drawtonomy/dev-server` serve l'editor in locale
così puoi sviluppare contro di esso senza un round-trip di rete:

```bash
pnpm add -g @drawtonomy/dev-server
drawtonomy-dev-server                          # editor su :3000
cd my-extension && pnpm dev --port 3001        # estensione su :3001
open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

La guida completa è nel repo pubblico:
[Extension Development Guide](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.md).

## Vedi anche

- [API SDK delle estensioni](/it/extend/extension-sdk/)
- [Panoramica `@drawtonomy/sdk`](/it/reference/sdk/)
