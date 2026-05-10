---
title: Paleta kolorów
description: Klucze kolorów drawtonomy i ich wartości HEX.
---

drawtonomy używa palety w stylu Tailwind / Material: grey-100
(najjaśniejszy) do grey-900 (najciemniejszy), plus nazwane kolory.

## Skala szarości

| Klucz | HEX | Uwagi |
|---|---|---|
| `grey-100` | `#e6e6e6` | Najjaśniejszy. Domyślny dla Pojazdu (Prostego). |
| `grey-200` | `#cccccc` | |
| `grey-300` | `#b3b3b3` | Domyślny dla Pieszego (Idącego i Prostego). |
| `grey-400` | `#999999` | |
| `grey-500` | `#808080` | Środkowy szary. |
| `grey-600` | `#666666` | |
| `grey-700` | `#4d4d4d` | |
| `grey-800` | `#333333` | |
| `grey-900` | `#1a1a1a` | Najciemniejszy. |

Niższy numer = jaśniejszy. Pasuje to do konwencji Tailwind.

## Domyślne dla szablonów

| Szablon | Domyślny kolor |
|---|---|
| Pieszy (Idący) | `grey-300` |
| Pieszy (Prosty) | `grey-300` |
| Pojazd (Prosty) | `grey-100` |
| Inne kształty | `black` |

## Programistyczne ustawianie koloru

Użyj `resolveColor()` z SDK, aby skonwertować klucz na wartość HEX.
Szczegóły w [API SDK rozszerzeń](/pl/extend/extension-sdk/).
