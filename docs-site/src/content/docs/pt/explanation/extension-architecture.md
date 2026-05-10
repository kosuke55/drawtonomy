---
title: Arquitetura de extensões
description: Como o drawtonomy carrega, isola e conversa com extensões de terceiros.
---

As extensões do drawtonomy não são plugins compilados no editor.
São aplicações web separadas carregadas em um iframe, comunicando-se
com o host através de `postMessage`. Esta página explica por quê e
o que decorre dessa escolha.

## Carregamento

Uma extensão é uma URL que aponta para um `manifest.json`. O
usuário (ou um deep-link) abre o editor com `?ext=<manifestUrl>`:

```
https://drawtonomy.com/?ext=https://my-extension.vercel.app/manifest.json
```

O editor busca o manifesto, cria um iframe e carrega o HTML de
entrada da extensão. Várias extensões podem ser carregadas ao
mesmo tempo com parâmetros `?ext=` repetidos.

## Isolamento

As extensões rodam dentro de um iframe com sua própria origem.
Elas não podem:

- Tocar o DOM do editor diretamente.
- Ler o localStorage do drawtonomy.
- Carregar recursos além do CSP do host.

Elas podem fazer o que pedem no array `capabilities` do manifesto
(`shapes:read`, `shapes:write`, `ui:panel`, …) e o que o
`postMessage` expõe através do `ExtensionClient` do
`@drawtonomy/sdk`.

Isso é intencional. Extensões são código de terceiros; o editor as
trata como não confiáveis.

## Comunicação

O SDK envolve `postMessage` em um `ExtensionClient` que dá uma API
tipada baseada em promises:

```ts
import { ExtensionClient } from '@drawtonomy/sdk'

const client = new ExtensionClient()
const shapes = await client.getShapes()
await client.addShapes(newShapes)
```

Por baixo dos panos:

- A extensão posta uma requisição para o iframe host.
- O host valida contra as capacidades da extensão.
- O host responde, ou a requisição é rejeitada.

## Por que iframes

As alternativas — plugins estilo npm, federação de módulos
Webpack, scripts in-process — todas exigem confiar no código da
extensão com seu editor. Elas também acoplam os tempos de vida das
extensões ao build do editor.

Iframes oferecem:

- **Isolamento de origem**, imposto pelo navegador — sem sandbox
  JS para manter.
- **Ciclos de deploy independentes** — extensões lançam no seu
  próprio ritmo.
- **Qualquer framework** — React, Vue, Svelte, JS puro; o host
  não se importa.
- **Mesmo código em dev e prod** — o servidor de desenvolvimento
  hospeda o editor em `localhost:3000`; você o aponta para sua
  extensão em `localhost:3001`. Mesma flag `?ext=`, mesmo
  protocolo.

A contrapartida é que `postMessage` é assíncrono. Chamadas que
parecem grátis (`getShapes()`) custam um round-trip de iframe. O
SDK agrupa e cacheia onde pode; não coloque uma chamada dentro de
um loop apertado.

## Desenvolvimento local

O pacote `@drawtonomy/dev-server` serve o editor localmente para
que você possa desenvolver contra ele sem um round-trip de rede:

```bash
pnpm add -g @drawtonomy/dev-server
drawtonomy-dev-server                          # editor em :3000
cd my-extension && pnpm dev --port 3001        # extensão em :3001
open "http://localhost:3000/?ext=http://localhost:3001/manifest.json"
```

O guia completo está no repositório público:
[Guia de Desenvolvimento de Extensões](https://github.com/kosuke55/drawtonomy/blob/main/docs/extensions.md).

## Veja também

- [API do SDK de Extensões](/pt/extend/extension-sdk/)
- [Visão geral do `@drawtonomy/sdk`](/pt/reference/sdk/)
