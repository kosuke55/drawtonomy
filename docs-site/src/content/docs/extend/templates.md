---
title: Contributing templates
description: Add a new vehicle, pedestrian, sign, or road marking template.
---

Templates are SVG files plus a manifest entry. Once contributed, they
appear in the editor's Participants and shape menus alongside the
built-in templates.

The contribution flow lives in the public repo:

➡ **[Template Guide](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md)**

## Categories

| Folder | Examples |
|---|---|
| `templates/vehicle/` | Sedan, Bus, Truck, Motorcycle |
| `templates/pedestrian/` | Walking, Simple |
| `templates/road_marking/` | Crosswalk, arrow markings |
| `templates/sign/` | Stop, yield, signal heads |
| `templates/other/` | Anything else |

## Process

1. Add your SVG under the right category folder.
2. Register it in `templates/manifest.json`.
3. Open a PR. Include a screenshot of the template placed on the canvas.

## What makes a good template

- Drawn at a sensible default size (vehicles around 4–5 m for a sedan).
- Single colour-changeable region marked with a known fill, so the
  Attribute Panel's colour picker can recolour it.
- No external font references — text is converted to paths if present.
- Reasonable file size (under ~30 KB for a vehicle-sized template).
