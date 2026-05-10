---
title: Snap & point sharing
description: Two related but different mechanisms for keeping shapes aligned.
---

Snapping and point sharing both deal with "this point goes on that
thing." They look similar in the UI, but they have different
consequences. Mixing them up is the most common source of "why did my
shapes drift?" bugs.

## Snap = same coordinate

Snapping moves your cursor (or a vertex you are dragging) to land on an
existing target. The result is two distinct points that *happen* to
share coordinates.

If you later move the original target, your snapped point does **not**
follow. They were never linked.

This is what you want when you are sketching: precise alignment, no
hidden coupling.

## Sharing = same identity

A shared point is one object referenced by multiple shapes. Move it
once, every shape that holds the reference moves with it.

You create shared points by holding <kbd>Alt</kbd> while clicking, or by
dragging a vertex onto an existing one in segment-editing mode.

This is what you want for boundaries that should never separate — two
adjoining lane edges, two polygon corners that must stay welded, the
end of one path and the start of another.

## Why distinguish

If shape edges that "should be the same" are actually two snapped
points, drag one of them, export to OpenDRIVE, and the road network
opens up at that vertex. The simulator may interpret the gap as a
discontinuity, or may smear over it depending on the tool.

Lane Left/Right neighbours that share a boundary always use shared
points internally — this is not optional and not user-controlled. For
arbitrary shapes (Linestring, Polygon, Path), the choice is up to you.

## Visual cues

- A snap target shows a single highlighted handle and pulls the cursor.
- A shared point renders as a doubled handle in segment-editing mode.

## See also

- [Snap to existing geometry](/guides/snap/)
- [Share points between shapes](/guides/point-sharing/)
