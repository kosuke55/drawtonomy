---
title: Paleta de cores
description: As chaves de cor do drawtonomy e seus valores HEX.
---

O drawtonomy usa uma paleta no estilo Tailwind / Material: grey-100 (mais clara)
até grey-900 (mais escura), mais cores nomeadas.

## Tons de cinza

| Chave | HEX | Notas |
|---|---|---|
| `grey-100` | `#e6e6e6` | Mais clara. Padrão para Veículo (Simple). |
| `grey-200` | `#cccccc` | |
| `grey-300` | `#b3b3b3` | Padrão para Pedestre (Walking & Simple). |
| `grey-400` | `#999999` | |
| `grey-500` | `#808080` | Cinza médio. |
| `grey-600` | `#666666` | |
| `grey-700` | `#4d4d4d` | |
| `grey-800` | `#333333` | |
| `grey-900` | `#1a1a1a` | Mais escura. |

Número menor = mais clara. Isso segue a convenção do Tailwind.

## Padrões dos modelos

| Modelo | Cor padrão |
|---|---|
| Pedestre (Walking) | `grey-300` |
| Pedestre (Simple) | `grey-300` |
| Veículo (Simple) | `grey-100` |
| Outras formas | `black` |

## Definindo cor programaticamente

Use o `resolveColor()` do SDK para converter uma chave em um valor
HEX. Veja a [API do SDK de Extensões](/pt/extend/extension-sdk/) para detalhes.
