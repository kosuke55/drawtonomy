---
title: Why drawtonomy
description: The problem space, the design priorities, and what drawtonomy is — and is not — trying to be.
---

drawtonomy is a whiteboard, not a CAD tool, not a simulator, not a map
editor. It exists in the gap between a sketch on a sticky note and a
fully-specified scenario file. This page explains the design choices
that follow from that.

## The gap it fills

Driving-scenario work happens at three levels:

1. **Sketches.** Whiteboard, paper, slide deck. Fast, lossy, ambiguous.
2. **Authoring tools.** OpenSCENARIO editors, road network editors,
   CAD-style packages. Precise, slow, expensive to learn.
3. **Simulators.** esmini, CARLA, in-house tools. Run the scenario,
   produce data.

Sketches are too lossy to feed level 3. Authoring tools are too heavy
for the early phase of "is this scenario interesting at all?". drawtonomy
sits between them: as fast as a sketch, but the output is real enough to
hand off.

## Design priorities

### Browser-only

No install, no project file format, no toolchain. Open a URL, draw,
download. This makes drawtonomy something you can throw at colleagues,
students, or pull into a meeting without friction.

### Editable everything

Every output format that drawtonomy produces preserves enough state to
be re-edited. `drawtonomy.svg` is the lossless canonical form; Lanelet2
round-trips through the SDK. AI-generated scenes drop in as plain
shapes you can tweak.

The principle: **never trap state in a format you can't read back.**

### Topology-aware

A road is not a bag of polylines. drawtonomy models lane connections
(Next / Previous / Left / Right) so that moving a boundary updates
neighbouring lanes, and so that exporters can emit a coherent
[OpenDRIVE](https://www.asam.net/standards/detail/opendrive/) network.
See [Lane connection model](/explanation/lane-model/).

### Headless when needed

The exporter and parser code is part of `@drawtonomy/sdk` and runs
without the editor. CI pipelines, browser extensions, and AI tools can
generate and validate scenes programmatically.

## What drawtonomy is not

- **Not a simulator.** It does not run scenarios. Export to esmini,
  CARLA, or your own tool for that.
- **Not a CAD tool.** It does not enforce engineering accuracy
  (clothoid splines, banking, elevation). Geometry is straightforward
  2D.
- **Not a real-time collaboration suite.** It is a single-user
  whiteboard. Save, share, re-open.

## See also

- [Lane connection model](/explanation/lane-model/)
- [Exporter architecture](/explanation/exporter-architecture/)
- [Extension architecture](/explanation/extension-architecture/)
