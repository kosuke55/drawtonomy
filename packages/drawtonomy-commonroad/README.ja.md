# drawtonomy-cr

[English](README.md)

[drawtonomy](https://drawtonomy.com) 用の CommonRoad コネクタ。プランナはご自身のものをお使いください。

```
scenario.xml  (CommonRoad 2020a, exported from drawtonomy)
      |
      v
[your planner]  -- required --> solution.xml   (CommonRoadSolution, commonroad-io)
      |
      +-- optional --> solution.planning-trace.json   (drawtonomy_cr.trace.TraceWriter)
      |
      v (drawtonomy-cr post-processes)
solution.verdict.json   (drawtonomy-verdict/1, the official checker's 7 verdicts)
```

**必須のファイルは solution XML だけ**です。それ以外はすべて任意で、リプレイと
drawtonomy 自身の衝突バッジはそれらが無くても動作します。

## インストール

```bash
pip install drawtonomy-commonroad                 # TraceWriter and `open`
pip install "drawtonomy-commonroad[checker]"      # + verdict, needs Linux x86_64
pip install "drawtonomy-commonroad[boundary]"     # + the road boundary check
```

`[boundary]` の extra は Shewchuk の Triangle を追加します。`boundary_collision` は
これを使って道路を三角形分割します。Triangle は非商用利用は無償ですが商用利用には
作者の許諾が必要なため、既定の依存関係には入れていません。無い場合 `boundary_collision`
は FAIL ではなく SKIP として報告され、残り 6 つのチェックは実行されます。

## `drawtonomy-cr verdict`

```bash
drawtonomy-cr verdict scenario.xml solution.xml [-o out.json]
```

公式の `valid_solution` と同じ 7 つのテストを同じ順で 1 つずつ実行し
(`solved_all_problems`, `goal_reached`, `starts_at_correct_state`,
`obstacle_collision`, `boundary_collision`, `ego_collision`,
`solution_feasible`)、結果を `drawtonomy-verdict/1`
サイドカーとして solution の隣に書き出します (`-o` を省略した場合は
`<solution stem>.verdict.json`)。solution と一緒に drawtonomy へドロップすると、
PASS / FAIL バッジ、衝突したタイムステップ、関与した障害物を確認できます。

終了コード: サイドカーを書き出せたときは `0` (FAIL の verdict は JSON の中身であり、
エラーではありません)、チェッカが未インストールのときは `3` です。

サイドカーには `scenarioFingerprint` と `solutionFingerprint` も記録されます。値は各入力を
UTF-8 として読み、先頭の BOM を 1 個除去し、CRLF と CR を LF に正規化したうえで計算した
`sha256:` + 小文字 16 進 64 桁です。これにより、読み込んだファイルが実際に検査された
ファイルであることをアプリ側で確認できます。指紋の無い verdict は **Checker unchecked**
と表示されます。認証ではなく内容の同一性を示すものなので、入力を編集したら指紋を
書き写すのではなく checker を再実行してください。

フォーマット: [`docs/verdict-sidecar.ja.md`](docs/verdict-sidecar.ja.md)。

## `drawtonomy_cr.trace.TraceWriter`

**planning trace** は、最終的に走行した軌跡だけでなく、各再計画サイクルで
プランナが何を意図していたかを記録します。これを生成できるのはプランナの作者だけ
なので、コマンドではなくライブラリとして提供しています。

```python
from drawtonomy_cr.trace import TraceWriter

w = TraceWriter(dt=0.1, vehicle=dict(length=4.508, width=1.61, refToCenter=1.4227,
                                     type="BMW_320i"))
for cycle in my_planner_loop():
    w.plan(t=cycle.t, states=cycle.trajectory)   # one entry per replanning cycle
w.driven(executed_states)                        # what the ego actually drove
w.write("solution.planning-trace.json", solution="solution.xml")
```

`vehicle` はプランナが計画に使った車体です。使われるのは `length` / `width` /
`refToCenter` だけで、`type` は再生時のツールチップに表示される自由なラベルです。
お使いのプランナの車体をそのまま書くか、`vehicle` を省略すれば ego を描いたときの
サイズにフォールバックします。

`states` は commonroad-io の `State` オブジェクトでも、素の
`{"x":, "y":, "orientation":, "v":, "time_step":}` の dict でも受け付けます。

`write()` は何かを書き出す前に 2 つの同一性を検証します。`driven` が solution の
軌跡と 1e-6 m 以内で一致すること、そして各 plan の実行済み先頭部分が同じ
タイムステップの `driven` と一致することです。検証に失敗した場合は、記述対象と
主張している solution と異なる再生になる trace を書き出さずに例外を送出します。

フォーマット: [`docs/planning-trace-format.ja.md`](docs/planning-trace-format.ja.md)。

## `drawtonomy-cr open`

```bash
drawtonomy-cr open ./results            # a directory, or the scenario XML inside it
```

ディレクトリを走査して 4 種類のファイルを**内容**で判別し (`<commonRoad`,
`<CommonRoadSolution`, `drawtonomy-verdict/1`, `drawtonomy-planning-trace-v1`)、
verdict が無くチェッカがインストールされていれば計算し、ディレクトリを
`http://127.0.0.1:<port>` で配信し、drawtonomy の URL を表示してそれを開きます。

```
solution: planner_solution.xml
serving /home/me/results at http://127.0.0.1:53101
https://drawtonomy.com/?open=http%3A%2F%2F127.0.0.1%3A53101%2Fscenario.xml&solution=planner_solution.xml
Open the URL in Chrome or Firefox (Safari blocks http://127.0.0.1 from an https page).
Watching for changes. Press Ctrl+C to stop.
```

その後は**監視**を続けます。プランナを再実行すると、開いているタブが solution、
verdict、trace を自動で再読み込みします (シナリオは再読み込みしません。描画は
drawtonomy 側の担当です)。ページは `/events` (Server-Sent Events) を購読します。CLI は
ファイルのサイズと mtime が 500 ms 静止するまで待つので、書き込み途中の solution が
配信されることはありません。CLI が計算した verdict は solution が変わるたびに
再計算されます。自分で置いた verdict は一切触られません。そのため solution だけが
変わった場合、ページは古いチェッカ結果 (前の solution のものです) を取り下げ、
verdict ファイルが更新され次第また表示します。

バインドするのは `127.0.0.1` のみ、応答するのは `GET` / `HEAD` / `OPTIONS` のみ、
到達できるのは配信対象ディレクトリのみ (`..` と絶対パスは 404)、
`Access-Control-Allow-Origin` は 1 つの origin だけを指定し、`*` は決して使いません。

| フラグ | |
|---|---|
| `--solution` / `--verdict` / `--trace` | 自動判別の結果を上書きする |
| `--port N` | ポートを固定する (既定: 空きポート) |
| `--no-browser` | ブラウザを開かず URL を表示するだけにする |
| `--copy` | 配信せずファイルパスを表示する。https ページから `http://127.0.0.1` をブロックするブラウザ (Safari) 向け。表示されたファイルを drawtonomy.com にドロップする |
| `--app-origin URL` | ファイルの読み取りを許可する origin (既定 `https://drawtonomy.com`) |

チェッカが無い場合は単に verdict が付かないだけです。1 行その旨が表示され、
シナリオは drawtonomy 自身の衝突バッジ付きで開きます。

プロトコル: [`docs/open-server-protocol.ja.md`](docs/open-server-protocol.ja.md)。

## サンプル

`examples/idm_planner/` は、このパッケージ向けに書かれた 1 ファイルのプランナです。
ego は開始した lanelet の中心線をたどり、速度は IDM の追従モデルが決めます。依存は
commonroad-io と numpy だけです。接続できる最小の構成であり、同梱の 2 つのモードに
ついては README で説明しています。

`examples/reactive_planner/` は commonroad-reactive-planner を端から端まで
つないだ例です。どちらもあくまで例なので、プランナ側をご自身のものに差し替え、
受け渡し側はそのまま使ってください。

### 結果をブラウザで開く

両サンプルの出力は `tests/fixtures/` にコミットしてあり、drawtonomy は URL の
`?open=` パラメータで CommonRoad ファイルを GitHub から直接開けます。solution の
判定を見るリンクは solution と verdict、計画を見るリンクは trace を読み込みます。インストールは不要です:

| サンプル | シナリオ | 結果 | 判定を見る | 計画を見る |
|---|---|---|---|---|
| reactive planner | カットイン (`cutin_commonroad.xml`) | PASS 7/7 | [判定](https://drawtonomy.com/?open=https://github.com/kosuke55/drawtonomy/blob/main/packages/drawtonomy-commonroad/tests/fixtures/cutin_commonroad.xml&solution=planner_solution.xml&verdict=planner_solution.verdict.json) | [計画](https://drawtonomy.com/?open=https://github.com/kosuke55/drawtonomy/blob/main/packages/drawtonomy-commonroad/tests/fixtures/cutin_commonroad.xml&trace=planner_solution.planning-trace.json) · [候補付き計画](https://drawtonomy.com/?open=https://github.com/kosuke55/drawtonomy/blob/main/packages/drawtonomy-commonroad/tests/fixtures/cutin_commonroad.xml&trace=planner-candidates/cutin_solution.planning-trace.json) |
| IDM planner `idm` モード | 直線道路 (`straight_commonroad.xml`) | FAIL, 初期状態の 1 ステップ後から始まる (6/7) | [判定](https://drawtonomy.com/?open=https://github.com/kosuke55/drawtonomy/blob/main/packages/drawtonomy-commonroad/tests/fixtures/straight_commonroad.xml&solution=straight_idm_solution.xml&verdict=straight_idm_solution.verdict.json) | [計画](https://drawtonomy.com/?open=https://github.com/kosuke55/drawtonomy/blob/main/packages/drawtonomy-commonroad/tests/fixtures/straight_commonroad.xml&trace=straight_idm_solution.planning-trace.json) |
| IDM planner `naive` モード | 直線道路 | FAIL、3.7 秒で障害物衝突 (5/7) | [判定](https://drawtonomy.com/?open=https://github.com/kosuke55/drawtonomy/blob/main/packages/drawtonomy-commonroad/tests/fixtures/straight_commonroad.xml&solution=straight_naive_solution.xml&verdict=straight_naive_solution.verdict.json) | [計画](https://drawtonomy.com/?open=https://github.com/kosuke55/drawtonomy/blob/main/packages/drawtonomy-commonroad/tests/fixtures/straight_commonroad.xml&trace=straight_naive_solution.planning-trace.json) |
| reactive planner | カットインの **OpenSCENARIO 版** (esmini `cut-in.xosc`) | traceのみ | — | [計画](https://drawtonomy.com/?open=https%3A%2F%2Fgithub.com%2Fesmini%2Fesmini%2Fblob%2Fmaster%2Fresources%2Fxosc%2Fcut-in.xosc&trace=https%3A%2F%2Fgithub.com%2Fkosuke55%2Fdrawtonomy%2Fblob%2Fmain%2Fpackages%2Fdrawtonomy-commonroad%2Ftests%2Ffixtures%2Fcutin_openscenario.planning-trace.json) |

判定を見るリンクは `?open=<GitHub file URL>&solution=<file>&verdict=<file>` です。
計画を見るリンクは verdict を付けず `&trace=<file>` を使います。trace 単体では
判定対象の solution との同一性を確認できないため、trace と verdict を同時に指定すると
判定は未照合表示になります。付随ファイル名は開くファイルからの相対パスです。
出所と再生成方法は [`tests/fixtures/ATTRIBUTION.md`](tests/fixtures/ATTRIBUTION.md) を参照してください。

「候補付き計画」リンクは、同じカットインを reactive planner が検討した候補ごと
再生します。63 回の再計画サイクル、各サイクル 30 候補 (実行可能 20・却下 10) が
Candidates トグルで順位付けされた色のファンとして表示されます。`candidates` を
持たない trace ではファンは単純に表示されません。

最後の行は、CommonRoad 版の変換元である **OpenSCENARIO のシナリオに同じ planner の結果**
を載せます。trace は CommonRoad 専用の形式ではありません。どの actor を動かすかを
trace 自身が持ち、drawtonomy はそれをシーンと突き合わせます。CommonRoad なら
`"role": "ego"` (planning problem が ego なので名前を持たない)、OpenSCENARIO なら
`"name": "<エンティティ名>"` (ここでは `"Ego"`) で指定します。
`cutin_openscenario.planning-trace.json` は `planner_solution.planning-trace.json` の
その 1 項目だけを変えたものです。別リポジトリの付随ファイルは、この行のように
GitHub の URL をそのまま書きます。

## 契約ドキュメント

| ドキュメント | 規定している内容 |
|---|---|
| [`docs/verdict-sidecar.ja.md`](docs/verdict-sidecar.ja.md) | `drawtonomy-cr verdict` が書き出す `drawtonomy-verdict/1` サイドカー |
| [`docs/planning-trace-format.ja.md`](docs/planning-trace-format.ja.md) | `TraceWriter` が書き出す `drawtonomy-planning-trace-v1` ファイル |
| [`docs/open-server-protocol.ja.md`](docs/open-server-protocol.ja.md) | `drawtonomy-cr open` が配信するもの、表示する URL、`/events` ストリーム |

## 開発

```bash
pip install "drawtonomy-commonroad[test]"
pytest
```

公式チェッカが必要なテストは、それをインストールできない環境ではスキップされる
ので、テストスイートはどこでも実行できます。Node のツールチェーンは使いません。

## checker を入れられない環境

`commonroad-drivability-checker` が公開している wheel は manylinux x86_64 だけなので、
`[checker]` の extra はすべての環境に入れられるわけではありません。入らない環境では、
verdict の実行だけを Linux x86_64 のコンテナで行ってください。

```bash
docker run --rm --platform linux/amd64 -v "$PWD:/work" -w /work python:3.11 sh -c \
  'pip install "drawtonomy-commonroad[checker]" &&
   drawtonomy-cr verdict scenario.xml planner_solution.xml'
```

チェッカが無い場合、`drawtonomy-cr verdict` は終了コード 3 でその旨を 1 行だけ表示し、
`drawtonomy-cr open` は verdict の無いままシナリオを配信します。`open` は想定される
名前の verdict ファイルを監視し続けるので、`open` の起動後にコンテナから書き出せば、
そのままタブに反映されます。

## ライセンス

Apache-2.0。[`LICENSE`](LICENSE) を参照してください。
