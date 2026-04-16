# 詳解xs
副題: Webエンジニアのための組み込みJavaScriptランタイム入門

## まえがき

`xs` は、ブラウザや Node.js に慣れた JavaScript エンジニアが、いちばん最初に前提を壊されるランタイムだ。

Web の JavaScript では、ソースコードは実行時に読まれるものだ。エンジンは巨大で、JIT を持ち、数十 MB から数 GB のメモリを使い、起動に多少時間がかかっても許される。対して `xs` が主戦場とするのは、数十 KB の RAM、数百 KB から数 MB のフラッシュ、低いクロック、電池駆動、そして「壊れないこと」が重要なマイクロコントローラである。

この違いは、単に「軽量化した JavaScript エンジン」という一言では片付かない。`xs` は、JavaScript エンジン一般の原理を共有しながら、組み込み用途の制約に合わせて、ビルド時前倒し、ROM 常駐、プリロード、フリーズ、機能のデッドストリップ、固定予算メモリ管理といった設計を強く押し進めている。

本書の目的は三つある。

1. JavaScript エンジン一般の仕組みを、Web エンジニアが使ってきた言葉で理解すること。
2. `xs` がその一般論の上に、どこをどう変えているかを理解すること。
3. その設計理由を踏まえて、組み込み JavaScript 開発の実践を身につけること。

本書は初版として、`xs` と Moddable SDK におけるコアランタイム、ツールチェーン、プリロード、メモリ管理、ホスト連携、デバッグ、実践指針に焦点を絞る。個々のデバイスドライバや UI フレームワークの詳細には踏み込みすぎず、あくまで「なぜその書き方が良いのか」をランタイムの原理に結びつけて説明する。

## 対象読者

- 普段から JavaScript や TypeScript を業務で書いている Web エンジニア
- Node.js やブラウザの API には慣れているが、JS エンジン内部は追っていない人
- マイコンや組み込み開発では、RAM/ROM/起動時間/消費電力の制約をまだ身体で理解していない人

## 本書の読み方

本書では、意図的に「JavaScript エンジン一般の話」と「xs 固有の話」を分けて書く。

- 一般論: 他のエンジンでも概ね成立する見方
- xs 固有: `xs` が特に強く採用している設計、あるいは `xs` だけで目立つ挙動

この区別が曖昧になると、読者は「それは JavaScript エンジンの常識なのか」「組み込み向け xs の選択なのか」が分からなくなる。本書ではそこを最重要の説明軸にする。

## 目次

1. Web エンジニアの前提をいったん捨てる
2. JavaScript エンジンの共通モデル
3. xs と Moddable の全体像
4. xs のランタイムデータ構造
5. コンパイルと実行
6. メモリ管理
7. ROM を前提にした設計
8. C/ホストとの連携
9. 非同期、モジュール、隔離
10. デバッグ、計測、トラブルシュート
11. 組み込み JavaScript の実践原則
12. 小さな実践例
13. なぜ xs なのか
14. 終章
15. 付録

---

## 第1章 Web エンジニアの前提をいったん捨てる

### 1.1 何が違うのか

ブラウザや Node.js の感覚で JavaScript を使っていると、次の前提が無意識に染みついている。

- ソースコードは実行時に読むもの
- パーサや JIT を常時抱えていてよい
- 起動時に多少の初期化コストを払ってよい
- オブジェクトを動的に増やしてもメモリは何とかなる
- `eval` や `Function` はあって当然
- ランタイムは巨大でも構わない

組み込みでは、これらの前提が崩れる。

- ソースコードを毎回パースする余裕がない
- 使わない機能を抱え込む ROM 余裕がない
- 起動が遅いと UX も電池寿命も悪化する
- RAM は「不足すると遅くなる」のではなく「即死する」
- 動的変更を許すためのメタデータが、数バイト単位でも痛い

`xs` は、この制約に正面から合わせる。その結果、`xs` の設計で本質的なのは「小さいこと」ではなく「前倒しで決められるものを全部ビルド時に決めること」だ。

### 1.2 リソース制約は量ではなく種類の違いでもある

Web サーバやデスクトップでは、メモリ不足はスワップや OOM killer の話になりやすい。組み込みでは、そもそも OS が薄いか無い。失敗したときに逃げ道が少ない。

そのため、設計思想が変わる。

- 実行時最適化より、ビルド時最適化を優先する
- 平均性能より、起動時と最悪時の予測可能性を重視する
- 柔軟性より、固定化と凍結を優先する
- 汎用性より、特定デバイス向けの最適化を受け入れる

`xs` を理解するとは、この発想の転換を受け入れることでもある。

### 1.3 本書の立場

本書は、組み込み開発を「Web より不自由な世界」としては扱わない。むしろ逆で、制約がきついからこそ、ランタイムの内部原理とアプリケーション設計が密接につながる世界として扱う。

Web では、エンジン内部を知らなくても、それなりに動くアプリは書ける。`xs` では、内部原理を知るほどコード品質が上がる。これが本書の主張である。

---

## 第2章 JavaScript エンジンの共通モデル

### 2.1 一般的な JavaScript エンジンでは

JavaScript エンジンは細部こそ違え、だいたい次の段階を持つ。

1. ソースコードを読む
2. 字句解析する
3. 構文解析して AST を作る
4. 変数やスコープを解決する
5. バイトコードあるいは内部表現を作る
6. インタプリタまたは JIT で実行する
7. 実行中にオブジェクトをヒープに積み、GC で回収する
8. ホスト環境が I/O やタイマやイベントループを提供する

ここで重要なのは、JavaScript エンジンは単なる「式を評価する関数」ではなく、以下の三層を持つということだ。

- コンパイラ層: パース、スコープ解決、コード生成
- ランタイム層: 値、オブジェクト、関数、例外、モジュール、Promise
- ホスト層: ファイル、ネットワーク、タイマ、画面、デバッグ、ジョブ実行

### 2.2 スタックとヒープ

多くのエンジンは、実行中の一時値やフレームをスタックに置き、オブジェクトや配列やクロージャの実体をヒープに置く。

- スタック: 短命、LIFO、関数呼び出しと式評価の作業領域
- ヒープ: 長命、可変サイズ、GC 管理対象

これは `xs` でも同じだ。ただし `xs` では、その表現がかなり露骨で、しかも組み込み向けに最適化されている。

### 2.3 スコープ解決とクロージャ

JavaScript では識別子検索が高頻度に起きる。毎回文字列で名前探索していては遅い。そこで、ほとんどのエンジンはコンパイル時に識別子を解析し、ローカル、クロージャ、グローバルなどに分類して、実行時にはインデックスアクセスへ落とし込む。

この原理は `xs` にもある。むしろ `xs` は RAM を削るため、必要な閉包だけを持つよう強く設計されている。

### 2.4 ガベージコレクション

GC の戦略には世代別 GC、並列 GC、インクリメンタル GC、コピー GC、マークスイープ、コンパクションなど多様な流儀がある。Web 向け大規模エンジンは停止時間と throughput の両立のために複雑になる。

組み込みでは事情が違う。アルゴリズムの理論性能だけでなく、実装サイズ、補助データ構造の RAM、MMU の有無、断片化耐性が効いてくる。

`xs` の GC は、まさにその制約から読み解くべきだ。

### 2.5 ホストの役割

ECMAScript 仕様は言語本体を定義するが、ファイルやソケットやタイマや UI はホスト依存だ。ブラウザなら DOM、Node.js なら libuv ベースの API がホスト層に当たる。

`xs` でも同じで、エンジン本体は汎用機能だけを持ち、デバイス I/O やネットワークや画面はホストが与える。この分離を理解すると、「JavaScript で書いているのに C を書く理由」が見えてくる。

---

## 第3章 xs と Moddable の全体像

### 3.1 xs はどこにいるのか

`xs` は Moddable SDK の中核にある JavaScript エンジンだ。単体のテスト実行用エンジンとしては `xst` があり、実際のアプリケーションビルドでは `mcconfig`、`xsc`、`xsl`、各種アセット変換ツール、C/C++ ツールチェーン、`xsbug` が協調する。

Web エンジニア向けに言い換えるなら、`xs` 単体は V8 的な存在だが、実際の開発体験は bundler、AOT コンパイラ、ROM イメージ生成器、デバッガが一体化した組み込み SDK である。

### 3.2 ツールチェーンの流れ

典型的な流れは次のようになる。

1. JavaScript モジュールを書く
2. マニフェストにモジュール、データ、リソース、生成設定を書く
3. `xsc` が JavaScript を XS バイトコード (`.xsb`) に変換する
4. `xsl` が複数の `.xsb` をリンクし、必要ならプリロードを実行して read-only な VM 準備データを作る
5. `mcconfig` が makefile を生成し、C 側とリンクしてターゲット用成果物を作る
6. デバイスまたはシミュレータにデプロイする

この時点で、Web と最も違うのは「デバイス上ではソースを読まないことが普通」だという点だ。

### 3.3 一般論と xs 固有の区別

一般論として、JavaScript を事前コンパイルしてバイトコードを保存する設計は珍しくない。

だが `xs` はそこから一歩進む。

- モジュール本体の一部をビルド時に実行する
- ビルトインや多数のモジュールを ROM に準備済みの状態で焼き込む
- 起動時にはその read-only VM を clone して走らせる

これは `xs` の強い個性であり、組み込み向けである理由そのものだ。

ここで重要なのは、`xs` の「準備済み状態」が単なる bytecode cache ではないことだ。`xsl` が作るのは、バイトコードだけでなく、preload 済みオブジェクト、キー配列、シンボル表、各種 built-ins を含んだ read-only machine image に近い。起動時はその準備済み machine を `prepare`/`clone` する発想なので、Web 的な「bundle を読んでから初期化」より一段深く前倒ししている。

### 3.4 `xsc`, `xsl`, `mcconfig`, `xst`

それぞれの役割を短くまとめる。

- `xsc`: JavaScript を XS バイトコードへコンパイルする。`@` 構文による C ホスト連携も扱う
- `xsl`: バイトコード群をリンクし、必要なモジュールをプリロードし、ストリップも行う
- `mcconfig`: マニフェストを起点に全体ビルドを司る
- `xst`: デスクトップ上で XS を試すテスト用エンジン

`xst` があるおかげで、開発者は「まずローカルで XS の言語挙動を確かめる」というワークフローを取りやすい。これは Web でいう「Node.js で手元検証してから本番へ」に近い。

ただし `xst` は simulator そのものではない。通常の Moddable アプリをシミュレータで動かすときは、`mcconfig` が `mcsim` 向け成果物を作って起動する。`xst` はあくまで「XS を直接試すための独立した host shell」であり、manifest/preload/resource/device host を丸ごと再現するものではない。

### 3.4.1 実行時の受け渡し

アプリ起動時の流れも、Web よりはっきり分けて理解するとよい。

1. `xsl` が生成した frozen preparation をホストが読み込む
2. `xsPrepareMachine` 相当で live machine を clone する
3. `setup/*` モジュール群を import する
4. `creation.main` で指定された main module を import する
5. その default export が callable なら起動エントリとして呼ぶ

つまり、`main.js` が単独で世界を立ち上げるのではない。host が machine を起動し、その上で setup と main が順に組み合わされる。

### 3.5 マニフェストは単なる設定ファイルではない

Moddable のマニフェストは、Webpack や Vite の config に近い顔をしつつ、もっと低レベルな責任を持つ。

- どのモジュールを入れるか
- どれをプリロードするか
- どの機能を strip するか
- VM のメモリ予算をどうするか
- デバイス差分をどう吸収するか

つまり、マニフェストは「アプリの依存設定」ではなく「ランタイムの物理設計図」に近い。

次のような設定は `xs` を理解していないと適切に書けない。

```json
{
  "creation": {
    "static": 32768,
    "chunk": {
      "initial": 1536,
      "incremental": 512
    },
    "heap": {
      "initial": 512,
      "incremental": 64
    },
    "stack": 256,
    "keys": {
      "initial": 32,
      "incremental": 0,
      "name": 53,
      "symbol": 3
    },
    "main": "main"
  },
  "strip": "*",
  "preload": [
    "setup/network"
  ]
}
```

### 3.6 言語仕様上の注意点

`xs` は ECMAScript への高い準拠を目指しているが、Web エンジニアが最初に踏みやすい差分はいくつかある。

- `Function.prototype.toString` は期待通りに使えない
  - `xs` は関数ソースを保持しない設計なので、ソース文字列を返す前提を置けない
- `Intl` は基本的に無い
  - ECMA-402 は別仕様であり、組み込みではコストが大きい
- Annex B を前提にしない
  - ブラウザ互換の歴史的仕様群に依存しない
- `RegExp` の Unicode property escapes は既定で無効なことがある
  - 大きいテーブルを要するため
- 文字列内部表現は既定で UTF-8
  - Web の UTF-16 感覚とずれる場面がある
- tagged template の cache は未実装

この差分群は「手抜き」ではなく、ほとんどが ROM/RAM 予算と引き換えの設計である。Web の常識で差分だけを見ると不便に見えるが、組み込みの制約まで含めると合理的なものが多い。

---

## 第4章 xs のランタイムデータ構造

### 4.1 機械の中心は machine

`xs` の中心構造は machine である。machine は 1 つの ECMAScript realm に相当し、独自のスタック、ヒープ、キー配列、シンボル表、デバッガ接続などを持つ。

ここは一般論でも同じだ。多くのエンジンは isolate や realm や context に相当する単位を持つ。

`xs` 固有なのは、その構造がかなり明示的であることだ。machine は現在の `stack`, `scope`, `frame`, `code` を直接保持し、実行中のインタプリタ状態がはっきり見える。

### 4.2 slot という基本単位

`xs` では slot が基本単位になる。slot は固定サイズの構造で、値、参照、プロパティ、フレーム、クロージャ参照など、あらゆるものを表す。

一般論としても、エンジン内部には tagged value や heap cell のような基本単位がある。しかし `xs` ではそれが前面に出る。

slot の特徴は次の通りだ。

- 固定サイズなので管理が単純
- `next` を使って連結リストを作れる
- `id`, `flag`, `kind`, `value` を持つ
- オブジェクトのプロパティ列やスコープ表現にも使われる

これは RAM を抑える一方で、プロパティ探索や複雑な最適化には不利になる。そこで `xs` は後述する ROM colors など別の手を打つ。

### 4.3 chunk という可変長領域

slot に収まらないものは chunk に置かれる。

- 文字列
- バイトコード
- ArrayBuffer
- 配列要素の実体
- bigint データ
- ホストデータ

slot が固定長セル、chunk が可変長データブロックだと考えると分かりやすい。

`xs` で特に重要なのは、chunk は移動可能だという点である。GC は chunk をコンパクト化できる。MMU を前提にしない組み込みでは、断片化の回避が生死を分ける。

### 4.4 スタック、フレーム、スコープ

`xs` のインタプリタはスタックベースだ。バイトコードは値を push/pop し、関数呼び出し時には frame を積む。C スタックではなく、machine 内の JavaScript スタックを使う。

これには二つの利点がある。

- JavaScript の実行資源を C スタックと分離できる
- 組み込み環境で JavaScript 側の使用量を明示的に管理しやすい

スコープも重要だ。`xs` はコンパイル時に識別子を束縛し、実行時にはインデックスベースで局所変数やクロージャへアクセスする。名前検索のコストも RAM も減らせる。

### 4.5 keys, names, symbols

JavaScript は動的言語なので、プロパティ名を管理する仕組みが必要だ。`xs` は key array を持つ。

ここで組み込み特有の話が出る。

- ホストやプリロード済みモジュールのキーはビルド時に揃えられる
- 実行時に増えるキーは `keys.initial` と `keys.incremental` で予算化できる

つまり、動的言語の「後から勝手に増える名前空間」にも、`xs` は予算管理を持ち込む。

### 4.6 ここまでの要点

一般的な JS エンジンでも、スタック、ヒープ、スコープ、識別子表はある。

`xs` の特徴は、その構造を組み込み向けに単純で明示的にし、ROM と RAM の境界を強く意識した表現にしていることだ。

---

## 第5章 コンパイルと実行

### 5.1 一般的な流れ

JavaScript のコンパイルは、だいたい次の順で進む。

1. パースして構文木を作る
2. 宣言を hoist する
3. スコープ束縛を解決する
4. バイトコードや内部 IR を作る

`xs` でも同じで、実装上もこの段階がかなり素直に見える。

### 5.2 xs ではどう進むか

`xs` の既定のパース処理はおおまかに次を行う。

1. `fxParserTree`
2. `fxParserHoist`
3. `fxParserBind`
4. `fxParserCode`

つまり、構文木、巻き上げ、束縛、コード生成という順番が明示的に分かれている。

これは読者にとって重要だ。なぜなら、後で説明するプリロード、ストリップ、クロージャ最適化は、このコンパイル段階の情報を前提にしているからだ。

### 5.3 バイトコードインタプリタ

`xs` のランタイム中心には大きなバイトコードインタプリタがある。computed goto を使ったディスパッチを採用し、分岐予測に有利な形で opcode を回す。

ここは「速さのために JIT を使う」のではなく、「インタプリタのままでも必要十分に速く、かつ小さく保つ」設計だ。

一般論:

- Web 向けエンジンは JIT を使い、高速化のために巨大な最適化器を持つ

xs 固有:

- マイコン上で JIT を持つコストが大きすぎる
- 事前コンパイルと bytecode 実行で、十分な体感性能を狙う
- 起動の速さと ROM/RAM 予算の明示性を優先する

### 5.4 スコープ最適化とクロージャ最小化

`xs` は、識別子を単に「名前」で探さない。コンパイル時にローカル、クロージャ、グローバルを分析して、必要最小限の閉包だけを持つ。

これが効くのは RAM だ。

- 不要な閉包を持たない
- 実行時の名前探索を減らす
- ブロックスコープを stack index として扱える

Web エンジニアから見ると、これは「エンジンが賢い」の一言で済みがちだが、`xs` では「賢さそのものが RAM 節約策」になっている。

### 5.5 モジュール実行

`xs` は ECMAScript modules を前提にした設計を強く取る。`xsc` も既定では module としてパースする。Moddable アプリも基本は module ベースで組む。

これは組み込み向けに都合が良い。

- 依存関係が明確
- ストリップ対象の解析に向く
- プリロード単位として扱いやすい
- `setup/` モジュールのような起動前処理にもなじむ

### 5.6 Promise と Job

Promise そのものは ECMAScript の一般論だが、Job のスケジューリングはホスト依存である。

`xs` は Promise の job queue 自体は管理するが、「いつ `fxRunPromiseJobs` を呼ぶか」はプラットフォームに委ねる。つまり、非同期処理の本質部分はエンジンにあり、スケジューリングのきっかけはホストが握る。

この分離は重要だ。Node.js の event loop を暗黙の前提にしていると、組み込み側で Promise がどう回るかを誤解する。

---

## 第6章 メモリ管理

### 6.1 一般的な GC と xs の立場

Web 向けエンジンでは、世代別、並列、増分、write barrier など複雑な技術が入る。大規模ヒープと長時間稼働に最適化するためだ。

`xs` は違う。目的は「最小 RAM で、断片化に耐えながら、実装サイズも小さくすること」である。

### 6.2 slot heap と chunk heap

`xs` は大きく二つの領域を管理する。

- slot heap: 固定長
- chunk heap: 可変長

GC では、生きている slot を mark し、不要な slot を free list に戻す。一方 chunk 側は compact できる。これが、可変長データの断片化対策になる。

### 6.3 なぜ chunk を動かすのか

組み込みで怖いのは、「総量としては空いているのに、大きい連続領域が取れない」状態だ。ArrayBuffer や長い文字列や一時バッファで起こる。

`xs` は chunk を移動できるので、断片化に強い。slot は動かさず、chunk だけ再配置する。これにより、安定した小メモリ運用がしやすい。

### 6.4 `static` 予算

Moddable の manifest にある `creation.static` は、Web の感覚だとかなり衝撃的だ。これは JavaScript ランタイム全体の利用可能バイト数の上限を与える。

ここが重要だ。

- ただの推奨値ではない
- ランタイムの明示的な予算である
- 予算を超えればアプリは失敗する

つまり `xs` は、メモリ不足を「運用時にじわっと遅くなる問題」ではなく、「設計時に予算化すべき問題」として扱う。

### 6.5 `static = 0` の意味

`static` は便利だが、万能ではない。RAM が複数の不連続領域に分かれる MCU では、一塊の静的領域にすると使い切れない RAM が出ることがある。

その場合は `static` を `0` にし、chunk/heap/stack を別々に割り当てる設計が使える。これはチューニング済みの製品や、特殊なメモリ配置を持つデバイスで効く。

### 6.6 keys もメモリ予算である

実行時に新しいプロパティ名が増えると key array が伸びる。Web では軽視しがちだが、組み込みでは key も明確なコストだ。

そのため、`keys.initial` を小さくし、必要なら `keys.incremental` を許可し、できれば `0` にして増加を止める、という判断が出てくる。

この発想は `xs` を象徴している。動的言語の動的さを、そのまま無制限には受け入れない。

### 6.7 文字列表現

`xs` は既定で文字列を UTF-8 で保持する。これはメモリには有利だが、標準 JavaScript が前提とする UTF-16 ベースの直感とは少しずれる。

結果として、次のような差異が出る。

- length が code unit 数ではなく code point 数寄りになる
- surrogate pair の扱いが Web の直感と一致しないことがある

厳密な互換性が必要なら CESU-8 系表現を選ぶビルドもできるが、その分コストがある。ここでも `xs` は、まず組み込み現実を取る。

### 6.8 失敗を観測可能にする

`xs` は instrument や xsbug を通じて、chunks, slots, keys などの消費を見やすくしている。これは「ランタイムが小さいから不要」ではなく、むしろ「小さいので予算超過を見える化しないと設計できない」からだ。

---

## 第7章 ROM を前提にした設計

### 7.1 プリロードとは何か

`xs` の最重要機能の一つが preload である。プリロードとは、モジュール本体の一部をビルド時に実行し、その結果できたオブジェクトやクロージャを ROM 側に置いてしまう仕組みだ。

これは一般的な JS エンジンではかなり珍しい。`xs` の個性と言ってよい。

### 7.2 なぜ効くのか

クラス定義は、ソースに書いてあるだけでは実体ではない。モジュール実行時に constructor 関数、prototype、method 関数、継承関係などが組み立てられる。Web では毎回それをやってよい。

組み込みでは、それが高い。

- 起動時間を食う
- RAM を食う
- 毎回同じ仕事をする

ならば、ビルド時に一度だけやって ROM に置けばよい。これが preload の思想だ。

### 7.3 aliasing と freeze

ただし JavaScript は本来、あとからオブジェクトを変更できる。ROM 上のオブジェクトを変更できないと仕様違反になる。`xs` はそこで aliasing を使う。

- ROM 上の aliasable object に対し
- 実行時に変更が入ると
- RAM 側にオーバーレイを作って差し替える

この仕組みは仕様適合のために必要だが、コストがある。alias 用ポインタが必要になる。

そこで効くのが `Object.freeze` と `const` だ。

- オブジェクトを freeze すれば alias 不要
- module scope 変数を `const` にすれば alias 不要
- つまり RAM を節約できる

Web での `Object.freeze` は設計上の趣味に見えることもあるが、`xs` では物理コスト削減手段である。

### 7.4 deep freeze は xs 的に自然

`xs` は `Object.freeze(obj, true)` のような深い freeze を支援する。これは標準 JavaScript ではないが、組み込み用途では実に合理的だ。

浅い freeze では内部オブジェクトに alias が残る。深い freeze なら、一気に ROM 最適化しやすい。

ここでも `xs` は「言語の自由度」より「資源予算の明確さ」を優先している。

### 7.5 自動 freeze と frozen realm 的な環境

リンク後、`xs` は多くの built-ins や preloaded module の関数/プロトタイプを凍結する。これにより、

- RAM 使用量が減る
- 実行環境が安定する
- monkey patching による事故が減る
- Secure ECMAScript 的な方向とも相性が良い

これは、Web で一般的な「何でも動的に差し替えられる」文化とは対照的だ。

### 7.6 strip

`xs` linker は、使っていない言語機能を strip できる。例えば `eval`、`Function`、`RegExp`、`Map/Set` などを状況に応じて削れる。

これは決定的に重要だ。

- 使わない built-in を ROM から落とせる
- パーサ自体を不要にできる場合がある
- セキュリティ面でも攻撃面を減らせる

Web 向けエンジンでは「全部入り」が普通だが、`xs` は「必要な言語だけ載せる」が普通になる。

### 7.7 ROM colors

`xs` には ROM 上のオブジェクトのプロパティ探索を高速化するために graph coloring を使う最適化がある。これは `ROM Colors` として文書化されている。

一般論:

- プロパティ探索高速化には hidden class, shape, inline cache など様々な手法がある

xs 固有:

- ROM に固定配置されるオブジェクト群に対し、色付けで疎なインデックス配置を作る
- linked list のままでも ROM 上での探索を速める
- 複雑すぎない実装で、特に遅いデバイスほど効果が大きい

これは「巨大 JIT を持たずに、静的情報を使って速くする」という `xs` らしい最適化である。

### 7.8 プリロードできないもの

当然、何でもビルド時に動かせるわけではない。

- デバイス依存の native function 呼び出し
- 実機ハードウェア初期化
- 実行時の外部状態が必要な処理

したがって、設計上は次の分離が重要になる。

- プリロード可能な純粋初期化
- 起動時にしかできない副作用処理

この分離ができるコードほど、`xs` で有利になる。

---

## 第8章 C/ホストとの連携

### 8.1 なぜ C が必要なのか

Web 開発では、JavaScript の外側にある巨大なネイティブ実装を意識しないことが多い。だがブラウザも Node.js も、結局は膨大な C/C++ の上に乗っている。

`xs` では、その境界がより露わだ。

- GPIO
- I2C
- SPI
- 画面描画
- TLS
- 高頻度処理

これらは C で実装されることが多い。これは妥協ではなく、組み込みで現実的な設計である。

### 8.2 XS in C の考え方

`xs` は C API を通じて JavaScript 値を slot として扱う。ここで重要なのは、「C から JavaScript オブジェクトをつまむ」のではなく、「slot を介して VM の値を操作する」という感覚だ。

また API には二系統ある。

- `xs*`: 書きやすいがバイナリがやや大きくなりやすい
- `xsmc*`: 少し扱いにくいがバイナリが小さくなりやすい

このトレードオフ自体が、`xs` の世界観をよく表している。

### 8.3 `@` 構文

`xsc` は `-c` オプション付きで `@` 構文を受け付ける。これにより JavaScript のクラスや関数を C 実装へ結びつけられる。

```javascript
class Point @ "Point_destructor" {
  constructor(x, y) @ "Point_constructor"
  moveBy(x, y) @ "Point_moveBy"
  get x() @ "Point_get_x"
  get y() @ "Point_get_y"
}
```

これにより、JavaScript 側には自然な API を見せつつ、実体は C 側の高効率データ構造にできる。

### 8.4 host object と handle

`xs` の host object は chunk を使って C 側データを保持できる。さらに handle の仕組みによって、chunk が移動しても参照の安定性を保てる。

これは非常に組み込み的だ。

- C 側では packed な構造体でメモリ節約
- GC は chunk を移動して断片化を抑える
- slot は動かないので handle は有効

結果として、「GC 管理の利点」と「ネイティブ実装の性能」を両立しやすい。

### 8.5 GC と C の境界

C 側が VM 管理外メモリに slot を保持するなら、GC にそれを教えなければならない。`xsRemember` と `xsForget` はそのためにある。

これは重要な実践知だ。

- JS オブジェクトを C グローバルや C 構造体に保持する
- 何も伝えない
- GC が不要だと判断して回収する
- C 側にダングリング参照が残る

組み込みではこの種のバグが見つけにくい。だからこそ API の約束事を守る必要がある。

### 8.6 いつ native に逃がすべきか

原則として、次のときは C 実装を検討する価値がある。

- 1 フレームごとに大量に走る処理
- プロパティアクセスのオーバーヘッドが支配的
- メモリ表現を詰めたい
- デバイス I/O そのもの
- 暗号、画像処理、音声処理などの重い処理

逆に言えば、アプリケーションロジック、状態遷移、ネットワーク制御、UI の組み合わせは JavaScript に残しやすい。これが `xs` の美点だ。

---

## 第9章 非同期、モジュール、隔離

### 9.1 Promise の実態

Web では Promise は event loop の一部として自然に見えるが、仕様上は Job のキューである。`xs` でもその本質は変わらない。

違うのは、Job の実行タイミングをホストが握ることだ。プラットフォームは `fxQueuePromiseJobs` を受けて、適切なタイミングで `fxRunPromiseJobs` を呼ぶ。

この分離を理解すると、「Promise があるなら Node.js 的なイベントループも当然ある」という誤解が消える。

### 9.2 setup modules

組み込みでは、アプリ本体の前に最低限の環境準備が必要になる。

- ネットワーク接続
- 時計合わせ
- 画面やタッチ初期化
- グローバルな device object 準備

これを `setup/` モジュールに切り出すのが Moddable の流儀だ。さらに、これらも preload すれば起動コストを下げられる。

重要なのは、setup module は「起動シーケンス設計」の一部だということだ。Web の `main()` と違い、ハードウェア準備とランタイム準備が絡む。

### 9.3 Compartment

`xs` は TC39 Compartment proposal 系の機能を実装している。Compartment は軽量な仮想ホストであり、

- 独自の `globalThis`
- 独自のグローバル lexical scope
- 独自の module map

を持つ。

ただし別プロセスでも別 VM でもない。同じ XS machine 上で built-ins をかなり共有する。そのため、安全に使うには「共有するものは凍結されていること」が前提になる。

ここでも freeze が、性能だけでなく隔離の前提条件になる。

### 9.4 Mods

Mods はユーザー後付けの拡張機構で、JavaScript module と asset をまとめたアーカイブとして配布できる。

これは組み込みにしてはかなり野心的な機能だ。だが `xs` の設計と相性が良い。

- バイトコードをそのまま配布できる
- flash 上で execute-in-place しやすい
- Compartment と組み合わせて権限を絞れる
- 必要な言語機能だけ残す host を作れる

一方で、mods を許すなら linker の自動 strip に任せきれない。将来入る mod がどの機能を使うか分からないからだ。ここでも、ランタイム設計とプロダクト設計が直結する。

### 9.5 Workers は「別スレッドの関数」ではなく「別の machine」

Web エンジニアは Worker を「グローバルが別の JS 実行環境」だと理解しているはずだが、`xs` ではその理解をさらに明確にするとよい。Worker は新しい XS machine と考えるのが近い。

- スタックもヒープも別
- creation 予算も別に考える必要がある
- setup modules は通常そのまま再実行されない
- xsbug でも machine ごとに別タブとして見える

この見方を持つと、Worker を導入したのにメモリが楽にならない理由も分かる。状態を隔離しただけで、VM をもう一つ持つコストは消えないからだ。

---

## 第10章 デバッグ、計測、トラブルシュート

### 10.1 xsbug は単なるデバッガではない

`xsbug` はソースレベルデバッグに加えて、計測とプロファイルを強く重視している。

- ブレークポイント
- コールスタック
- locals / globals / modules
- instrumentation
- profiler

組み込みでは、正しさだけでなく資源消費もデバッグ対象である。`xsbug` はそこを前提にしている。

### 10.2 何を見ればよいか

最低限、次を追う癖をつけたい。

- slots の増減
- chunks の増減
- keys の増減
- profile での hotspot
- 起動直後のピーク使用量

Web と違い、「平均的には大丈夫」では不十分だ。起動直後や GC 前後のピークで落ちることがある。

### 10.3 profiler の見方

XS profiler は sample based profiler で、JavaScript 関数だけでなく native function や GC の時間も把握できる。これは組み込みで強い。

なぜなら、遅さの原因が必ずしも JavaScript 自体とは限らないからだ。

- native function に入っている時間が長い
- GC が頻発している
- 文字列処理や property access が支配的

こうした観察から、「JS のまま直すか」「native に落とすか」「データ構造を変えるか」を判断できる。

### 10.4 よくあるエラー

#### memory full

単純に RAM 予算超過である。まずはピーク時の slots/chunks/keys を見る。次に、

- preload できるものを preload する
- freeze/const を増やす
- resource を flash 直参照に寄せる
- creation 予算を見直す
- 大きい一時オブジェクトを分割する

を検討する。

#### dead strip

strip された機能を使っている。`eval` や `RegExp` や `Map` などが候補になる。これは「たまたまそのコードパスに来た」ではなく、「ランタイム契約が噛み合っていない」ことを意味する。

#### native stack overflow / JavaScript stack overflow

C 側再入や深い再帰、あるいは大きな parser 処理が原因になりうる。`xs` はこの失敗をはっきり分けて報告するので、どちらのスタックが問題かを切り分ける。

### 10.5 linker warnings を軽視しない

`xsl` の warning は、単なる lint ではない。多くは「このオブジェクトは mutable なので alias が必要」「この closure は const にできる」という、RAM コストそのものの警告だ。

組み込みで warning を無視するのは、隠れた常駐コストを放置するのに近い。

---

## 第11章 組み込み JavaScript の実践原則

本章は、本書の技術的帰結を実践ルールへ落としたものだ。

### 11.1 原則1 プリロード可能なコードを書く

起動時にしか要らない副作用と、純粋な定義・初期化を分離する。クラス定義、定数テーブル、純粋な module 初期化は preload 向きである。

### 11.2 原則2 変更しないものは `const` にする

`let` のまま module closure を置くと alias が必要になる。変更しないなら `const` にする。これは style ではなく RAM 削減策だ。

### 11.3 原則3 共有オブジェクトは freeze する

prototype、設定オブジェクト、色テーブル、ルックアップ表は freeze する。必要なら深く freeze する。

### 11.4 原則4 prototype patching を常態化しない

Web のテストコードでは monkey patching が便利なこともあるが、`xs` では preload の利益と安全性を削る。設計として避ける。

### 11.5 原則5 `eval` と動的コード生成を疑う

`eval` と `Function` を許すと parser を残す必要が出る。ROM もセキュリティ面も不利になる。組み込みでは基本的に使わない前提で設計する。

### 11.6 原則6 key の増加を観測する

動的に大量の property 名を作るパターンは key budget を圧迫する。ログ形式や JSON キーの扱いでも意識したい。

### 11.7 原則7 Resource を使って flash 直参照に寄せる

画像、証明書、テキスト、バイナリは、可能なら RAM に丸ごと展開しない。`Resource` で flash 上のデータを扱う設計を優先する。

### 11.8 原則8 巨大な一時オブジェクトを避ける

一時的に大きな配列や文字列を作ると、chunk の断片化とピーク使用量が悪化する。ストリーム処理、分割処理、再利用バッファを考える。

### 11.9 原則9 高頻度ホットパスは測ってから native 化する

何でも C にすればよいわけではない。まず profiler で hotspot を確認し、その上で native に逃がす。そうしないと複雑さだけが増える。

### 11.10 原則10 manifest をコードの一部として扱う

`creation`, `preload`, `strip`, `defines` は実行性能と安定性に直結する。アプリコードと同じ真剣さでレビューする。

### 11.11 原則11 simulator だけを信用しない

simulator は便利だが、`static` 予算や実機 I/O 制約は弱い。最終判断は実機計測で行う。

### 11.12 原則12 起動時間を設計対象にする

「一度しか起動しないからよい」は組み込みでは通らない。電源断、deep sleep 復帰、接続切断復旧など、起動に近い場面は多い。

### 11.13 原則13 setup を薄く、main を明確に

setup module は環境準備だけに寄せる。業務ロジックまで詰め込むと、起動順序や非同期依存が不透明になる。

### 11.14 原則14 共有境界では freeze を前提にする

Compartment、mods、ホストから供給する API は、共有してよいものを明示し、可能な限り immutable にする。

### 11.15 原則15 予算超過を例外ではなく設計不備と見る

メモリ不足や `dead strip` は、運が悪かった事故ではない。多くは「何を ROM に寄せるべきか」「何を mutable にすべきか」「どの機能を許可すべきか」の設計ミスから来る。

---

## 第12章 小さな実践例

ここでは、Wi-Fi 接続して定期的にセンサ値を送信する小さなデバイスを想定する。狙いは豪華な完成品ではなく、「xs 的に筋の良い書き方」を確認することだ。

### 12.1 manifest

```json
{
  "include": [
    "$(MODDABLE)/examples/manifest_base.json",
    "$(MODDABLE)/examples/manifest_net.json"
  ],
  "modules": {
    "*": [
      "./main",
      "./telemetry",
      "./sensor"
    ]
  },
  "preload": [
    "setup/network",
    "telemetry",
    "sensor"
  ],
  "strip": [
    "*",
    "eval",
    "Function"
  ],
  "creation": {
    "static": 32768,
    "keys": {
      "initial": 32,
      "incremental": 0,
      "name": 53,
      "symbol": 3
    },
    "main": "main"
  }
}
```

ポイント:

- `telemetry` と `sensor` は preload 前提の純粋モジュールにする
- `eval`/`Function` は使わない前提で落とす
- keys の runtime 増加を止める

### 12.2 sensor.js

```javascript
const SensorConfig = Object.freeze({
  interval: 5_000,
  unit: "celsius"
}, true);

export default class SensorReader {
  #last = null;

  constructor(driver) {
    this.driver = driver;
  }

  read() {
    const value = this.driver.sample();
    this.#last = value;
    return value;
  }

  get last() {
    return this.#last;
  }

  static get config() {
    return SensorConfig;
  }
}

Object.freeze(SensorReader.prototype);
```

ポイント:

- 設定を freeze して ROM 向きにする
- prototype も freeze
- driver だけを runtime 注入する

### 12.3 telemetry.js

```javascript
const Endpoint = Object.freeze({
  path: "/telemetry"
}, true);

export function encodePayload(reading) {
  return JSON.stringify({
    t: reading.temperature,
    h: reading.humidity
  });
}

export function endpointPath() {
  return Endpoint.path;
}
```

ポイント:

- モジュールは純粋関数中心にし、preload しやすくする
- 大きな mutable singleton を置かない

### 12.4 main.js

```javascript
import Timer from "timer";
import SensorReader from "sensor";
import {encodePayload, endpointPath} from "telemetry";

export default function () {
  const reader = new SensorReader(globalThis.sensorDriver);

  Timer.repeat(() => {
    const value = reader.read();
    const body = encodePayload(value);
    globalThis.networkClient.post(endpointPath(), body);
  }, SensorReader.config.interval);
}
```

ポイント:

- 実機依存の `sensorDriver` や `networkClient` は host/setup 側から渡す
- アプリ本体は制御に集中する
- I/O 実体は JavaScript から分離する

### 12.5 なぜこの形が xs 向きなのか

- preload 可能な部分が多い
- mutable state が局所化されている
- runtime key の増加が読める
- 動的コード生成がない
- 実機依存の副作用は host 境界へ押し出している

この設計をさらに詰めるなら、

- payload を JSON ではなく固定長バイナリ化する
- 送信バッファ再利用を入れる
- センサ読み取りや encode の hotspot を profiler で確認する

といった方向になる。

---

## 第13章 なぜ xs なのか

### 13.1 比べるべき対象

`xs` を理解するとき、単に「V8 より軽い」と比較するのは粗すぎる。むしろ比較すべきは次の設計方針だ。

- 実行時に多くを決めるエンジンか
- ビルド時に多くを決めるエンジンか
- JIT を前提にするか
- AOT バイトコードと ROM 常駐を前提にするか
- 全機能常備か
- strip 前提か

`xs` は明らかに後者側へ振り切っている。

### 13.2 xs が選ばれる理由

#### 理由1 ROM を使って RAM を節約できる

プリロード、freeze、read-only VM、execute-in-place が連携して、RAM 使用量を大きく抑えられる。

#### 理由2 起動が速い

クラス構築やモジュール初期化の一部をビルド時へ送れるため、起動が非常に軽い。

#### 理由3 必要機能だけ残せる

strip によってエンジン自身の機能を削れる。製品ごとの最小構成を作りやすい。

#### 理由4 C 連携が素直

`XS in C`、`@` 構文、host object/handle により、ネイティブとの境界を現実的に設計できる。

#### 理由5 デバッグと計測が組み込み前提

xsbug や instrumentation が、単なるソースデバッグではなく資源観測の道具として整っている。

### 13.3 xs が向かない場面

逆に、次のような用途では `xs` の美点は薄れる。

- 実行時に大量の動的コード生成をしたい
- JIT による最大性能が最優先
- 何でも後から差し替える plugin 文化を重視する
- 豊富な OS API とファイルシステムが前提

つまり `xs` は「どこでも同じ JavaScript を雑に動かす」ための道具ではない。「厳しい制約の中で JavaScript を成立させる」ための道具である。

---

## 第14章 終章

本書で見てきたように、`xs` は JavaScript エンジン一般の原理を捨ててはいない。

- パースする
- スコープを束縛する
- バイトコードを実行する
- 値とオブジェクトをヒープに置く
- GC する
- Promise job を走らせる
- ホスト API と連携する

ここまでは一般論だ。

だが `xs` は、その一般論を組み込みの現実に合わせて大きく再配置する。

- ソースは実機で読まない
- モジュール初期化はビルド時へ送る
- mutable は高コストとみなす
- ROM を第一級の実行資源として使う
- ランタイム機能すら製品ごとに削る
- C 連携を例外扱いしない

この見方に切り替わると、組み込み JavaScript は窮屈な縮小版ではなく、ランタイム原理がそのままアプリ設計へ降りてくる、非常に筋の良い開発領域に見えてくるはずだ。

`xs` を使いこなす鍵は、JavaScript の書き方を少し変えることではない。ランタイムが何を RAM に置き、何を ROM に置き、何をビルド時に済ませ、何を実行時まで遅らせるべきかを、自分で判断できるようになることだ。

それができれば、Web エンジニアの経験は十分に武器になる。

---

## 第15章 付録

### 付録A まず覚えるコマンド

```sh
# xst のビルド
cd $MODDABLE/xs/makefiles/lin
make

# スクリプト実行
xst -s path/to/script.js

# モジュール実行
xst -m path/to/module.js

# Moddable アプリのビルドと実行
mcconfig -d -m

# ESP32 向けビルドと書き込み
mcconfig -d -m -p esp32/moddable_two
```

### 付録B まず追うべき資料

- `documentation/xs/XS Scopes.md`
- `documentation/xs/XS in C.md`
- `documentation/xs/preload.md`
- `documentation/xs/XS Differences.md`
- `documentation/xs/ROM Colors.md`
- `documentation/xs/XS Profiler.md`
- `documentation/xs/xsbug.md`
- `documentation/tools/manifest.md`
- `documentation/tools/tools.md`

### 付録C ソースの探検ガイド

ランタイムの入口から追うなら次がおすすめだ。

- `xs/sources/xsPlatforms.c`
  - 既定の `fxParseScript` が見える
- `xs/sources/xsRun.c`
  - バイトコードインタプリタ本体
- `xs/sources/xsMemory.c`
  - slot/chunk 管理と GC
- `xs/sources/xsModule.c`
  - モジュール処理
- `xs/sources/xsPromise.c`
  - Promise job queue
- `xs/sources/xsAPI.c`
  - machine の作成、clone、prepare

### 付録D xs を学ぶときのチェックリスト

- そのコードは preload できるか
- そのオブジェクトは freeze できるか
- その module scope 変数は `const` にできるか
- その機能は strip していないか
- 実行時に key を増やしすぎていないか
- その hotspot は JavaScript の問題か、native/I/O/GC の問題か
- 実機で slots/chunks/keys のピークを確認したか

### 付録E Web エンジニア向け要約

- `xs` は「小さい V8」ではない
- `xs` の中心思想は「ビルド時前倒し」と「ROM 活用」
- `Object.freeze` と `const` は style ではなくメモリ最適化
- manifest は config ではなくランタイム設計図
- C 連携は逃げではなく正常系
- 組み込み JavaScript の品質は、エンジン内部の理解量にかなり比例する
