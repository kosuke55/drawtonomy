# Test fixtures

Sample OpenDRIVE maps from the [esmini](https://github.com/esmini/esmini)
project (`resources/xodr/`), licensed under MPL-2.0. Used as real-world
parser/conversion fixtures:

- `fabriksgatan.xodr`
- `two_plus_one.xodr`
- `soderleden.xodr` — uses a `<junction type="direct">` whose connections carry
  `linkedRoad` (not `connectingRoad`); regression fixture for direct-junction
  parse tolerance (highway_merge / highway_merge_advanced scenarios).

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
