---
title: Arquitetura do exportador
description: Como uma tela vira um snapshot, e um snapshot vira um arquivo.
---

O exportador é a ponte entre os dados internos do drawtonomy e
formatos externos — OpenDRIVE, OpenSCENARIO, Lanelet2 ou o que
você plugar a seguir. Entender o pipeline é pré-requisito para
adicionar um novo formato alvo.

## O pipeline

```
Estado do editor ──► DrawtonomySnapshot ──► Exportador ──► Arquivo / blob
                       (serializável)        (puro)
```

### 1. `DrawtonomySnapshot`

Um snapshot é um objeto simples: uma lista de formas mais um
carimbo de versão e um timestamp. É serializável, não tem
referências ao DOM, e é a única entrada que o exportador recebe.

```ts
interface DrawtonomySnapshot {
  version: string
  timestamp: string
  shapes: BaseShape[]
}
```

Você constrói um snapshot com `createSnapshot(shapes)`, ou
analisando um `drawtonomy.svg` salvo com `parseDrawtonomySvg(svg)`.

### 2. Os módulos do exportador

Cada formato alvo é uma função pura separada:

- `exporter.exportToOpenDrive(snapshot, options) → string` (XML)
- `exporter.exportToOpenScenario(snapshot, options) → string` (XML)
- `exporter.exportToLanelet2(snapshot, options) → string` (XML OSM)
- `exporter.buildEsminiZip(snapshot, options) → { blob, baseName }`

Eles recebem um snapshot, retornam uma string ou um blob. Sem
acesso ao editor, sem DOM, sem dependências assíncronas. Mesma
entrada, mesma saída.

### 3. Round-trip

Para Lanelet2, o SDK também traz um parser:

- `exporter.parseOsmXml(osm) → ParsedOsm`
- `exporter.osmToShapes(parsed) → BaseShape[]`

Isso é o que alimenta o fluxo de
[importação Lanelet2](/pt/guides/import-lanelet2/).

## Por que funções puras

O exportador roda o mesmo caminho de código no navegador, em um
script Node de CI, em um pipeline no servidor ou em uma extensão
de navegador. Os testes rodam contra fixtures de snapshot sem
navegador headless.

É por isso que o exportador vive no `@drawtonomy/sdk` e não dentro
do editor — o editor depende do SDK, não o contrário.

## Adicionando um formato alvo

O exportador é o principal ponto de extensão para novos alvos —
CARLA, Unity, SUMO, DSLs personalizadas. A receita:

1. Adicione um novo módulo em `packages/drawtonomy-sdk/src/exporter/`.
2. Receba `DrawtonomySnapshot` na entrada, retorne uma string ou blob.
3. Adicione testes em `packages/drawtonomy-sdk/__tests__/exporter/`
   usando fixtures de snapshot.
4. Conecte um ponto de entrada de UI se você quiser que o menu
   Exportar do editor saiba sobre ele (opcional — muitos usuários
   o chamarão programaticamente).

O guia completo do desenvolvedor está no repositório público:
[Guia do Desenvolvedor do Exportador](https://github.com/kosuke55/drawtonomy/blob/main/docs/exporter.md).

## Veja também

- [Exportar para OpenDRIVE / OpenSCENARIO / esmini](/pt/guides/export-asam/) —
  o fluxo voltado ao usuário.
- [Visão geral do `@drawtonomy/sdk`](/pt/reference/sdk/)
- [API do SDK do Exportador](/pt/extend/exporter-sdk/)
