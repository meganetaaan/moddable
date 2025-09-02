# MultiShape 設計検討と描画順の調査

## 目的
- outline 要素を拡張し、1つの Content で複数のパスを順序制御して描画する。
- 代替案として、複数 Content を一括かつ同期して描画する手段が既存機能で成立するか検証する。

## Piu/MC の描画パイプライン調査
- コマンドリスト: `PiuViewDrawContent` は描画処理を「コマンド」としてキューに積む。
  - 実装: `modules/piu/MC/piuView.c:362` で `DrawContentCommand` をエンキュー。
- 実行順序: `PiuViewUpdateStep` がコマンドリストを先頭から順に実行する。
  - 実装: `modules/piu/MC/piuView.c:1041` の `PIUCase(DrawContentCommand)` で登録した関数ポインタをその場で呼び、`Poco` に直接描画する。
- コンテナ内の順序: コンテナは子を順番に `update/draw` するため、子が発行するコマンドは「コンテナのスコープ内で」連続して並ぶ。
  - 例: `PiuDieUpdate` はクリップ・オリジンを設定後、`first` から `next` へ子を巡回し順に `update` を呼ぶ。
    - 参照: `modules/piu/MC/piuDie.c:72` 以降（`while (content) { (*content)->next; }`）。
- クリッピング: コンテナ/コンテンツは必要に応じて `PushClip/PopClip` を発行し、そのクリップ内で子が更新される（`piuView.c:1062` 付近）。

結論として、描画順は「ツリー走査順にキューへ積まれ、その順番でリプレイ」される。コンテナ配下の子は基本的に連続して描画される。

## 案1: MultiShape（複数 Outline を1 Content で描く）

### 目標
- `fill0 -> stroke0 -> fill1 -> stroke1 -> ...` の順に1つの Content の中で描画。
- サイズ計測はすべてのパスの外接矩形の合成（最大幅/最大高）で決定。
- スキンの `fill/stroke` 色・アルファは現状の `Shape` と同様に状態から決定し、全パスへ適用（将来拡張で per-path 色上書きを検討可）。

### 推奨 API（JS）
- 最小実装（ペア配列方式）
  - プロパティ: `fillOutlines: Outline[]`、`strokeOutlines: Outline[]`
  - 描画順: `for i in 0..max(len(fill), len(stroke))` で `fill[i]`→`stroke[i]` を順に描く（存在する場合のみ）。
  - 互換: 既存の `fillOutline` / `strokeOutline` は index 0 のショートカットとして動作。
- 代替（オブジェクト配列方式）
  - プロパティ: `items: Array<{ fill?: Outline, stroke?: Outline }>`
  - 描画順: `items` の要素順に `fill`→`stroke`。
  - GC/計測がシンプル（配列1本を C で参照/走査）だが、JS 側との相互運用のテストが必要。

### C 実装メモ（`piuMultiShape.c` の拡張）
- データ構造:
  - 簡便策: JS の Array を `xsSlot*` で1本保持し、描画・計測時に `xsGet` で要素を引く。
    - マーキング: その Array 参照のみ `PiuMarkReference` すれば OK（子要素は Array が到達可能にする）。
  - 高速化策: `xsSlot*` のフラット配列（`fill[]`, `stroke[]`）に展開・保持。`Mark` で全要素をマーク。更新コストは上がるが描画時のルックアップが軽い。
- 計測（`MeasureHorizontally/Vertically`）:
  - すべての `fill[i]`/`stroke[i]` について `PocoOutlineCalculateCBox` を呼び、`w/h` の最大値を最終 `coordinates.width/height` に採用。
  - 既存の単一 Outline 計測（`outline/piuShape.c:146` 以降）と同等のロジックを「多重化」。
- 描画（`DrawAux`）:
  - `fill[i]` があれば `PocoOutlineFill(view->poco, fillColor, fillBlend, outline, x, y)`。
  - 続けて `stroke[i]` があれば同様に描画。
  - 一度の `PiuViewDrawContent` で `DrawAux` が呼ばれ、その中で連続描画されるため、他コンテンツに割り込まれない。
- プロパティ setter:
  - 配列 Setter 時は `coordinates` に依存する場合 `PiuContentReflow(self, piuSizeChanged)`、そうでなければ `PiuContentInvalidate(self, NULL)`。

### 長所/短所
- 長所
  - 1 Content で完結するためオブジェクト数・更新コストが小さい。
  - fill/stripe の対を確実に直列化（ペア順）できる。
  - 1 回のコマンドで `DrawAux` に入り、連続描画される。
- 短所
  - API 設計（配列／オブジェクト）と GC/計測の整合が必要。
  - per-path の色や線幅を持たせる場合、Skin 以外の指定手段（上書き）が別途必要。

## 案2: SyncedContainer（複数 Content の同期描画）

### 既存機能での成立性
- コンテナ配下の子は「順に update され、発行する描画コマンドは連続」する。
  - 参照: `modules/piu/MC/piuDie.c:72` 以降の子巡回。
- よって、`Container` を 1 つ作り `Shape` を `[fill0, stroke0, fill1, ...]` の順で子として並べれば、描画リプレイ順も同じ並びになる。
- クリップや位置揃えもコンテナで制御でき、既存 API のみで構成可能。

### 制約/留意事項
- 「一度に描画」の意味が「1コマンド内で完了」まで含む場合は、案1のほうが厳密（`DrawAux` 内で完結）。案2は子ごとに `DrawContentCommand` が分割される。
- Skin/State は子ごとに評価されるため、全パスで同一色/アルファを担保したい場合は、同一 Skin を各子に共有で渡す運用が必要。
- 大量のパスで Content 数が増えるとオーバーヘッドが相対的に増える。

## 推奨方針
- 目的が「複数の Outline をひとまとまりとして順序制御して描く」ことなら、案1（MultiShape 拡張）が最適。
  - パフォーマンス（オブジェクト・ディスパッチの削減）、順序制御の単純さ、1回の描画入りでの完結性が利点。
- 既存機能のみで組みたい／実装規模を小さく始めたい場合は、案2（Container + 複数 Shape）で十分運用可能。

## API スケッチ（案1: items 採用）

- JS（`piuMultiShape.js`）
  - プロパティ
    - `items: Array<MultiShapeItem>`
    - 互換プロパティ（任意）: `fillOutline` / `strokeOutline` は index 0 ショートカットとして動作（`items[0].fill` / `items[0].stroke` を操作）
  - `MultiShapeItem` 仕様
    - `fill?: Outline` — 塗りつぶし用アウトライン
    - `stroke?: Outline` — ストローク用アウトライン
    - `skin?: Skin` — このアイテム専用のスキン。未指定時は `MultiShape.skin` を継承
    - `stateOffset?: number` — このアイテムに適用する状態オフセット（既定 0）。`(content.state + stateOffset)` を 0..3 にクランプして色決定
    - 将来拡張フィールド（予約）: `blendScale?: number`（0..1、アルファに乗算）等
  - 描画順
    - `for (const item of items) { if (item.fill) drawFill; if (item.stroke) drawStroke; }`
  - 例
    - `items: [{ fill: Outline.fill(p0) }, { stroke: Outline.stroke(p1, 3) }, { fill: Outline.fill(p2), skin: redSkin }]`

- C（`piuMultiShape.c`）
  - データ構造
    - `struct PiuMultiShapeStruct` に `xsSlot* items;` を追加し、JS の配列参照を保持
    - マーク: `PiuMarkReference(the, self->items);` のみ（配列到達で要素は GC により自動でトレースされる）
  - 計測（`MeasureHorizontally/Vertically`）
    - `items` を走査し、各 `item.fill`/`item.stroke` の `PocoOutlineCalculateCBox` の `w/h` 最大値を採用
  - 描画（`DrawAux`）
    - 各 `item` について、`item.skin || self->skin` を使用して `fill`/`stroke` の色・アルファを決定
      - `PiuColorsBlend(skin->data.color.fill, state, &color)` 等
      - `state = clamp(self->state + item.stateOffset, 0, 3)`
      - `blendScale` があれば `color.a = color.a * blendScale`
    - `fill`→`stroke` の順で `PocoOutlineFill(poco, color, blend, outline, x, y)` を呼ぶ
  - セッター/ゲッター
    - `PiuMultiShape_set_items(xsArg(0))` で参照を保持。幅/高さ自動算出中なら `PiuContentReflow(self, piuSizeChanged)`、それ以外は `PiuContentInvalidate(self, NULL)`
    - 互換: `PiuMultiShape_set_fillOutline` / `get_...` / `strokeOutline` は `items[0]` を裏で生成・更新

## 実装計画の要点
- 最初は「配列参照をそのまま保持」実装で着手し、正しさを優先。
- 性能が問題になったら、フラット配列化や per-path パラメータの導入を検討。
- 単体テスト観点
  - 描画順: デバッグログ/目視で `fill0->stroke0->fill1->...` を確認
  - 計測: `bounds` と `OutlineCalculateCBox` の最大値一致を検証
  - 互換: 既存 `Shape` を置換しても単パスケースで同等に動作

## 参考コード位置
- `modules/piu/MC/piuView.c:362` — `PiuViewDrawContent`（コマンドキュー積み）
- `modules/piu/MC/piuView.c:1041` — `DrawContentCommand` の実行
- `modules/piu/MC/piuDie.c:72` — コンテナ配下の子を順に `update`
- `modules/piu/MC/outline/piuShape.c:140` 前後 — 単一 Outline の計測/描画ロジック
