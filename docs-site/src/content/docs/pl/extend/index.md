---
title: Rozszerzanie drawtonomy
description: Buduj rozszerzenia, dodawaj formaty docelowe, wnos szablony.
sidebar:
  order: 0
---

drawtonomy jest zbudowany do rozszerzania. Tego samego SDK, który
zasila wbudowane rozszerzenia (Generator Sceny AI, Podgląd Szablonów,
Plac zabaw eksportera), używasz ty.

## Wybierz swój punkt rozszerzenia

| Chcesz… | Czytaj |
|---|---|
| Dodać panel, generator lub narzędzie działające obok edytora | [SDK rozszerzeń](/pl/extend/extension-sdk/) |
| Dodać nowy cel eksportu (CARLA, Unity, SUMO, …) | [Exporter SDK](/pl/extend/exporter-sdk/) |
| Wnieść nowy szablon SVG (pojazd, pieszy, znak) | [Szablony](/pl/extend/templates/) |

## Gdzie żyje źródło

Wszystko jest w publicznym
[repozytorium drawtonomy na GitHub](https://github.com/kosuke55/drawtonomy):

- `packages/drawtonomy-sdk/` — SDK
- `packages/drawtonomy-dev-server/` — lokalny edytor do rozwoju
- `extensions/` — wbudowane rozszerzenia, przydatne jako referencje
- `templates/` — wbudowane szablony kształtów

PR-y są mile widziane.
[Przewodnik Szablonów](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md)
prowadzi przez dodawanie niestandardowego kształtu od początku do
końca.
