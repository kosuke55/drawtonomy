---
title: Estendendo o drawtonomy
description: Construa extensões, adicione formatos alvo, contribua com modelos.
sidebar:
  order: 0
---

O drawtonomy é construído para ser estendido. O mesmo SDK que
alimenta as extensões in-tree (AI Scene Generator, Template
Preview, Exporter Playground) é o que você usa.

## Escolha seu ponto de extensão

| Você quer… | Leia |
|---|---|
| Adicionar um painel, gerador ou ferramenta que roda ao lado do editor | [SDK de Extensões](/pt/extend/extension-sdk/) |
| Adicionar um novo alvo de exportação (CARLA, Unity, SUMO, …) | [SDK do Exportador](/pt/extend/exporter-sdk/) |
| Contribuir com um novo modelo SVG (veículo, pedestre, placa) | [Modelos](/pt/extend/templates/) |

## Onde está o código-fonte

Tudo está no
[repositório público do drawtonomy no GitHub](https://github.com/kosuke55/drawtonomy):

- `packages/drawtonomy-sdk/` — o SDK
- `packages/drawtonomy-dev-server/` — editor local para desenvolvimento
- `extensions/` — extensões in-tree, úteis como referências
- `templates/` — modelos de forma integrados

PRs são bem-vindos. O
[Guia de Modelos](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md)
percorre a adição de uma forma personalizada de ponta a ponta.
