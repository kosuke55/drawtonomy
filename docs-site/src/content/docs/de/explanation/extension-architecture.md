---
title: Erweiterungs-Architektur
description: Wie drawtonomy Erweiterungen lädt, isoliert und mit ihnen kommuniziert.
keywords:
  - drawtonomy Erweiterungen
  - Extension SDK
  - postMessage iframe
  - drawtonomy Plugin
  - Whiteboard für autonomes Fahren
  - Browser-Erweiterung Spureditor
---

drawtonomy-Erweiterungen sind keine Plugins, die in den Editor
einkompiliert werden. Sie sind eigenständige Web-Apps, die in einen
Iframe geladen werden und mit dem Host über `postMessage`
kommunizieren. Diese Seite erklärt, warum, und welche Konsequenzen
sich daraus ergeben.

## Laden

Eine Erweiterung ist eine URL, die auf eine `manifest.json` zeigt.
Der Anwender (oder ein Deep-Link) öffnet den Editor mit
`?ext=<manifestUrl>`:

```
https://drawtonomy.com/?ext=https://my-extension.vercel.app/manifest.json
```

Der Editor holt das Manifest, erzeugt einen Iframe und lädt das
Einstiegs-HTML der Erweiterung. Mehrere Erweiterungen lassen sich
gleichzeitig mit wiederholten `?ext=`-Parametern laden.

## Isolation

Erweiterungen laufen in einem Iframe mit eigener Origin. Sie
können nicht:

- Das DOM des Editors direkt anfassen.
- Den localStorage von drawtonomy lesen.
- Ressourcen jenseits der CSP des Hosts laden.

Sie dürfen, was sie im `capabilities`-Array des Manifests anfordern
(`shapes:read`, `shapes:write`, `ui:panel`, …) und was
`postMessage` über den `ExtensionClient` von `@drawtonomy/sdk`
freigibt.

Das ist beabsichtigt. Erweiterungen sind Drittanbieter-Code; der
Editor behandelt sie als nicht vertrauenswürdig.

## Kommunikation

Das SDK kapselt `postMessage` in einem `ExtensionClient`, der eine
typisierte, Promise-basierte API bietet:

```ts
import { ExtensionClient } from '@drawtonomy/sdk'

const client = new ExtensionClient()
const shapes = await client.getShapes()
await client.addShapes(newShapes)
```

Im Hintergrund:

- Die Erweiterung schickt eine Anfrage an den Host-Iframe.
- Der Host validiert gegen die Capabilities der Erweiterung.
- Der Host antwortet — oder die Anfrage wird abgelehnt.

## Warum Iframes

Die Alternativen — npm-Style-Plugins, Webpack Module Federation,
In-Process-Skripte — verlangen alle, dem Code der Erweiterung mit
Ihrem Editor zu vertrauen. Sie koppeln auch die Lebenszeit der
Erweiterung an den Build des Editors.

Iframes bieten:

- **Origin-Isolation**, vom Browser erzwungen — keine
  JS-Sandbox zu pflegen.
- **Unabhängige Deploy-Zyklen** — Erweiterungen veröffentlichen
  in eigenem Tempo.
- **Beliebiges Framework** — React, Vue, Svelte, Vanilla JS;
  dem Host ist es egal.
- **Gleicher Code in Dev und Prod** — der Dev-Server hostet den
  Editor auf `localhost:3000`; Sie verweisen auf Ihre Erweiterung
  auf `localhost:3001`. Gleicher `?ext=`-Parameter, gleiches
  Protokoll.

Der Kompromiss: `postMessage` ist asynchron. Aufrufe, die
kostenlos aussehen (`getShapes()`), kosten einen
Iframe-Roundtrip. Das SDK bündelt und cached, wo es kann; setzen
Sie keinen Aufruf in eine enge Schleife.

## Lokale Entwicklung

Das Paket `@drawtonomy/dev-server` stellt den Editor lokal bereit,
sodass Sie ohne Netzwerk-Roundtrip dagegen entwickeln können:

```bash
pnpm add -g @drawtonomy/dev-server
drawtonomy-dev-server                          # Editor auf :3000
cd my-extension && pnpm dev --port 3001        # Erweiterung auf :3001
open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

Die vollständige Anleitung liegt im öffentlichen Repo:
[Extension Development Guide](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.md).

## Siehe auch

- [Extension-SDK-API](/de/extend/extension-sdk/)
- [`@drawtonomy/sdk`-Übersicht](/de/reference/sdk/)
