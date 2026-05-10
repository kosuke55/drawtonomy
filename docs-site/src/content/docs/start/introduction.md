---
title: Introduction — whiteboard for driving scenarios
description: drawtonomy is a free, browser-based whiteboard for driving scenarios. Sketch lanes, intersections, vehicles, and pedestrians for papers, slides, design discussions, and scenario authoring. Exports to OpenDRIVE, OpenSCENARIO, and Lanelet2.
sidebar:
  label: Introduction
  order: 1
keywords:
  - whiteboard for driving scenarios
  - driving scenario diagram tool
  - autonomous driving diagram tool
  - autonomous driving figure for paper
  - autonomous driving figure for presentation
  - draw self-driving scenario online
  - traffic scenario sketch tool
  - lane diagram editor browser
  - scenario diagram for design review
  - whiteboard for autonomous driving teams
  - drawtonomy what is
---

drawtonomy is a whiteboard for driving scenarios. The kind of
figure you put in a paper, the slide you sketch before a design
review, the diagram you draw on a call when you're explaining a
corner case to the rest of the team, or the scene you sketch out
before writing the OpenSCENARIO file.

Lanes, intersections, vehicles, pedestrians, traffic lights, road
markings, and crosswalks are built-in shapes. Lanes are
topology-aware — they carry Next / Previous / Left / Right
connections — so the diagram is a network you can edit, not a
picture you redraw whenever the road geometry changes.

The app is at [drawtonomy.com](https://drawtonomy.com). The SDK,
extensions, and source for this docs site are on
[GitHub](https://github.com/kosuke55/drawtonomy).

## What people use it for

- **Figures for papers, theses, and technical reports.** Vector
  output (`drawtonomy.svg`, PDF, EPS) that embeds cleanly in
  LaTeX, Markdown, and slide decks.
- **Slides and presentations.** Diagrams of lane-change
  manoeuvres, intersections, occlusion cases, and other driving
  scenarios — drawn in seconds rather than minutes per shape.
- **Design and algorithm discussions.** A shared sketch surface
  for talking through driving behaviour, edge cases, and safety
  arguments with teammates.
- **Scenario authoring.** Sketch the scene before writing
  OpenSCENARIO XML, or import an existing `.xosc` and edit it
  visually.
- **Map and ROS annotation.** Trace lanes over a satellite
  background, edit Lanelet2 OSM maps, or annotate a ROS occupancy
  grid with paths and obstacles.

## Who this is for

- **Autonomous-driving and ADAS engineers** drawing diagrams for
  internal docs, design reviews, and incident write-ups.
- **AV researchers and students** producing figures for papers,
  theses, and conference talks.
- **Scenario authors** working with simulators like
  [esmini](https://github.com/esmini/esmini), CARLA, or in-house
  tools.
- **HD-map and Lanelet2 users** sketching changes against an
  existing road network.
- **ROS and robotics teams** drawing on top of occupancy grids
  built with nav2, Cartographer, or Gmapping.
- **Driving instructors and educators** producing diagrams for
  teaching material.
- **Tool builders** extending the editor with new exporters,
  importers, or AI-assisted features through the
  [extension SDK](/extend/).

## How this documentation is organised

The site follows the [Diátaxis](https://diataxis.fr/) split. Pick
the section that matches what you're doing.

| Section | When to read it |
|---|---|
| [Tutorials](/tutorials/) | You are new and want to learn by doing. |
| [How-to guides](/guides/) | You know what to accomplish and need the steps. |
| [Reference](/reference/) | You need to look up an exact fact — a shortcut, a format, an API. |
| [Explanation](/explanation/) | You want to understand why drawtonomy works the way it does. |
| [Extending drawtonomy](/extend/) | You are building on top of drawtonomy. |

If you don't know where to start, the
[Quickstart](/start/quickstart/) is five minutes from a blank
canvas to an exported scene.
