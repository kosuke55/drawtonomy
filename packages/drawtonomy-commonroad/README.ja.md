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
solution.verdict.json   (drawtonomy-verdict/1, the official checker's 4 verdicts)
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
は FAIL ではなく SKIP として報告され、残り 3 つのチェックは実行されます。

## `drawtonomy-cr verdict`

```bash
drawtonomy-cr verdict scenario.xml solution.xml [-o out.json]
```

公式チェッカの 4 つのテスト (`obstacle_collision`, `boundary_collision`,
`goal_reached`, `solution_feasible`) を実行し、結果を `drawtonomy-verdict/1`
サイドカーとして solution の隣に書き出します (`-o` を省略した場合は
`<solution stem>.verdict.json`)。solution と一緒に drawtonomy へドロップすると、
PASS / FAIL バッジ、衝突したタイムステップ、関与した障害物を確認できます。

終了コード: サイドカーを書き出せたときは `0` (FAIL の verdict は JSON の中身であり、
エラーではありません)、チェッカが未インストールのときは `3` です。

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
