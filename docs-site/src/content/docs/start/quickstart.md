---
title: Quickstart
description: Draw your first lane, place a vehicle, and export — in five minutes.
sidebar:
  order: 2
---

This page gets you from "I just opened the app" to "I have an exported scene"
in a few minutes. No installation needed.

## 1. Open the app

Go to [drawtonomy.com](https://drawtonomy.com). Everything runs in the
browser; nothing is uploaded anywhere.

## 2. Draw a lane

1. Press <kbd>N</kbd> (or click the **Lane** tool in the toolbar).
2. Click on the canvas to place the start of the centerline, click again
   for the next vertex, then press <kbd>Enter</kbd> to finish.
3. drawtonomy generates left and right boundaries automatically.

:::tip
You can keep clicking to extend the centerline. Hold <kbd>Shift</kbd>
while drawing to temporarily disable [snapping](/guides/snap/).
:::

## 3. Place a vehicle

1. Press <kbd>P</kbd> to open the **Participants** tool.
2. Pick **Vehicle → Sedan** and click on the lane you just drew.
3. Drag a corner handle to resize, or use the rotation handle to face it
   along the lane.

## 4. Export the scene

Open the export menu and pick a format:

- **PNG / SVG / PDF** — share as an image.
- **drawtonomy.svg** — keep every connection so you (or a teammate) can
  re-edit it later.
- **Export for esmini** — produce a zip with OpenDRIVE + OpenSCENARIO
  ready to play in [esmini](https://github.com/esmini/esmini).

See the [export how-tos](/guides/export-image/) for details on each format.

## What next?

- Try a longer lesson: [Build a 3-lane intersection](/tutorials/three-lane-intersection/).
- Browse the [how-to guides](/guides/) for tasks like
  [generating lanes from a satellite map](/guides/lane-from-map/) or
  [importing a Lanelet2 file](/guides/import-lanelet2/).
- If you want to build extensions, jump to [Extending drawtonomy](/extend/).
