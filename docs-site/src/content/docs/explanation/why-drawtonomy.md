---
title: Why drawtonomy — a whiteboard built for driving scenarios
description: Why drawtonomy exists and the design choices behind it. Built specifically for driving scenarios — the figures that go into autonomous-driving papers, slide decks, design reviews, and scenario authoring.
keywords:
  - why drawtonomy
  - whiteboard for driving scenarios
  - autonomous driving diagram tool
  - figure tool for AV research papers
  - autonomous driving illustration software
  - alternative to slide tools for road diagrams
  - whiteboard for autonomous driving teams
---

drawtonomy is a whiteboard built specifically for driving
scenarios. Most teams sketch these diagrams today in generic
drawing tools or slide decks — those work fine for general
shapes, but they don't know what a lane is, so the geometry has
to be redrawn whenever the road turns, the intersection grows a
leg, or a crosswalk needs to line up with the road.

This page explains the design choices that follow from leading
with "whiteboard for driving scenarios" rather than "tool that
exports to a simulator".

## The problem it's built around

Most actual autonomous-driving communication happens through
diagrams: in papers, design reviews, planning meetings, incident
write-ups, classrooms, and slide decks. The diagram is the
artefact people look at, argue about, and remember.

Generic drawing tools at that level only give you generic shapes.
A lane is a rectangle you redraw every time the road turns; a
crosswalk is a stack of rectangles you keep aligning by hand; an
intersection is a half hour of fiddling. Worse, the moment the
road geometry changes — and on AV work it changes constantly —
you start over.

drawtonomy exists to make that loop fast. The building blocks the
domain actually has — lanes, intersections, crosswalks, traffic
lights, road markings, vehicles, pedestrians — are first-class
shapes, so the figure stays correct as you iterate.

## Where drawtonomy sits

Driving-scenario work happens at a few different levels:

1. **Diagrams.** Papers, slides, whiteboard sketches, design-doc
   figures, classroom material. Fast and easy in principle, but
   in a generic tool the road geometry has to be rebuilt every
   time something moves.
2. **Authoring tools.** OpenSCENARIO editors, road-network
   editors, CAD-style packages. Precise, slow, expensive to
   learn.
3. **Simulators.** esmini, CARLA, in-house tools. Run the
   scenario, produce data.

drawtonomy lives at level 1, and crosses into level 2 when you
need to: import a Lanelet2 map, sketch changes, export
OpenDRIVE/OpenSCENARIO, hand the result to esmini.

## Design priorities

### Whiteboard-first

The point of comparison is a quick whiteboard or slide-deck
sketch, not a CAD tool. That sets the bar for friction: open a
URL, draw, share. No install, no account, no project file format.
Anything that would make drawtonomy feel heavier than a quick
sketch gets cut.

### Topology-aware

A road is not a bag of polylines. drawtonomy models lane
connections (Next / Previous / Left / Right) so that moving a
boundary updates neighbouring lanes automatically. Two lanes that
share a boundary share the same boundary points — drag once, both
move. See [Lane connection model](/explanation/lane-model/).

### Driving-domain templates

Vehicles (sedan, bus, truck, motorcycle…), pedestrians (walking,
simple), traffic lights for vehicles and pedestrians, crosswalks,
road markings, signs, intersection templates. They're built-in
shapes rather than generic-rectangle approximations. Custom SVG
templates can be added by PR.

### Editable on the way out as well as in

Every output format drawtonomy produces preserves enough state to
be re-edited. `drawtonomy.svg` is the lossless canonical form: a
regular SVG that previews everywhere (browsers, GitHub, slide
decks, paper figures) and reopens in drawtonomy with every
connection and overlap relationship intact. Nothing is trapped in
a format you can't read back.

### Headless when needed

The exporter and parser code is part of `@drawtonomy/sdk` and
runs without the editor. CI pipelines, browser extensions, and AI
tools can generate and validate scenes programmatically.

## Bridges to the rest of the workflow

Once you have a diagram, you usually want to do something with
it. drawtonomy ships several bridges so the figure doesn't stay
locked inside the editor:

- **`drawtonomy.svg`** — the default. Embed in papers, slides,
  Markdown docs; reopen later to keep editing.
- **Lanelet2 round-trip** — open a Lanelet2 OSM map (including
  Autoware sample maps), edit, export back. Useful for sketching
  changes against an existing HD map.
- **ASAM export** — OpenDRIVE 1.8 + OpenSCENARIO 1.3, optionally
  bundled as an [esmini](https://github.com/esmini/esmini)-ready
  zip.
- **AI Scene Generator** — describe a scenario in natural
  language, or paste OpenSCENARIO XML, and get an editable canvas
  to start refining from.

These bridges are useful, but the diagram itself is the reason
drawtonomy exists. A figure in drawtonomy is already valuable as
a figure; these formats let it flow into the next stage of the
workflow when needed.

## What drawtonomy is not

- **Not a simulator.** It doesn't run scenarios. Export to
  esmini, CARLA, or your own tool for that.
- **Not a CAD tool.** It doesn't enforce engineering accuracy
  (clothoid splines, banking, elevation). Geometry is
  straightforward 2D.
- **Not a real-time collaboration suite.** It's a single-user
  editor. Save, share, reopen.

## See also

- [Lane connection model](/explanation/lane-model/)
- [Exporter architecture](/explanation/exporter-architecture/)
- [Extension architecture](/explanation/extension-architecture/)
