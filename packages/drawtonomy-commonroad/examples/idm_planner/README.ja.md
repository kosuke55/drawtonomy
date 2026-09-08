# IDM planner サンプル

[English](README.md)

drawtonomy につなげる最小の planner です。1 ファイル、依存は commonroad-io と numpy だけ。
ego は出発した lanelet の中心線をなぞり、速度は IDM (Intelligent Driver Model) の
追従モデルで決めます。自作 planner の出発点としてコピーしてください。

```bash
pip install drawtonomy-commonroad
python3 idm_planner.py scenario.xml out/                 # IDM
python3 idm_planner.py scenario.xml out/ --mode naive    # 初速を維持するだけ
```

`out/` に出るもの:

| ファイル | |
|---|---|
| `planner_solution.xml` | CommonRoad solution (drawtonomy が必要とする唯一のファイル) |
| `planner_solution.planning-trace.json` | planning trace、1 秒ごとに 1 plan (任意、`--no-trace` で省略) |

判定して開く:

```bash
drawtonomy-cr verdict scenario.xml out/planner_solution.xml   # [checker] extra が必要
drawtonomy-cr open out/
```

パッケージ同梱のカットインシナリオ (`tests/fixtures/cutin_commonroad.xml`、
割り込んで停止する先行車) では、2 つのモードで判定が分かれます:

| mode | `obstacle_collision` | 他の 3 検査 |
|---|---|---|
| `idm` | PASS | PASS |
| `naive` | FAIL (t=124..130, obstacle 15) | PASS |

直線道路 `tests/fixtures/straight_commonroad.xml` (1 車線、ego の前に遅い車が 1 台)
での同じ 2 通りの結果は `tests/fixtures/straight_idm_solution.*` と
`straight_naive_solution.*` としてコミットしてあり、GitHub から直接 drawtonomy で
開けます: [`idm`、PASS 4/4](https://drawtonomy.com/?open=https://github.com/kosuke55/drawtonomy/blob/main/packages/drawtonomy-commonroad/tests/fixtures/straight_commonroad.xml&trace=straight_idm_solution.planning-trace.json&verdict=straight_idm_solution.verdict.json) と [`naive`、3.7 秒で FAIL](https://drawtonomy.com/?open=https://github.com/kosuke55/drawtonomy/blob/main/packages/drawtonomy-commonroad/tests/fixtures/straight_commonroad.xml&trace=straight_naive_solution.planning-trace.json&verdict=straight_naive_solution.verdict.json)。
`tests/test_example_idm.py` がこのファイルから再生成して一致を検査するので、
サンプルが書き出すものと食い違いません。

## 読みどころ

ファイルは 2 つに分かれています。`PLANNER-SPECIFIC` が planning 本体 (経路、IDM、
前進シミュレーション)。末尾の `DRAWTONOMY HAND-OFF` が drawtonomy との契約の全部です:

- `write_solution()` は commonroad-io で solution を書きます。solution の
  `vehicle_type` (ここでは BMW_320i) が、公式 checker が判定に使う車体です。
- `write_trace()` は `TraceWriter` で planning trace を書きます。同じ車体を宣言する
  ので、drawtonomy は checker が見たものをそのまま描きます。この planner は再計画
  しないので、各 "plan" はその秒以降の走行プロファイルの残りです。`write()` の
  自己検査を通すため、driven の状態列からスライスしています。

drawtonomy から export したシナリオで効いてくる 2 点:

- lanelet に successor が無い (レーンは隣接関係のみ) ので、経路は出発 lanelet 1 本
- 直線レーンは 2 点の polyline なので、位置は中心線の線分に射影する
  (最近傍の頂点にスナップしない)
