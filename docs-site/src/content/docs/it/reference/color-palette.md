---
title: Palette dei colori
description: Le chiavi di colore di drawtonomy e i loro valori HEX.
---

drawtonomy usa una palette in stile Tailwind / Material:
grey-100 (più chiaro) fino a grey-900 (più scuro), più colori
con nome.

## Scala di grigi

| Chiave | HEX | Note |
|---|---|---|
| `grey-100` | `#e6e6e6` | Più chiaro. Default per Vehicle (Simple). |
| `grey-200` | `#cccccc` | |
| `grey-300` | `#b3b3b3` | Default per Pedestrian (Walking & Simple). |
| `grey-400` | `#999999` | |
| `grey-500` | `#808080` | Grigio medio. |
| `grey-600` | `#666666` | |
| `grey-700` | `#4d4d4d` | |
| `grey-800` | `#333333` | |
| `grey-900` | `#1a1a1a` | Più scuro. |

Numero più basso = più chiaro. Corrisponde alla convenzione di
Tailwind.

## Default dei template

| Template | Colore predefinito |
|---|---|
| Pedestrian (Walking) | `grey-300` |
| Pedestrian (Simple) | `grey-300` |
| Vehicle (Simple) | `grey-100` |
| Altre forme | `black` |

## Impostare il colore programmaticamente

Usa `resolveColor()` dell'SDK per convertire una chiave in un
valore HEX. Vedi l'[API SDK delle estensioni](/it/extend/extension-sdk/)
per i dettagli.
