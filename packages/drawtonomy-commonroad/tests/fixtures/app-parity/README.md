# App parity fixtures

Copies of the drawtonomy app's own committed CommonRoad fixtures, together with
the verdict JSON the app produced for them. The app computes
`scenarioFingerprint` and `solutionFingerprint` in the browser with its own
SHA-256 implementation; the values stored in these verdict files are therefore
an independent reference for `tests/test_verdict_app_parity.py`.

| file | role |
|---|---|
| `planner_solution.xml`, `cutin_solution.xml` | Solution XML the app hashed. |
| `planner_solution.verdict.json`, `cutin_solution.verdict.json` | The app's verdicts, carrying the expected fingerprints. |

The matching scenario XML is not duplicated here: both app verdicts are for
scenario `ZAM_Untitled202609011139-1_1_T-1`, whose file is byte-for-byte the
existing `tests/fixtures/cutin_commonroad.xml`, and the parity test hashes that
copy.

Update these files only by copying them again from the app repository. Editing
them by hand would silently retire the cross-implementation check.
