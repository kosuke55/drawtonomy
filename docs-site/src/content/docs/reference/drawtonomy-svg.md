---
title: drawtonomy.svg format
description: The on-disk structure of a re-editable drawtonomy file.
---

A `drawtonomy.svg` file is a regular SVG augmented with metadata that
records the editor-only state.

## Structure

- The visual content (paths, text, images) is plain SVG. Any SVG viewer
  renders it correctly.
- A `<metadata>` block at the top of the document holds the
  drawtonomy-specific data:
  - shape IDs and per-shape props (template, style, etc.)
  - lane connection slots (`next`, `previous`, `left`, `right`)
  - shared-point references
  - footprint group membership
  - z-order

## Compatibility

Editing a `drawtonomy.svg` in a generic SVG editor (Illustrator, Inkscape,
the browser) loses the metadata block on save unless you preserve it
explicitly. drawtonomy can still open the result, but connections and
shared points will be missing.

For round-trippable edits outside drawtonomy, use the SDK
([`@drawtonomy/sdk`](/reference/sdk/)) — it can read and write the format
without going through the editor.

## Versioning

Older files are migrated automatically on import. The `resolveColorKey()`
helper in the SDK converts legacy color keys (e.g. v1.x `grey-700`) to
the current ones.

## See also

- [Save and re-edit (drawtonomy.svg)](/guides/export-drawtonomy-svg/)
- [`@drawtonomy/sdk` overview](/reference/sdk/)
