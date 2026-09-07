# verdict サイドカー形式 (`drawtonomy-verdict/1`)

[English](verdict-sidecar.md)

**verdict サイドカー**は、公式 CommonRoad チェッカによる 1 つの solution に対する
判定を JSON で保持し、判定対象の solution の隣に置くファイルです。次のコマンドで
生成されます。

```bash
drawtonomy-cr verdict scenario.xml solution.xml
```

このコマンドは solution の隣 (または `-o` が指す場所) に
`<solution stem>.verdict.json` を書き出します。drawtonomy 側では、solution と
サイドカーを一緒に読み込んだときに利用されます。

サイドカーは**任意**です。必須の交換成果物は CommonRoad の solution XML だけで、
リプレイと drawtonomy 自身の衝突バッジはサイドカーが無くても動作します。
サイドカーが加えるのは*公式*チェッカの判定であり、そこには drawtonomy 単体では
出せない運動学的実行可能性の判定が含まれます。

## ファイル全体の構造

```json
{
  "schema": "drawtonomy-verdict/1",
  "benchmarkId": "PM1:JB1:ZAM_Example-1_1_T-1:2020a",
  "scenarioId": "ZAM_Example-1_1_T-1",
  "dt": 0.1,
  "tool": { "name": "commonroad-drivability-checker", "version": "2025.4.0" },
  "generatedAt": "2025-11-14T04:52:49Z",
  "checks": [
    {
      "name": "obstacle_collision",
      "status": "FAIL",
      "message": "CollisionException: There is a collision between the scenario obstacles and the ego vehicle in planning problem solution 16",
      "timeSteps": [127, 133],
      "obstacleId": 15
    },
    { "name": "boundary_collision", "status": "PASS" },
    { "name": "goal_reached", "status": "PASS" },
    {
      "name": "solution_feasible",
      "status": "FAIL",
      "message": "Exception: infeasible for planning problems [16]",
      "vehicleModel": "PM"
    }
  ]
}
```

| フィールド | 型 | 意味 |
|---|---|---|
| `schema` | string | 常に `drawtonomy-verdict/1`。必須。消費側はこれでファイルを識別します。 |
| `benchmarkId` | string | solution のベンチマーク id。CommonRoad の solution からそのまま転記されます (`<model>:<cost>:<scenario id>:<version>`)。 |
| `scenarioId` | string | シナリオの id。シナリオ XML に由来します。読み込み済みのリプレイとサイドカーを対応付けるのに使います。 |
| `dt` | number | シナリオのタイムステップ (秒)。`timeSteps` を秒に変換します。 |
| `tool` | object | `{ "name": "commonroad-drivability-checker", "version": ... }`。version は書き出し時に読み取ったインストール済みのもの。判別できない場合は `"unknown"`。 |
| `generatedAt` | string | UTC のタイムスタンプ。秒単位、`Z` 付きの ISO 8601。 |
| `checks` | array | チェック 1 件につき 1 エントリ。実行された順に並びます。 |

## `checks[]`

`name` と `status` は常に存在します。`status` は次のいずれかです。

| status | 意味 |
|---|---|
| `PASS` | 公式チェックが実行され、例外を送出しなかった。 |
| `FAIL` | 公式チェックが実行され、例外を送出した。`message` にその例外が入ります。 |
| `SKIP` | 必要なツールが無いため、チェックを**実行できなかった**。solution に対する判定ではありません。 |

`drawtonomy-cr verdict` が書き出す 4 つのチェックは、順に
`obstacle_collision`, `boundary_collision`, `goal_reached`,
`solution_feasible` で、公式の
`commonroad_dc.feasibility.solution_checker` が提供する 4 つです。`name` は自由な
文字列なので、他の生成側が別の名前を書いても構いませんが、この 4 つを推奨セット
とします。

### チェックに現れうるフィールド

| フィールド | 出現条件 | 意味 |
|---|---|---|
| `message` | FAIL, SKIP | FAIL のときは公式の例外を `{type}: {message}` の形で。`solution_feasible` の場合はより詳しい文になります (後述)。SKIP のときは何が足りずどう入れるかを 1 行で。 |
| `timeSteps` | FAIL | `[first, last]`。**両端を含み**、**0 始まり**です。秒は `step × dt`。 |
| `obstacleId` | `obstacle_collision` の FAIL | ego が衝突した障害物の id。特定できた場合のみ。 |
| `vehicleModel` | `solution_feasible` | solution の最初の planning problem solution の車両モデル (`PM`, `KS`, `ST`, ...)。planning problem solution が 1 つ以上あれば PASS でも FAIL でも書き出されます。 |
| `planningProblemId` | `solution_feasible` の FAIL | 遷移が実行不可能だった planning problem。 |
| `reason` | `solution_feasible` の FAIL | `steering_rate`, `acceleration`, `friction_circle`, `input_bounds`, `state_deviation` のいずれか。最も多く抵触した制限で、同数の場合は名前順で決めるため出力は再現可能です。 |
| `infeasibleTransitions` | `solution_feasible` の FAIL | 実行不可能だった状態遷移の数。 |
| `transitions` | `solution_feasible` の FAIL | 軌跡が持つ遷移の総数。 |
| `maxPositionError` | `solution_feasible` の FAIL | メートル、小数第 4 位まで。記録された状態と、公式の前方シミュレーションが出した状態との最大の乖離。 |
| `maxOrientationError` | `solution_feasible` の FAIL、PM 以外のモデル | ラジアン、小数第 4 位まで。 |
| `steeringRateLimit` | `solution_feasible` の FAIL、PM 以外のモデル | モデルの操舵角速度の上限 (rad/s)。 |
| `accelerationLimit` | `solution_feasible` の FAIL | モデルの加速度の上限 (m/s²)。 |
| `detailError` | `solution_feasible` の FAIL | 上記の詳細を収集する処理自体が失敗したときだけ現れます。公式の PASS/FAIL は依然として権威であり、そのまま保持されます。 |

`timeSteps` を**持たない** FAIL は、軌跡中のある瞬間ではなく軌跡全体に対する判定です。
`solution_feasible` は、遷移ごとの詳細を復元できなかったときにこの形になります。
消費側はそうした FAIL を t=0 ではなくリプレイの末尾 (「軌跡全体」) に提示すべきです。

### `solution_feasible` の詳細

公式の `solution_feasible` は planning problem ごとに bool を返すだけなので、
`drawtonomy_cr.verdict` は公式の `state_transition_feasibility` をすべての隣接
状態ペアに適用し直し (公式の `trajectory_feasibility` は最初の失敗で止まります)、
失敗したすべての遷移を報告します。

```json
{
  "name": "solution_feasible",
  "status": "FAIL",
  "message": "14 of 147 state transitions (4.2-6.1 s) need a steering rate beyond the KS limit of 0.4 rad/s; position drifts up to 5.8 cm from the simulated state (tolerance 2 cm), orientation up to 0.019 rad (tolerance 0.03).",
  "timeSteps": [42, 61],
  "planningProblemId": 60000,
  "reason": "steering_rate",
  "infeasibleTransitions": 14,
  "transitions": 147,
  "maxPositionError": 0.0581,
  "maxOrientationError": 0.0186,
  "steeringRateLimit": 0.4,
  "accelerationLimit": 11.5,
  "vehicleModel": "KS"
}
```

ここに出てくる数値はすべて公式 API に由来します。公式コードが再構成した入力、その
`input_bounds`、`violates_friction_circle`、そして記録された状態と
`forward_simulation` の結果との乖離を公式の許容値 (位置 2 cm、姿勢 0.03 rad) と
突き合わせた値です。このパッケージは車両モデルを一切実装していません。

### SKIP: `triangle` が無い場合の `boundary_collision`

`boundary_collision` は Shewchuk の Triangle を使って道路を三角形分割します。Triangle は
非商用利用は無償ですが商用利用には作者の許諾が必要なため、既定の依存関係ではなく任意の
`[boundary]` extra に置いています。無い場合、公式チェッカが送出するエラーは*チェックを
実行できなかった*という意味であり、*ego が道路から外れた*という意味ではないので、SKIP と
して報告し、次に何をすべきかを 1 行のメッセージで示します。

```json
{
  "name": "boundary_collision",
  "status": "SKIP",
  "message": "road boundary check skipped: the triangle package is not installed (pip install triangle; see its license)"
}
```

残り 3 つのチェックは実行され、`drawtonomy-cr verdict` の終了コードも 0 のままです。
消費側は SKIP を FAIL として描画せず、「判定済み」の数にも含めるべきではありません。

## サイドカーと solution の対応付け

消費側は `scenarioId` によってサイドカーと読み込み済みのリプレイを突き合わせます。
`scenarioId` が無い場合は、`benchmarkId` から先頭の `<model>:<cost>:` と末尾の
`:<version>` (例: `:2020a`) を取り除いて導出できます。一致しない場合、その
サイドカーは別のシナリオのものなので適用してはいけません。

リプレイが読み込まれていない状態で届いた verdict も適用できません。先に solution を
読み込むか、両方を同時にドロップしてください。

ファイル名の慣例は、solution の隣に置く `<solution stem>.verdict.json` です。
`planner_solution.xml` には `planner_solution.verdict.json` が対応します。
`drawtonomy-cr open` は、1 つのディレクトリに複数のプランナの出力が入っている
ときにこの慣例でファイルを対応付けます。

## `drawtonomy-cr verdict` の終了コード

| コード | 意味 |
|---|---|
| 0 | サイドカーを書き出した。FAIL の verdict は JSON の*中身*であり、コマンドの失敗ではありません。 |
| 3 | `commonroad-drivability-checker` が未インストールで verdict を計算できなかった。何も書き出しません。空や不完全なサイドカーを作ることは決してありません。 |

## 関連

- [`planning-trace-format.ja.md`](planning-trace-format.ja.md) - プランナが solution と
  一緒に書き出せる、任意の planning trace。
- [`open-server-protocol.ja.md`](open-server-protocol.ja.md) - `drawtonomy-cr open`
  が配信するものと、変更をどう通知するか。
