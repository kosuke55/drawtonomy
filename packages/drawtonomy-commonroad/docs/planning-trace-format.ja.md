# drawtonomy planning trace (`drawtonomy-planning-trace-v1`)

[English](planning-trace-format.md)

**planning trace** は、1 回の実行でアクターが実際に*走った*ものと、そのプランナーが各再計画
サイクルで*意図した*ものの両方を記録します。これはどのプランナーでも出力できるオープンな
プレーン JSON ファイルで、drawtonomy はこれを読んで実行を再生し、作成したシナリオの上に
プランナー自身の出力を描きます。

## このファイルが存在する理由

CommonRoad の solution が保持する軌跡は 1 本だけ、つまり ego が実際に走った 1 本の経路です。
周期的なプランナーは再計画サイクルごとに新しい軌跡を計算し、それぞれ数秒先まで見通した
うえで、最初のコンマ数秒だけを実行します。planning trace はその両方を保持します。各トラックは
`driven` (アクターが実際に走った状態) と `plans` (各サイクルでプランナーが意図したもの) を
持ちます。これにより trace は自己完結し、ファイルを 1 つ drawtonomy にドロップすれば実行を
再現できます。公式チェッカーの形式は引き続き CommonRoad の solution であり、trace はそれを
拡張します。

### drawtonomy がどう描くか

| ビジュアル | 意味するもの | 出どころ |
| --- | --- | --- |
| **パス線** | 作成した仕様、つまりシナリオがアクターに*求めている*こと | 描いたシナリオ |
| **ゴースト** | 作成した ego、つまりシナリオが車両はここにいると述べていた位置 | trace か solution を読み込んだ後のシーン |
| **動く車両** | アクターが*実際に走った*もの | `driven` (または solution の軌跡) |
| **計画軌跡** | プランナーの出力、つまりプランナーが*決めた*こと | 最新の計画、または単純な再生の未来部分 |

planning trace が無い場合、計画軌跡は読み込んだ再生の未来部分 (再生ヘッド以降の solution の
残り) を示します。**あるアクターに planning trace が読み込まれている場合、そのアクターの
計画軌跡は現在時刻かそれ以前に発行された最新の計画** (`t` が `t <= now` を満たす中で最大の
もの) を、再生ヘッドから先へ切り出して示します。最初の計画の `t` の前は、そのアクターに
ついて何も描かれません。プランナーがまだ何も出力していないためです。

`driven` がシナリオより先に終わる場合、動く車両は最後に走った状態を保ち、計画軌跡もそれに
合わせて、最後に走った時刻から切り出したまま止まります。

パス線は planning trace によって変化しません。

#### 色 = 加速度

状態が `v` を持つ場合、計画軌跡はそこから導かれる**加速度**で色付けされます (隣接する状態に
よる中心差分)。色は緑で、減速中は濃く、加速中は淡くなります。

| 色 | 意味 |
| --- | --- |
| `#00e89d` (`trajectory-neutral`) | 等速、\|a\| が 0.05 m/s² 未満 |
| `#008956` (`trajectory-decel`)、\|a\| が大きいほど濃い | 減速中 |
| `#aff8d1` (`trajectory-accel`)、\|a\| が大きいほど強い | 加速中 |

スケールは**軌跡に対する相対値**です。trace 全体 (すべての計画と driven トラック。読み込み時に
一度決めます) での最大 |a| を最も濃い色とし、ランプは不感帯からの |a| に対して**線形**です。
ほぼ等速の軌跡 (最大 |a| が 0.3 m/s² 未満) では代わりに 0.3 m/s² をスケールとします。
したがって、異なる 2 つのファイルの同じ色が同じ m/s² を意味するわけではありません。

0.1 秒ごとの各セグメントは両端で 2 つの状態の色を取り、両端が異なる場合はその間を線形
グラデーションでつなぎます。`v` を持たない状態は等速の緑で描かれます。

## 例

```json
{
  "schema": "drawtonomy-planning-trace-v1",
  "scenario": "ZAM_Untitled202609011139-1_1_T-1",
  "producer": { "name": "commonroad-reactive-planner", "version": "2025.1" },
  "frame": "center",
  "tracks": [
    {
      "role": "ego",
      "vehicle": { "type": "BMW_320i", "length": 4.508, "width": 1.61, "refToCenter": 1.4227170936 },
      "driven": [
        { "t": 0.0, "x": 12.34, "y": -1.2, "h": 0.01, "v": 13.9 },
        { "t": 0.1, "x": 13.7, "y": -1.2, "h": 0.01, "v": 13.9 },
        { "t": 0.2, "x": 15.1, "y": -1.2, "h": 0.01, "v": 13.9 },
        { "t": 0.3, "x": 16.5, "y": -1.2, "h": 0.01, "v": 13.9 }
      ],
      "plans": [
        {
          "t": 0.0,
          "states": [
            { "t": 0.0, "x": 12.34, "y": -1.2, "h": 0.01, "v": 13.9 },
            { "t": 0.1, "x": 13.7, "y": -1.2, "h": 0.01, "v": 13.9 }
          ]
        },
        { "t": 0.3, "states": [{ "t": 0.3, "x": 16.5, "y": -1.2 }] }
      ]
    }
  ]
}
```

## スキーマ

### トップレベル

| フィールド | 型 | 必須 | 意味 |
| --- | --- | --- | --- |
| `schema` | string | **はい** | 厳密に `"drawtonomy-planning-trace-v1"`。それ以外の値は、サポートするスキーマ名を示して拒否されます。 |
| `frame` | `"center"` \| `"ref"` | **はい** | 位置が何を意味するか。[単位と基準点](#単位と基準点)を参照。 |
| `tracks` | array | **はい** | アクターごとに 1 エントリ、最低 1 つ。 |
| `scenario` | string | いいえ | この trace を計算した対象のシナリオ識別子。[trace とシーンの対応付け](#trace-とシーンの対応付け)を参照。 |
| `producer` | object | いいえ | 自由形式。慣例として `{ "name": ..., "version": ... }`。情報提供のみ。 |

### `tracks[]`

| フィールド | 型 | 必須 | 意味 |
| --- | --- | --- | --- |
| `role` | `"ego"` | `role` / `name` のちょうど一方 | シーンで ego として印が付いたアクターに対応します。 |
| `name` | string | `role` / `name` のちょうど一方 | エンティティ名でアクターに対応します。 |
| `driven` | array | **はい** | この実行でこのアクターが実際に走った状態、最低 1 つ。 |
| `plans` | array | **はい** | このアクターのプランナーが発行した計画、最低 1 つ。 |
| `vehicle` | object | いいえ | プランナーが計画に用いた車体。[`tracks[].vehicle`](#tracksvehicle) を参照。 |

`role` と `name` の両方を与えること、どちらも与えないことはエラーです。

### `tracks[].vehicle`
<a id="tracksvehicle"></a>

| フィールド | 型 | 必須 | 意味 |
| --- | --- | --- | --- |
| `length` | number | **はい** (`vehicle` があるとき) | 車体長 (メートル)、有限かつ > 0。 |
| `width` | number | **はい** (`vehicle` があるとき) | 車体幅 (メートル)、有限かつ > 0。 |
| `refToCenter` | number | いいえ | 参照点 (後車軸中心) から車体中心までの、進行方向に沿った距離 (メートル)、有限かつ >= 0。 |
| `type` | string | いいえ | 自由なラベル。例えば CommonRoad の車両タイプ名 (`"BMW_320i"`)。再生バッジのツールチップに表示されるだけで、解釈はされません。 |

CommonRoad の planning problem は ego の形状を持ちません。ego のサイズはプランナー側で選ばれ
(solution の `vehicle_type`)、公式チェッカーが衝突判定に使うのはその車体なので、drawtonomy が
描くにも同じ車体が必要です。`vehicle` はそれを記録します。

- **動く車両**は、作成時のサイズではなくプランナーの `length` x `width` で描画・衝突判定され、
  計画軌跡の幅もそれに従います。
- **ゴースト**は作成時のサイズを保つので、作成したものと計画されたものの差が隠れずに
  見えたままになります。
- `refToCenter` は `frame: "center"` のファイルにおける中心から参照点への変換に使われます。
  省略した場合は、作成した車両の参照点オフセットが使われます。

シーンには何も書き戻されません。**solution** ファイルでは、同じ情報がベンチマーク id の
車両タイプ桁 (`KS2:...` = type 2 = BMW_320i) から導かれるので、solution とその trace は ego を
同じサイズで表示します。

`vehicle` 内の未知のキーは、他の箇所と同様に無視されます。`length` / `width` が欠けている、
または正でない `vehicle` は、該当フィールド名を示して拒否されます。

### `tracks[].driven[]`

[`plans[].states[]`](#plansstates) と同じ状態スキーマです。`t`、`x`、`y`、任意の `h`
(省略時は同じ方法で導出されます)、任意の `v` を、ファイルの `frame` で表します。状態は
最低 1 つ、`t` の昇順で、同じ時刻の状態が 2 つあってはいけません。

`driven` はアクターを動かすものなので**必須**です。省略はフィールド名を示すエラーになります。
閉ループのプランナー実行では、`driven` はまさに solution の軌跡であり、solution を書き出すのと
同じ状態列から書き出してください。

### `plans[]`

| フィールド | 型 | 必須 | 意味 |
| --- | --- | --- | --- |
| `t` | number | **はい** | この計画が*発行された*時刻 (秒)。 |
| `states` | array | **はい** | 計画された状態、最低 1 つ、`t` の昇順。 |

`states[0].t` は計画の `t` と (1e-6 以内で) 一致しなければなりません。計画は発行された瞬間から
始まる必要があるためです。計画は読み込み時に `t` でソートされるので、書き手の順序は問いません。
ただし同じ `t` で発行された計画が 2 つあるとエラーです。

### `plans[].states[]`
<a id="plansstates"></a>

| フィールド | 型 | 必須 | 単位 |
| --- | --- | --- | --- |
| `t` | number | **はい** | 秒 |
| `x` | number | **はい** | メートル |
| `y` | number | **はい** | メートル |
| `h` | number | いいえ | ラジアン、反時計回り、0 = +x。省略時、drawtonomy は次の状態への方向から導出します (最後の状態は 1 つ前の方位を繰り返します)。`frame: "center"` を書き出すプロデューサーは含めるべきです。中心から参照点への変換に方位が必要であり、導出した方位はカーブでは近似にすぎないためです |
| `v` | number | いいえ | メートル毎秒 (スカラーの速さ) |

## 単位と基準点

位置は **Y 軸を上向きとする ENU のメートル**です。これは drawtonomy が読むすべての再生形式が
使っている慣例と同じです。時刻は**秒**であり (整数のタイムステップではありません)、
シナリオの `timeStepSize` を知らなくても trace を読めます。

`frame` は、座標が車両上のどの点を表すかを示します。

- `"center"` : **車体中心**。CommonRoad の `position` が意味するのはこれなので、CommonRoad の
  solution と併せて生成された trace はほぼ常に `"center"` です。
- `"ref"` : **参照点**、つまり後車軸の中心。OpenSCENARIO のエンティティ位置が意味するのは
  これで、drawtonomy が内部で使っているのもこれです。

これを取り違えても分かりやすいエラーにはならず、軌跡が静かにおよそ 1 m (後車軸から車体中心
までの距離) ずれるだけです。

## trace とシーンの対応付け

planning trace は再生ファイルそのものなので、トラックとアクターの対応付けは他の再生形式と
同じ規則で行われます。

- `"role": "ego"` → 開いているシーンで ego として印が付いたアクター。
- `"name": "..."` → その名前のエンティティ。完全一致 (大文字小文字を区別) が優先され、
  大文字小文字を無視した一致は、それが一意なときにだけ受け付けられます。

どれにも一致しないトラックは無視され、drawtonomy は推測するのではなく、配置できなかった
名前を伝えます。

`scenario` があり、開いているシーンにも既知のシナリオ識別子がある場合、両者は一致しなければ
なりません。食い違いは両方の識別子を示すエラーで拒否され、何も読み込まれません。

## 読み込み

trace は**単体で十分**です。ドロップすると読み込み済みの再生として設定されます。対応した
アクターは自身の `driven` の状態に沿って動き、作成したアクターはゴーストになり、計画軌跡は
最新の計画を示します。他に何も読み込む必要はありません。

solution の読み込みは任意で、**どの再生ファイルも現在のものを置き換える**という通常の規則に
従います。drawtonomy が読み込んだ状態に保つ再生はちょうど 1 つです。

- **trace の後に solution** : solution が読み込み済みの再生になります。その軌跡がアクターを
  動かし、solution は計画を持たないので、計画軌跡は再生の未来部分を示す状態に戻ります。
- **solution の後に trace** : trace が読み込み済みの再生になり、`driven` と計画の両方を
  持ち込みます。

trace が読み込まれている間、drawtonomy は最初の計画の先頭が、その時刻に実行結果が示す
アクターの位置と一致するかを確認します。0.05 m を超える不一致は、表示を妨げずに報告されます
(その場合、計画と driven の状態は別々の実行のものか、`frame` が誤っています)。

trace の寿命は他の再生とまったく同じです。シーンが置き換わったとき (インポート、New canvas、
ドキュメント境界をまたぐ undo)、およびシナリオを編集したときに解除され、そのたびにどの
ファイルがなぜ解除されたかを伝えます。

`solution.verdict.json` サイドカー ([形式](verdict-sidecar.ja.md)) は、solution の再生と
同じように trace の再生にも紐づきます。両者はシナリオ id でペアになります。verdict 自体は
常に公式チェッカーが CommonRoad の solution から計算するもので、trace はそれを保持も代替も
しません。

## ファイル名

所属する solution にちなんだ名前を付けるのは**推奨**であって要件ではありません。

```
planner_solution.xml
planner_solution.planning-trace.json
```

読み手はファイルを**名前ではなく `schema` フィールドで**識別するので、どんな名前でも動きます。
この慣例はディスク上でペアをまとめておくためのものにすぎません。

scenario と trace を**一緒に**ドロップする (または Import... で選択する) と、シナリオを開いて
trace をその再生として設定するところまでが 1 ステップで済むので、1 回の実行を 2 つのファイルで
受け渡せます。同じドロップに solution が含まれている場合は trace が優先され、読み込まれ
なかったファイル名はトーストで伝えられます。`solution.verdict.json` サイドカーも同じドロップに
含められます。

## 互換性の方針

スキーマ文字列がメジャーバージョンを表し、**v1 は追加のみ**です。

- **どの階層でも未知のフィールドは無視されます。** 新しい任意フィールドは、どの読み手も
  壊さずに v1 へ追加できるので、プロデューサーはすぐに追加情報の出力を始められます。
- **破壊的変更には新しいスキーマ文字列**が与えられ (`drawtonomy-planning-trace-v2`)、
  読み手は v1 も受け付け続けます。既存のファイルが動かなくなることはありません。
- 認識できないスキーマのファイルは、部分的に読むのではなく、サポートするスキーマ名を示す
  メッセージとともに拒否されます。

### 予約: `plans[].candidates`

`candidates` は、そのサイクルでプランナーが評価したサンプリング軌跡の集合のために、計画上で
**予約**されています。これは v1 の一部ではありません。書き出しても害はありません (他の未知の
フィールドと同様に無視されます) が、drawtonomy はそれを描画せず、その構造もまだ確定して
いません。当てにしないでください。

## 生成する

`drawtonomy-commonroad` パッケージの `TraceWriter` で書き出します。

```bash
pip install drawtonomy-commonroad
```

```python
from drawtonomy_cr.trace import TraceWriter

w = TraceWriter(dt=0.1, vehicle=dict(length=4.508, width=1.61, refToCenter=1.4227,
                                     type="BMW_320i"))
for cycle in my_planner_loop():
    w.plan(t=cycle.t, states=cycle.trajectory)   # one entry per replanning cycle
w.driven(executed_states)                        # what the ego actually drove
w.write("solution.planning-trace.json", solution="solution.xml")
```

状態には commonroad-io の `State` オブジェクトか、素の
`{"x":, "y":, "orientation":, "v":, "time_step":}` の dict を使えます。`write()` は 2 つの
PASS/FAIL チェックを実行し、どちらかが失敗した場合は書き出さずに例外を送出します。それぞれ
最悪の偏差を出力します。

1. **`driven` が solution の軌跡と一致すること** (同じ長さ、同じタイムステップ、位置が
   1e-6 m 以内)。
2. **各計画の実行済み先頭部分が、同じタイムステップで `driven` と一致すること**。これにより、
   計画が発行された瞬間に計画軌跡と動く車両は一致します。

### 最小の例: IDM プランナー

`examples/idm_planner/` は commonroad-io と numpy だけに依存する 1 ファイルの例です。ego は
開始した lanelet の中心線をたどり、速度は IDM の追従モデルが決めます。solution と trace を
同じ車体で書き出します。同梱の 2 つのモードについては README で説明しています。ご自身の
プランナーの出発点としてコピーしてお使いください。

```bash
python3 idm_planner.py scenario.xml out/
```

### 実例: commonroad-reactive-planner

`examples/reactive_planner/run_planner.py` は、生成した solution の隣に trace を書き出します。
プランナー側はご自身のものに置き換えてください。スクリプトはサイクルごとの最適軌跡
(`optimal_traj_list`) を `plan` として、記録済みの実行状態を `driven` として渡し、**両方**を
solution と同じ呼び出し (`planner.convert_state_list_to_commonroad_object`) に通すので、
3 つとも最後の桁まで一致します。トラックの `vehicle` はプランナー自身の `config.vehicle` から
取られます (length、width、`refToCenter` としての `wb_rear_axle`、`type` としての CommonRoad
車両タイプ名)。

このスクリプトは独自の目標速度を設定しません。プランナーの既定の規則は planning problem の
ゴールの `<velocity>` 区間を読み (区間の下限が 0 より大きいときは中点、そうでなければ上限の
半分)、ゴールに区間が無ければ初速にフォールバックします。drawtonomy はその区間を ego の
**Goal speed limit** (`[0, max]`) から書き出すので、60 km/h の制限はプランナーが 30 km/h を
目指すことを意味します。初速を保ちたい場合は未設定のままにしてください。

Linux x86_64 では、プランナーをこのパッケージと並べてインストールして実行します:

```bash
pip install "drawtonomy-commonroad[checker]" commonroad-reactive-planner \
    commonroad-route-planner imageio matplotlib
python3 examples/reactive_planner/run_planner.py scenario.xml out/
```

プランナーの wheel を入れられない環境では、`examples/reactive_planner/Dockerfile` が
必要なものを全部入れたイメージをビルドします。そのディレクトリでビルドし、カレント
ディレクトリのシナリオに対してスクリプトを実行してください:

```bash
docker build --platform linux/amd64 -t cr-planner .
docker run --rm --platform linux/amd64 -v "$PWD:/work" cr-planner \
  python3 /opt/reactive_planner/run_planner.py /work/scenario.xml /work/out
```

## 関連

- [`verdict-sidecar.ja.md`](verdict-sidecar.ja.md) : solution に対する公式チェッカーの verdict を
  運ぶ `solution.verdict.json` 形式。
- [`open-server-protocol.ja.md`](open-server-protocol.ja.md) : `drawtonomy-cr open` が何を配信し、
  変更をどう通知するか。
