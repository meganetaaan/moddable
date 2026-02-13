# ModdableとPiuでアプリケーションを実装するためのベストプラクティス集

本ガイドは、`contributed/conversationalAI` の実装を参考に、ModdableとPiuでアプリケーションを作るときの設計・実装の要点をまとめたものです。マイコン環境での制約を前提に、UI設計、状態管理、ページ遷移、コンポーネント設計、実装テクニックまでを整理します。

## 0. 目的と対象

- **対象**: Moddable SDK + Piuでアプリケーションを開発するエンジニア
- **目的**: 小さなメモリ/CPUで「破綻しないUIアプリ」を作るための設計指針を共有する
- **参照元**: `contributed/conversationalAI`（以下「conversationalAI」）

## 1. 背景：マイコンならではの制約事項

マイコン向けUIアプリは、デスクトップ/モバイルの常識が通用しません。以下の制約を前提に設計します。

1. **メモリが小さい**
   - ヒープが数KB〜数百KBと小さく、オブジェクトの増殖がすぐに落ちる。
   - `manifest.json` の `creation.heap` / `commandListLength` / `displayListLength` が動作に直結する。

2. **CPUと描画の余裕が少ない**
   - アニメーションや透明合成は負荷が大きい。
   - 1フレームの処理量と描画差分を最小化する必要がある。

3. **ストレージとI/Oが限られる**
   - 画像/フォント/音声はサイズに直結するため、素材設計が重要。
   - 通信は不安定で遅い前提で設計する。

4. **デバッグと更新が難しい**
   - デバイス依存の問題が多く、安定した構造が必要。
   - 参照の残りやメモリリークが致命傷になる。

**結論**: 「UIを作る」よりも「壊れないUI構造を作る」ことが重要です。

## 2. ModdableとPiuを採用する理由

conversationalAIが示す、Moddable + Piuの強みは次の点に集約されます。

1. **少ないコードでUIが組める**
   - `Container.template` / `Row.template` によりUIを宣言的に組み立て可能。
   - テンプレート単位で再利用でき、差分だけをコード化しやすい。

2. **状態管理とUIが分離しやすい**
   - `Behavior` を介してUIイベントとロジックを分離できる。
   - `Controller` を中心に状態とページ遷移を統合できる。

3. **UIリソース管理が明確**
   - `manifest.json` でフォント/テクスチャ/メモリ設定を一元管理。
   - `assets.js` で `skins` / `styles` / `textures` をまとめられる。

4. **動的ロードと遷移の柔軟性**
   - `importNow` によるビューのオンデマンド読み込み。
   - `Timeline` / `Transition` を使った軽量なページ遷移。

## 3. conversationalAIに学ぶアプリケーション設計

### 3.0 役割の関係図（責務分離）

Piuの設計は、UIと状態を「見える形」で分けるほど強くなります。

```
Application
  -> Controller (状態/遷移/履歴/永続化)
     -> View (画面単位の振る舞い)
        -> Template (UI構造)
           -> Behavior (部品単位の入力/描画)
```

イベントの流れは以下のように単純化できます。

```
ユーザー入力 -> 部品Behavior -> bubble/distribute
  -> View Behavior -> Controller -> 画面遷移/状態更新
```

### 3.1 Behaviorの分離

- **ViewのBehaviorは「画面単位のロジック」**
  - 例: `views/Home.js` の `HomeBehavior` が接続/切断/状態遷移を管理。
- **UI部品のBehaviorは「局所的な入力処理」**
  - 例: `views/Common.js` の `CommonButtonBehavior` / `CommonRowBehavior`。

**抜粋例（画面Behavior）**

```js
class HomeBehavior extends View.Behavior {
  onDisplayed(container) {
    if (this.view.service.key)
      this.chat.connect();
    else
      this.chat.failed({ string: "no API key" });
  }
}
```

**抜粋例（部品Behavior）**

```js
class CommonButtonBehavior extends Behavior {
  onTouchEnded(container) {
    if (container.state == 1)
      this.onTap(container);
  }
}
```

**ベストプラクティス**
- 画面の状態遷移や外部通信は「View Behavior」に集約する。
- ボタンや行などの小さな挙動は「部品Behavior」に閉じ込める。
- `bubble` / `distribute` を使ってイベントの責務を上位に渡す。

### 3.2 Controllerによる状態管理

`Controller.js` はアプリ全体の「状態と画面遷移」を管理する中枢です。

- **画面履歴**: `history` による戻る操作
- **遷移方向**: `going` で forward/backward を統一的に判定
- **画面生成**: `goTo` / `goWith` でビュー生成と `display` を委譲
- **永続設定**: `Preference` によるユーザー設定の保存

**抜粋例（遷移の起点）**

```js
goTo(id) {
  const View = importNow(id);
  if (View) {
    const view = new View();
    view.id = id;
    this.going = 1;
    this.container.defer("display", view, false);
  }
}
```

**ベストプラクティス**
- `Controller` は「UIを触らない、画面の生成と状態だけを持つ」。
- 画面は `Template` 経由で生成し、差し替え時に `purge()` を呼ぶ。
- 戻る/ホームなどの共通ナビはControllerに寄せる。

### 3.3 ページ遷移

conversationalAIでは `View` 基底クラスが遷移を統一しています。

- `runTransitionForwards` / `runTransitionBackwards` が遷移ロジックを統合
- `TimelineTransition` により、軽量かつ方向性のある遷移を実現
- `historical` を `false` にすると履歴に残さない（例: `Splash`）

**流れのイメージ**

```
Controller.goTo -> display
  -> View.Template を生成
  -> Transition/Timeline を実行
  -> onTransitionEnded
  -> application.purge + onScreenDisplayed
```

**補足（表示/非表示フック）**
- `display` は旧画面に `onScreenUndisplaying`、新画面に `onScreenDisplayed` を配信する。
- 画面の `onDisplayed` / `onUndisplaying` は共通処理として活用できる。

**ベストプラクティス**
- 遷移の共通処理は `View` に集約し、各画面は `Timeline` だけ差し替える。
- アニメーションは短く、遷移時間を固定（250ms程度）にする。
- 遷移後に `application.purge()` を呼び、リークを防ぐ。

### 3.4 コンポーネント分割の粒度

- **Common.js** に「UI共通部品」を集約
- 画面固有の行やボタンは `views/*.js` に局所化
- 大きなUIは `Container.template` で分割

**抜粋例（Rowテンプレート）**

```js
const PersonaRow = Row.template($ => ({
  left:0, width:240, height:84,
  skin: assets.skins.personaRow,
  active: true, Behavior: PersonaRowBehavior,
  contents: [ /* ... */ ]
}));
```

**ベストプラクティス**
- 共通部品は `Common.js` に集める（ボタン、スクロールバー、背景など）。
- 画面内で再利用する要素は `Row.template` や `Container.template` 化する。
- 1ファイルに複数テンプレートがあってもOK。責務が近いものをまとめる。

### 3.5 コンポーネントやメソッドの命名

conversationalAIでは命名が一貫しています。

- `XBehavior` / `XTimeline` / `XContainer` / `XRow`
- `onSelectX` / `onConfigure` など「動作＋対象」の動詞形
- `LISTENING` / `SPEAKING` などUIの状態を大文字で管理

**ベストプラクティス**
- Behavior名はUI責務を表現する（`PersonaRowBehavior` など）。
- ページ遷移やイベントは `onSelectX` のように行為で命名する。
- UI参照は「状態名 + UI種別」で統一し、後から追いやすくする。

### 3.6 templateをいつ使うべきか

- **使うべき時**
  - 同じレイアウトを複数箇所で使う（例: `PersonaRow`）
  - コンテンツのデータ差し替えが必要（例: `Template(data)`）
  - ページのルートUIを返す（`View.Template`）

- **使わない選択肢**
  - 1回しか使わず、複雑なBehaviorも不要な場合は直書きでOK

**抜粋例（画面Template）**

```js
export default class extends View {
  get Template() { return PersonasContainer; }
  get Timeline() { return PersonasTimeline; }
}
```

**ベストプラクティス**
- 画面のルートは必ず `Template` で返す。
- 行やカードのような反復UIは `Row.template` に切り出す。
- 再利用しないUIは無理にテンプレート化しない。

### 3.7 参照の解放とpurgeの扱い

Piuでは「表示から外しただけ」では参照が残ることがあります。conversationalAIでは、
遷移後に `purge()` / `application.purge()` を呼び、アンカーや参照を切る設計になっています。

**抜粋例（View.purgeの方針）**

```js
purge() {
  this.deleteAnchors(this);
}
```

**ベストプラクティス**
- 画面遷移後に `purge()` を呼び、参照を明示的に解放する。
- `application.purge()` を遷移完了時に実行して、不要リソースを回収する。

## 4. 実装テクニック

### 4.1 フォント、スタイル、テクスチャ

- `assets.js` に `skins` / `styles` / `textures` を集約
- `manifest.json` の `resources` でフォントのサイズ/ブロックを定義
- 画像/フォントを小さく保つことでメモリを節約

**抜粋例（manifestのフォント定義）**

```json
{
  "source": "./fonts/Roboto-Regular",
  "size": 18,
  "blocks": ["Basic Latin"]
}
```

**抜粋例（assetsの整理）**

```js
const assets = {
  skins: { screen: { fill: "#011430" } },
  styles: { screen: { font: "18px Roboto" } },
  textures: { bubble: { path: "bubble.png" } }
};
```

**ベストプラクティス**
- 文字セットは必要なブロックだけに限定する。
- フォントサイズは少数に固定し、スタイルで再利用する。
- 画像はサイズと色を最小化し、マスクを活用する。

### 4.2 通信

conversationalAIでは `ChatAudioIO` に通信処理を集約しています。

- 状態遷移をイベントで通知（`onStateChanged` など）
- UIは通信状態に応じて表示を切り替える
- 接続/切断は `connect` / `disconnect` で明確に管理

**抜粋例（状態イベントでUIを切り替える）**

```js
this.chat = new ChatAudioIO({
  onStateChanged: state => this.onStateChanged(container, state)
});
```

**ベストプラクティス**
- 通信は「状態機械」として設計し、UI側は状態を表示するだけにする。
- エラー時の表示を事前に用意し、通信停止時の復帰導線を確保する。
- 非同期コールバックは最小限にし、UIの再描画は一箇所で統合する。

### 4.3 設定の切り出し

- **アプリ設定**: `manifest.json` の `config` でAPIキー等を定義
- **ユーザー設定**: `Preference` による永続化
- **初期データ**: `model.json` に分離して編集しやすくする

**抜粋例（manifestのconfig）**

```json
"config": {
  "openAIKey": "",
  "geminiAPIKey": "",
  "elevenLabsKey": ""
}
```

**抜粋例（Preferenceの保存）**

```js
Preference.set("model", "options", JSON.stringify(this.options));
```

**ベストプラクティス**
- APIキーは `config` 経由で注入し、コードには埋め込まない。
- 変更頻度の高いデータはJSONに分離する。
- 永続化対象は最小限に絞り、読み込み時に必ず整合性チェックを行う。

## 5. まとめ（設計チェックリスト）

- 画面ロジックと部品ロジックを `Behavior` で分離しているか
- 状態管理と画面遷移が `Controller` に集約されているか
- `Template` を適切に使い、UIの再利用性を高めているか
- 遷移後に `purge()` / `application.purge()` でメモリを解放しているか
- フォント/テクスチャのサイズを最小化しているか
- 通信処理は状態機械として整理されているか
- 設定・データ・コードが分離されているか

## 6. FAQ / トラブルシュート

**Q1. 画面が更新されない/一部しか変わらない**
- 画面が遷移中で `controller.going` が立っていないか確認する。
- 画面を作り直す場合は `Controller.redisplay()` のように `Template` を差し替える。
- 差分更新なら `controller.updateScreen()` で `onUpdate` を配信する。

**Q2. 画面遷移後にメモリが減らない**
- 遷移完了時に `application.purge()` が呼ばれているか確認する。
- `View.purge()` でアンカーを削除し、参照を残さない。

**Q3. Templateを使ったのに反映されない**
- 既存のContainerを `replace` しない限りレイアウトは更新されない。
- データ更新だけなら `controller.updateScreen()` か `distribute("onUpdate")` で再描画を促す。

**Q4. スクロールが重い**
- Rowの入れ子を減らし、`skin` / `style` のバリエーションを削る。
- 画像サイズやフォントサイズを見直し、描画コストを下げる。

**Q5. APIキーが読み込まれていない**
- `manifest.json` の `config` にキーを入れ、ビルド時に反映されているか確認する。

---

このガイドは `contributed/conversationalAI` の設計思想を基にしています。具体的な実装は各ファイル（`Controller.js`, `View.js`, `views/*.js`, `assets.js`, `manifest.json` など）も参照してください。
