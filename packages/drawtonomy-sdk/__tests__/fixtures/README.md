# Test fixtures

Sample OpenDRIVE maps from the [esmini](https://github.com/esmini/esmini)
project (`resources/xodr/`), licensed under MPL-2.0. Used as real-world
parser/conversion fixtures:

- `fabriksgatan.xodr`
- `two_plus_one.xodr`
- `soderleden.xodr` — uses a `<junction type="direct">` whose connections carry
  `linkedRoad` (not `connectingRoad`); regression fixture for direct-junction
  parse tolerance (highway_merge / highway_merge_advanced scenarios).

Hand-authored for this repository (no third-party content):

- `micro_road_junction.xodr` — carry-through generational-decay regression
  fixture. 8 roads including a 0.20 m **micro road** (below the importer's
  minimum lane section length, so it materializes no lane shapes at all), a
  junction with two connecting roads, a `<controller>` grouping two signals,
  and a `<signalReference>`. Pins that a single edit no longer bleeds
  controllers or original road ids out of the document across repeated
  import/export generations.

A regression fixture for degenerate junction sliver-lane pruning:

- `town04-junction106.xodr` — a self-contained slice of the **Town04** map from
  the [CARLA simulator](https://github.com/carla-simulator/carla): junction 106
  with its 12 connecting roads and 4 linked mainlines, with elevation / lateral
  profiles and RoadRunner `userData` stripped. Regenerate with
  `scripts/extract-junction-fixture.py <town04.xodr>` from a full Town04 source.

  CARLA assets (maps, including OpenDRIVE `.xodr` files) are licensed under
  [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/) by the CARLA team
  (© Computer Vision Center, CARLA Simulator project). This file is a modified
  excerpt of Town04 (a subset of roads, with elevation / lateral profiles and
  `userData` removed); changes were made for this test fixture.

Golden outputs, not inputs:

`preR4Chain/*` are what the exporter emits for `helpers/junctionChain.ts`'s
8-junction chains when the carry plan and the bundles are settled by re-planning
the WHOLE document after each rejection. Dates are masked. They were produced by
a build that predates any attempt to shortcut that loop, so they pin the output
to something other than the code under test; never refresh one from the current
exporter, because a golden taken from the code it checks proves nothing.

- `chain8-split{1,4,8}.xodr` — three edit extents: only the head connecting
  road's boundary re-identified, the first four, and all eight. Compared by
  `odrReplanCost.test.ts`. The partial extents are the ones that catch an
  over-rejected chain; with everything already dirty there is nothing left to
  misjudge.

- `chain8-partial-lanelink.xodr` — a junction whose `<connection>` names only
  ONE of the two lanes. A road broken into several bundles still keeps its id,
  because the plan hands it to the side the table names; reading that as a loss
  drops the junction and an unedited `<signal>` with it.

- `chain8-partial-lanelink-reversed.xodr` — the same document with road 1001's
  two lanes the other way round in the snapshot. That decides which side of the
  split is considered first for the road's id.

- `chain8-two-junction.xodr` — two junctions naming opposite sides of road
  1001, so only one of them can have the road's id and the survivor's demand
  has to be the one that decides.

- `chain8-cross-road-bundle.xodr` — two chains 3.5 m apart, so a lane of road
  1001 and a lane of road 31001 share a boundary and come back as ONE bundle.

The last three are compared by `odrReplanShapes.test.ts`.

## Cost of settling the plan, and why it is paid

Rejecting a junction dirties its connecting roads, and a road that goes dirty
can break the next junction's table — which the loop only sees on the following
round. On these chains each connecting road IS the next junction's incoming
road, so the fixpoint advances one junction per round. Measured on this machine,
every connecting road split (the worst case the chain can present):

| junctions | rounds | export |
|---|---|---|
| 3 | 3 | 45 ms |
| 8 | 8 | 66 ms |
| 20 | 20 | 89 ms |
| 50 | 50 | 226 ms |
| 200 | 200 | 2.99 s |

Editing only the head road costs 2 rounds at J = 50 and at J = 200 (20 / 34 ms),
and a one-point edit on the real fixtures (`fabriksgatan`, `micro_road_junction`,
`town04-junction106`) settles in 1 round — no junction is rejected at all. The
chain is the adversarial shape, not the common one.

Reducing the rounds without giving up the whole re-plan is future work. Three
things defeated the attempt to predict a rejection's consequences locally, and
each is pinned as a golden above: a bundle can span two roads, so a road cannot
be judged by its own recorded lanes; a rejected junction's demand for a side of
a split road has to stop counting the instant it goes; and re-deciding road ids
per rejection makes the answer depend on the order junctions are rejected in,
which the whole re-plan does not.
