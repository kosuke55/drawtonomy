---
title: Extending drawtonomy
description: Build extensions, add target formats, contribute templates.
sidebar:
  order: 0
---

drawtonomy is built to be extended. The same SDK that powers the
in-tree extensions (AI Scene Generator, Template Preview, Exporter
Playground) is what you use.

## Pick your extension point

| You want to… | Read |
|---|---|
| Add a panel, generator, or tool that runs alongside the editor | [Extension SDK](/extend/extension-sdk/) |
| Add a new export target (CARLA, Unity, SUMO, …) | [Exporter SDK](/extend/exporter-sdk/) |
| Contribute a new SVG template (vehicle, pedestrian, sign) | [Templates](/extend/templates/) |

## Where the source lives

Everything is in the public
[drawtonomy GitHub repository](https://github.com/kosuke55/drawtonomy):

- `packages/drawtonomy-sdk/` — the SDK
- `packages/drawtonomy-dev-server/` — local editor for development
- `extensions/` — in-tree extensions, useful as references
- `templates/` — built-in shape templates

PRs are welcome. The
[Template Guide](https://github.com/kosuke55/drawtonomy/blob/main/templates/TEMPLATE_GUIDE.md)
walks through adding a custom shape end-to-end.
