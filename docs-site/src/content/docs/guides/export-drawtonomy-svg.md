---
title: Save and re-edit (drawtonomy.svg)
description: The lossless format that preserves every shape, connection, and shared point.
---

`drawtonomy.svg` is a regular SVG file with extra metadata that records
lane connections, shared points, footprint groups, and style. Open it in
drawtonomy later and the scene comes back exactly as you left it.

## Export

1. Open the **File** menu → **Export**.
2. Pick **drawtonomy.svg**.

## Re-open

1. Open the **File** menu → **Import**.
2. Pick the `.svg` you saved earlier.

The metadata is read back; the editor reconstructs every connection.

## What gets preserved

- Lane connections (Next / Previous / Left / Right)
- Shared points across shapes
- Footprint groups
- Per-shape style (color, opacity, width, template variant)
- Shape z-order and grouping

## Compatibility with other SVG tools

Plain SVG viewers and editors (Illustrator, Inkscape, browsers) display
the file correctly because the metadata is stored in extra attributes
they ignore. They will not, however, understand connections or shared
points if you edit and re-export from those tools.

## See also

- [drawtonomy.svg format reference](/reference/drawtonomy-svg/) — the
  on-disk structure if you want to read or generate the format yourself.
