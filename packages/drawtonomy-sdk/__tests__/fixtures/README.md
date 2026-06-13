# Test fixtures

Sample OpenDRIVE maps from the [esmini](https://github.com/esmini/esmini)
project (`resources/xodr/`), licensed under MPL-2.0. Used as real-world
parser/conversion fixtures:

- `fabriksgatan.xodr`
- `two_plus_one.xodr`

A self-contained slice of CARLA's Town04 (licensed under MIT), used by the
issue #494 regression for degenerate junction sliver-lane pruning:

- `town04-junction106.xodr` — junction 106 with its 12 connecting roads and
  4 linked mainlines (elevation / lateral profiles and RoadRunner `userData`
  stripped). Regenerate with
  `scripts/extract-junction-fixture.py <town04.xodr>` from a full Town04 source.
