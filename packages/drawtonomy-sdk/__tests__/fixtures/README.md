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

- `preR4Chain/chain8-split{1,4,8}.xodr` — what the exporter produced for
  `helpers/junctionChain.ts`'s 8-junction chain when the plan / build fixpoint
  still advanced one junction per round, for three edit extents: only the head
  connecting road's boundary re-identified, the first four, and all eight.
  Following a rejection's consequences inside the round has to reach the SAME
  fixpoint, only sooner, so `odrReplanCost.test.ts` compares against these
  byte for byte. Dates are masked. Regenerate only against a build that
  predates that change, never from the current exporter — a golden refreshed
  from the code it is meant to check proves nothing.

- `preR4Chain/chain8-partial-lanelink.xodr` — same chain and the same rule, for
  a junction whose `<connection>` names only ONE of the two lanes. That is the
  case where a road broken into several bundles still keeps its id, because the
  plan hands it to the side the table names; reading it as a loss dropped the
  junction and an unedited `<signal>` with it. Produced by the same
  pre-change build, and masked and compared the same way.
