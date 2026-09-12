# Fixture provenance

## `cutin_*`, `planner_solution.*`

`cutin_commonroad.xml` is a CommonRoad conversion of the esmini sample scenario
`resources/xosc/cut-in.xosc` and the road it references, `resources/xodr/e6mini.xodr`
(https://github.com/esmini/esmini). Those files are licensed under the
Mozilla Public License 2.0 (https://github.com/esmini/esmini/blob/master/LICENSE).
The conversion was made with drawtonomy: the road network became lanelets, the
two vehicles became the ego planning problem and a dynamic obstacle, and a goal
region was added. The converted file is distributed under the same MPL-2.0 terms.

`cutin_solution.*` (a naive planner, obstacle collision) and `planner_solution.*`
(commonroad-reactive-planner, all checks pass) are results computed on that
scenario. The solution files were written by the planners, the `.verdict.json`
files by `drawtonomy-cr verdict` (commonroad-drivability-checker), and the
`.planning-trace.json` file by `TraceWriter`.

`cutin_openscenario.planning-trace.json` is `planner_solution.planning-trace.json`
with the track addressed by `"name": "Ego"` instead of `"role": "ego"`, so that the
same planner result can be opened on the OpenSCENARIO original (esmini
`resources/xosc/cut-in.xosc`), whose entity is named `Ego`. The states are
unchanged, and `"frame": "center"` still describes them.

## `straight_*`

`straight_commonroad.xml` was drawn in drawtonomy: one straight road, an ego and
a slower vehicle ahead in the same lane, and a goal region near the end. It
contains no third-party content. `straight_idm_solution.*` and
`straight_naive_solution.*` are the output of `examples/idm_planner/idm_planner.py`
in its two modes on that scenario, judged with `drawtonomy-cr verdict`.
`tests/test_example_idm.py` regenerates them and checks that they match.
