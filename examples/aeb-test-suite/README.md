# AEB test suite (example)

An example test suite for a sample automatic emergency braking (AEB) function. Requirements, test cases (functional and logical scenario, pass criteria), the test runs of three SUT versions and their logs are all plain files in this folder, and open in [drawtonomy](https://www.drawtonomy.com) with nothing to install.

## Glossary

| Term | Here |
|---|---|
| Functional scenario (ISO 34501, PEGASUS) | Natural-language description + diagram (`.drawtonomy.svg`) + `maneuver` tag |
| Logical scenario | OpenSCENARIO file (`.xosc`) + parameter ranges (`.pvd.xosc`) |
| Concrete scenario | One set of parameter values: one cell of the heatmap, one run |
| Test case (ISO 34505: inputs, steps, test platform, expected results) | `testcase.yaml`: logical scenario + pass criteria + SUT |
| Test suite (ISTQB) | This folder |
| Test run | One SUT version run over the whole suite: `results/<sut>@<version>/` |
| Requirement | `requirements/*.md`, linked to test cases many-to-many |

## View (browser only)

Open this folder in drawtonomy with its URL:

```
https://www.drawtonomy.com/?tests=https://github.com/kosuke55/drawtonomy/tree/main/examples/aeb-test-suite
```

Pick a requirement or test case, then a cell of the heatmap (a concrete scenario) to replay it: the logged motion of every vehicle, the FAIL moment, the ego's planned trajectory and a ghost of an older version for comparison.

To view a local copy instead, serve it with `python3 tools/serve.py` and open `https://www.drawtonomy.com/?tests=http://localhost:8765/`.

## Contents

```
requirements/   REQ-*.md requirements (tree via `parent`)
testcases/      <group>/<variant>/testcase.yaml + .xosc + .pvd.xosc + .drawtonomy.svg
roads/          shared OpenDRIVE roads
sut/aeb/        sample SUT (TTC-based AEB) and configs/v1.0-v1.2.yaml
tools/          runner, log slimmer, verifier, diagram builder, local server
results/        <sut>@<version>/ = one test run: <TC-ID>.json + logs/ (CSV + planning trace per concrete scenario)
```

| ID | Group / variant | Parameters | Concrete scenarios |
|---|---|---|---|
| TC-AEB-001 | lead-brake / car | EgoSpeed x Gap x LeadDecel | 196 |
| TC-AEB-002 | stationary / car | EgoSpeed x Friction | 45 |
| TC-AEB-002-MC | stationary / motorcycle | EgoSpeed x Friction | 45 |
| TC-AEB-003 | cut-in / car | EgoSpeed x CutInGap x LeadDecel | 84 |
| TC-AEB-003-MC | cut-in / motorcycle | EgoSpeed x CutInGap x LeadDecel | 84 |

SUT versions: v1.0 baseline, v1.1 improves cut-in but regresses on low-friction stationary targets, v1.2 fixes the regression.

The logs are slimmed to about 74 MB (0.04 s steps, only the columns drawtonomy reads, a plan every 0.5 s or when it changes; see [FORMAT.md](FORMAT.md)). The verdicts recomputed from them match the runner's verdicts.

## Rebuild the results (optional)

Needs Python 3 with pyyaml and [esmini](https://github.com/esmini/esmini) on Linux or macOS. Set `ESMINI_LIB` to the esmini shared library (`libesminiLib.so` / `libesminiLib.dylib`; default `~/esmini-bin/esmini/bin/libesminiLib.dylib`). Run from this folder:

```bash
python3 tools/run_sweep.py --sut aeb --config sut/aeb/configs/v1.0.yaml --generated-at 2026-09-13T09:00:00Z
python3 tools/run_sweep.py --sut aeb --config sut/aeb/configs/v1.1.yaml --generated-at 2026-09-20T09:00:00Z
python3 tools/run_sweep.py --sut aeb --config sut/aeb/configs/v1.2.yaml --generated-at 2026-09-27T09:00:00Z
python3 tools/run_sweep.py --scenario-check --generated-at 2026-09-27T09:00:00Z   # the scenario itself, ego scripted
python3 tools/verify_verdicts.py   # recheck verdicts from the logs; expect 0 mismatches
```

With the same esmini version (v3.0.3) the output is byte-identical to the committed files. `run_sweep.py` slims each log as it writes it; `python3 tools/slim_logs.py` does the same for existing logs and is safe to run again.

To test your own software, replace `sut/aeb` (`step(obs) -> accel`), or run the same xosc and parameters in your simulator and write the same result files.

## Diagrams (optional)

The `*.drawtonomy.svg` diagrams are committed and open for editing in drawtonomy. `node tools/build_scene_diagrams.mjs --app <drawtonomy URL>` regenerates them (needs Node and Playwright); you do not need it to view or rerun the suite.

## File formats

See [FORMAT.md](FORMAT.md).

## License

[Apache-2.0](LICENSE)
