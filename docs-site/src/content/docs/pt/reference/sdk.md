---
title: 'Visão geral do @drawtonomy/sdk'
description: Pacotes, pontos de entrada e como o SDK se encaixa com o editor.
---

`@drawtonomy/sdk` é o pacote contra o qual autores de extensões e
ferramentas headless desenvolvem. Ele expõe:

| Módulo | Finalidade |
|---|---|
| `ExtensionClient` | Cliente postMessage para extensões hospedadas em iframe. |
| Funções de fábrica de formas | `createLane()`, `createVehicle()`, etc. |
| `createSnapshot()` | Constrói um `DrawtonomySnapshot` a partir de um array de formas. |
| `exporter.*` | Funções puras que transformam um snapshot em OpenDRIVE / OpenSCENARIO / pacote zip esmini / OSM Lanelet2. Inclui um parser Lanelet2. |
| Tipos | `BaseShape`, `LaneShape`, `VehicleShape`, `DrawtonomySnapshot`, … |

## Instalar

```bash
pnpm add @drawtonomy/sdk
```

## Pacotes complementares

| Pacote | Finalidade |
|---|---|
| [`@drawtonomy/sdk`](https://www.npmjs.com/package/@drawtonomy/sdk) | O SDK em si. |
| [`@drawtonomy/dev-server`](https://www.npmjs.com/package/@drawtonomy/dev-server) | Servidor de desenvolvimento local que hospeda o editor para desenvolvimento de extensões. |

## Código-fonte

O código-fonte do SDK, testes e exemplos estão no
[repositório do drawtonomy no GitHub](https://github.com/kosuke55/drawtonomy/tree/main/packages/drawtonomy-sdk).

## Veja também

- [API do SDK de Extensões](/pt/extend/extension-sdk/) — construindo
  extensões iframe.
- [API do SDK do Exportador](/pt/extend/exporter-sdk/) — adicionando
  novos formatos alvo.
