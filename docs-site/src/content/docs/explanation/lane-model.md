---
title: Lane connection model
description: How drawtonomy represents road topology, and what that buys you.
---

A drawtonomy Lane is not just two boundaries and a centerline; it is a
node in a graph. The four connection slots — **Next**, **Previous**,
**Left**, **Right** — turn a pile of lanes into a road network.

## The four slots

| Slot | Meaning |
|---|---|
| **Next** | The lane that traffic on this lane flows into. |
| **Previous** | The lane that flows into this lane. |
| **Left** | The lane immediately to the left, sharing a boundary. |
| **Right** | The lane immediately to the right, sharing a boundary. |

Connections are **bidirectional**: setting Lane A's Next to B also sets
B's Previous to A. The editor maintains this invariant for you.

## What connections enable

### Coordinated editing

When two lanes share a boundary (because they are Left/Right neighbours,
or because Next/Previous lanes meet end-to-end), the boundary is a
single object. Drag a point on it and both lanes update.

This means you do not have to repair geometry every time you tweak a
lane: the topology already says what is glued to what.

### Coherent export

[OpenDRIVE](https://www.asam.net/standards/detail/opendrive/) and
[Lanelet2](https://github.com/fzi-forschungszentrum-informatik/Lanelet2)
both encode lane connectivity. drawtonomy's exporters use the connection
slots directly — no inference, no heuristics that break on edge cases.
A scene that looks right in the editor exports as a real road network,
not a bag of polylines.

### Round-trip with imports

The Lanelet2 importer reads the same connection model from `.osm`
files. You can edit a Lanelet2 map in drawtonomy and export it back
without losing topology.

## When connections are inferred

drawtonomy sets connections automatically when the intent is obvious:

- Drawing a lane that starts on an existing lane's endpoint → **Previous**.
- Using the parallel-lane shortcut (<kbd>Alt</kbd>+click with the Lane
  tool) → **Left** or **Right**.
- Placing an [intersection template](/guides/participants/) → all
  approach lanes pre-connected.
- [Lane Generator](/guides/lane-from-map/) → connections inferred from
  OSM topology where unambiguous.

For everything else, set them by hand in the Attribute Panel — see
[Manage lane connections](/guides/lane-connections/).

## What connections do not encode

- **Direction of travel** is implied by Next/Previous, but not encoded
  separately. Bidirectional roads are modelled as two opposing lanes
  with their own Next/Previous chains.
- **Turn restrictions** at intersections are not modelled in drawtonomy
  itself. They appear in the OpenDRIVE/OpenSCENARIO export through the
  intersection template that produced them.
- **Speed limits, surface type, lighting** — none of these. drawtonomy
  is geometry + topology; semantic attributes are out of scope.

## See also

- [Manage lane connections](/guides/lane-connections/) — the editor steps.
- [drawtonomy.svg format](/reference/drawtonomy-svg/) — how connections
  are persisted on save.
