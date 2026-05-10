---
title: Arquitectura de extensiones
description: Cómo drawtonomy carga, aísla y se comunica con extensiones de terceros.
---

Las extensiones de drawtonomy no son plugins compilados en el
editor. Son aplicaciones web separadas cargadas en un iframe, que
se comunican con el host mediante `postMessage`. Esta página
explica por qué, y qué se deriva de esa elección.

## Carga

Una extensión es una URL que apunta a un `manifest.json`. El
usuario (o un deep-link) abre el editor con `?ext=<manifestUrl>`:

```
https://drawtonomy.com/?ext=https://my-extension.vercel.app/manifest.json
```

El editor obtiene el manifest, crea un iframe y carga el HTML de
entrada de la extensión. Se pueden cargar varias extensiones a la
vez con parámetros `?ext=` repetidos.

## Aislamiento

Las extensiones se ejecutan dentro de un iframe con su propio
origen. No pueden:

- Tocar el DOM del editor directamente.
- Leer el localStorage de drawtonomy.
- Cargar recursos más allá del CSP del host.

Pueden hacer lo que piden en el array `capabilities` del manifest
(`shapes:read`, `shapes:write`, `ui:panel`, …) y lo que
`postMessage` expone a través del `ExtensionClient` de
`@drawtonomy/sdk`.

Esto es intencional. Las extensiones son código de terceros; el
editor las trata como no fiables.

## Comunicación

El SDK envuelve `postMessage` en un `ExtensionClient` que te da
una API tipada y basada en promesas:

```ts
import { ExtensionClient } from '@drawtonomy/sdk'

const client = new ExtensionClient()
const shapes = await client.getShapes()
await client.addShapes(newShapes)
```

Internamente:

- La extensión envía una solicitud al iframe del host.
- El host valida contra las capabilities de la extensión.
- El host responde, o la solicitud se rechaza.

## Por qué iframes

Las alternativas — plugins estilo npm, federación de módulos de
Webpack, scripts en proceso — todas requieren confiar en el código
de la extensión con tu editor. También acoplan los tiempos de vida
de las extensiones a la build del editor.

Los iframes te dan:

- **Aislamiento de origen**, impuesto por el navegador — sin
  sandbox de JS que mantener.
- **Ciclos de despliegue independientes** — las extensiones se
  publican a su propio ritmo.
- **Cualquier framework** — React, Vue, Svelte, JS vanilla; al
  host no le importa.
- **Mismo código en dev y prod** — el servidor de desarrollo
  aloja el editor en `localhost:3000`; lo apuntas a tu extensión
  en `localhost:3001`. Misma flag `?ext=`, mismo protocolo.

La contrapartida es que `postMessage` es asíncrono. Llamadas que
parecen gratuitas (`getShapes()`) cuestan un round-trip de iframe.
El SDK agrupa y cachea cuando puede; no pongas una llamada dentro
de un bucle apretado.

## Desarrollo local

El paquete `@drawtonomy/dev-server` sirve el editor localmente para
que puedas desarrollar contra él sin un round-trip de red:

```bash
pnpm add -g @drawtonomy/dev-server
drawtonomy-dev-server                          # editor en :3000
cd my-extension && pnpm dev --port 3001        # extensión en :3001
open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

La guía completa está en el repo público:
[Guía de Desarrollo de Extensiones](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.md).

## Véase también

- [API SDK de extensiones](/es/extend/extension-sdk/)
- [Resumen de `@drawtonomy/sdk`](/es/reference/sdk/)
