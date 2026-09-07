# `drawtonomy-cr open`: ローカルサーバープロトコル

[English](open-server-protocol.md)

```bash
drawtonomy-cr open ./results            # a directory, or the scenario XML inside it
```

`open` はプランナーの実行結果が入ったディレクトリを受け取り、どのファイルが何なのかを判別し、
ループバック HTTP でそのディレクトリを配信し、そこを指す drawtonomy の URL を出力し、
以降はディレクトリを監視して、プランナーを再実行すると開いたままのタブが更新されるようにします。

このドキュメントは `open` が実際に行っていることを説明します。

## 判別: どのファイルが何なのか

認識される種類は `scenario`、`solution`、`verdict`、`trace` の 4 つです。
拡張子は信用しません。`.xml` は scenario と solution の両方に、`.json` は verdict と trace の
両方に使われるためです。各ファイルの種類は、先頭 8192 バイトの内容から次の順で判定します。

| 先頭 8 KiB で最初に一致したもの | 種類 |
|---|---|
| `<commonRoad` | `scenario` |
| `<CommonRoadSolution` | `solution` |
| `drawtonomy-verdict/1` | `verdict` |
| `drawtonomy-planning-trace-v1` | `trace` |

それ以外は無視されます。走査するのはディレクトリの最上位だけで、サブディレクトリには
降りていきません。

**同じ種類のファイルが複数あるときの選び方。** scenario と solution は名前順で最初のものを
選びます。verdict と trace は名前順では選ばず、選ばれた solution のステムとペアにします
(`<solution stem>.verdict.json` と `<solution stem>.planning-trace.json`)。1 つの
ディレクトリに 2 つのプランナーの出力が入っていても、一方のプランナーの trace をもう一方の
結果として配信しないようにするためです。命名規約に従う候補が 1 つも無いときにだけ、
名前順で最初のものにフォールバックします。

候補が複数あった場合は、実際に配信するファイルと無視したファイルを 1 行で出力するので、
何も黙って選ばれることはありません。

```
2 solution files found; using idm.xml (naive.xml ignored)
```

**上書き指定。** `--solution`、`--verdict`、`--trace` は判別結果を置き換えます。存在しない
パスは 1 行のメッセージと終了コード 2 で拒否されます。`--solution` を渡すと、明示的に
名前を指定していない限り verdict と trace も新しい solution のステムで組み直されます。
明示的な `--verdict` や `--trace` は常にそのまま残されます。

対象がディレクトリではなく scenario XML の場合は、その親ディレクトリが配信され、
そのファイルが scenario になります (ディレクトリに他の scenario があっても同様です)。
scenario がまったく見つからない場合は、1 行を出力して終了コード 2 で終了します。

## 配信開始前の verdict

solution があって verdict が無く、`commonroad-drivability-checker` がインストールされている
場合は、verdict を計算して solution の隣の `<solution stem>.verdict.json` に書き出します。
この方法で生成された verdict は CLI 自身のものとして印が付き、solution が変わるたびに
再計算されます。

チェッカーが未インストールでもエラーにはなりません。その旨を 1 行で伝え、verdict 無しで
scenario を開きます。

```
No verdict: the official checker is not installed, so the scenario opens without it (install with: pip install "drawtonomy-commonroad[checker]", Linux x86_64 only).
```

**ユーザー**が用意した verdict は、再計算も上書きもされません。

### 古い verdict は配信しない

ユーザー提供の verdict が solution より (mtime で見て) 古い場合、それは 1 つ前の solution を
判定したものなので配信を保留し、再計算するコマンドを 1 行で示します。

```
verdict: planner_solution.verdict.json is older than the solution and is not shown. Recompute: drawtonomy-cr verdict scenario.xml planner_solution.xml
```

チェッカーがインストールされていない場合は、代わりにどこで実行すればよいかがヒントの
末尾に示されます。監視は続くので、verdict を作り直せばすぐに反映されます。

solution より**新しい** verdict は通常どおり配信されます。CLI 自身が生成した verdict は
自動的に再生成されるため、このルールの対象外です。

## 何が配信されるか

`ThreadingHTTPServer` が `127.0.0.1` にのみバインドします。ポートは `--port`、既定では
OS が選んだ空きポートです。オリジンは `http://127.0.0.1:<port>` になります。

- 応答するのは `GET`、`HEAD`、`OPTIONS` だけです。それ以外のメソッドは 501 になります。
- 到達できるのは配信ディレクトリ配下のファイルだけです。URL パスはルートに対して解決した
  うえで `Path.resolve()` と `is_relative_to` で検査するため、`..`、絶対パス、外部を指す
  シンボリックリンクはいずれも 404 になります。通常ファイルでないものも 404 です。
- `Access-Control-Allow-Origin` はアプリのオリジン (`--app-origin`、既定は
  `https://drawtonomy.com`) です。**`*` にはしません**。任意のサイトがループバックの
  エンドポイントを読めないようにするためです。`Vary: Origin` も併せて付きます。
- すべてのレスポンスに `Cache-Control: no-store` を設定します。
- `OPTIONS` は 204 を返し、`Access-Control-Allow-Methods: GET, HEAD, OPTIONS`、
  `Access-Control-Allow-Headers: Content-Type`、`Access-Control-Max-Age: 600` を付けます。
- `Content-Type` はファイル名から推測し、判別できなければ `application/octet-stream` に
  フォールバックします。

すでに使用中のポートは、トレースバックではなく 1 行のメッセージと次の一手を示して拒否され、
CLI は終了コード 2 で終了します。

```
Could not listen on 127.0.0.1:8000 (Address already in use). Use a different --port, or omit --port to pick a free one.
```

## URL

URL は `<app origin>/?` に続けて、url エンコードしたパラメータを次の順で並べたものです。

| パラメータ | 値 |
|---|---|
| `open` | scenario の**絶対** URL、`http://127.0.0.1:<port>/<name>` |
| `solution` | 配信ディレクトリからの solution の**相対**パス |
| `verdict` | 同様 (verdict を配信しているとき) |
| `trace` | 同様 (trace があるとき) |

存在する連れのファイルだけが並びます。相対パスなのは、アプリが scenario の URL を基準に
解決するためで、ポートが変わっても壊れません。

```
https://drawtonomy.com/?open=http%3A%2F%2F127.0.0.1%3A53101%2Fscenario.xml&solution=planner_solution.xml
```

solution と trace はどちらも再生を駆動します。両方あるときは、ドラッグ & ドロップのときと
同じくアプリが trace を優先します。CLI は持っているものを列挙するだけで、その選択は
アプリに任せます。

`--no-browser` を付けない限り、URL は `webbrowser.open` で開かれます。

## `/events`: 変更通知

パス `/events` は Server-Sent Events のストリームです。レスポンスは
`Content-Type: text/event-stream` と `Connection: close` で、ボディは接続が切れたときに
終わるため、チャンク転送も `Content-Length` も使いません。`HEAD` はヘッダーだけを返します。

接続時に、クライアントが接続を確認できるようコメントを 1 つ書き出します。

```
: connected

```

アイドル中は 30 秒ごとに keepalive コメントを書き出します。

```
: keepalive

```

ファイルが変わると、接続中のすべてのクライアントにイベントが 1 つブロードキャストされます。

```
event: changed
data: {"files":["solution","verdict"],"names":{"solution":"planner_solution.xml","verdict":"planner_solution.verdict.json"}}

```

`data` はキーをソートしたコンパクトな JSON です。

| フィールド | 意味 |
|---|---|
| `files` | 変更された種類のソート済み配列。`solution`、`verdict`、`trace` から取られる |
| `names` | それぞれの種類を、配信ディレクトリからの相対パスに対応付けたオブジェクト |

送られるイベント種別は `changed` だけです。scenario は**決して**監視も通知もされません。
描画はアプリのものなので、再取得されるのは solution、verdict、trace だけです。

配信できない種類は、`files` に現れていても `names` からは外されるので、存在しない verdict や
古い verdict が取得されることはありません。

いなくなったクライアントは片付けられます。次の keepalive を待つのではなくピアの EOF を
検知します。同時に複数の接続をサポートし、すべての接続がすべてのイベントを受け取ります。

## 監視

solution、verdict、trace の mtime (ファイルサイズを折り込んでいるので、mtime が変わらない
書き換えも検知できます) を 0.5 秒ごとにポーリングします。

verdict は**存在する前から**、想定される名前 `<solution stem>.verdict.json` で監視されるので、
`open` の開始後に書き出した verdict もタブに届きます。存在しないファイルには mtime が無いだけ
なので、出現が変更として記録されます。

**沈静化待ち。** 検知した変更はすぐには通知しません。監視側は、監視対象すべての mtime が
0.5 秒間 (最大 30 秒まで) 変わらなくなるまで待つので、書きかけのファイルが配信されることは
ありません。したがって 6 回の連続した書き込みでも、通知は 6 回ではなく 1 回です。

**再計算。** CLI が verdict を所有していて solution が変わった場合は、イベントを送る前に
verdict を再計算し、通知する種類に `verdict` を追加します。ユーザー提供の verdict は
再計算されず、そのファイル自身の変更だけが通知されます。

**引き受け。** 起動後に出現した、あるいは書き換えられた verdict は引き受けられ、1 行
(`verdict: planner_solution.verdict.json`) とともに通知されます。それでも solution より
古い場合は配信されません。

**監視中に古くなった場合。** solution だけが変わり、ユーザー提供の verdict がそれより古く
なったときは、変更の行に続けて古さを伝える行が、この順で出力されます。

```
changed: solution
verdict: planner_solution.verdict.json is now older than the solution; checker results are cleared in the tab until you recompute: drawtonomy-cr verdict scenario.xml planner_solution.xml
```

以降、その verdict は配信されず、`names` からも外れます。

CLI は `Ctrl+C` まで動き続け、その後 `Stopped.` を出力して監視とサーバーを停止します。

## `--copy`: サーバーを立てないフォールバック

Safari は `https` のページから `http://127.0.0.1` を読むことを拒否するため、ループバック
経路はそこでは機能しません。`--copy` はサーバーをまったく起動せず、代わりに絶対パスを
出力するので、drawtonomy へ手でドロップできます。

```
scenario: /home/me/results/scenario.xml
solution: /home/me/results/planner_solution.xml
verdict: /home/me/results/planner_solution.verdict.json
trace: /home/me/results/planner_solution.planning-trace.json
Drop these files onto drawtonomy.com to see the result.
```

列挙されるのは存在するファイルだけで、配信を保留した古い verdict はここでも除かれます。
`--copy` は終了コード 0 で終了します。

Chrome と Firefox ではループバック経路が機能し、CLI は URL を出力するときにそのことを
伝えます。

```
Open the URL in Chrome or Firefox (Safari blocks http://127.0.0.1 from an https page).
```

## フラグ

| フラグ | 意味 |
|---|---|
| `--solution` / `--verdict` / `--trace` | 判別結果を上書きする |
| `--port N` | ポートを固定する (既定は 0、つまり空きポート) |
| `--no-browser` | ブラウザを開かずに URL を出力する |
| `--copy` | 配信せずにファイルパスを出力する |
| `--app-origin URL` | ファイルの読み取りを許可するオリジン (既定は `https://drawtonomy.com`) |

## 終了コード

| コード | 意味 |
|---|---|
| 0 | 正常に実行・終了した (`--copy` を含む) |
| 2 | 対象が存在しない、scenario を含まない、上書き指定が存在しないファイルを指している、またはポートをバインドできなかった |

## 関連

- [`verdict-sidecar.ja.md`](verdict-sidecar.ja.md) - `drawtonomy-verdict/1` 形式。
- [`planning-trace-format.ja.md`](planning-trace-format.ja.md) -
  `drawtonomy-planning-trace-v1` 形式。
