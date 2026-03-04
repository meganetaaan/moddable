# piu-next Native Boundary Design

最終更新: 2026-02-28

## 1. 目的
`piu-next` の目的は、モダンな TS/TSX API を維持しつつ、ホットパスの JS 呼び出しを削減して `piu` 同等以上の CPU / RAM / stack 安定性を得ること。

この文書では、`piu` の実装を参照して以下を定義する。

- Cネイティブ化すべき箇所
- JSで保持すべき箇所
- 実装境界（責務分担）
- TODOへの具体反映

## 2. 現状の問題整理（piu-next）
現行 `piu-next` は RuntimeDriver の「型/bridge」まではあるが、ノード制御本体は JS 実装である。

- ツリー構築・差分適用が JS (`createRenderedNode`, `patchChildren`, `applyProps`)
  - 参照: `contributed/piu-next/src/piu-runtime.ts`
- タッチハンドリングが JS Behavior 経由 (`createTouchBehavior`)
  - 参照: `contributed/piu-next/src/piu-runtime.ts`
- tween の既定経路が JS タイマーループ (`tweenSignal`)
  - 参照: `contributed/piu-next/src/animation.ts`

このため、タップ連打時に JS 側の呼び出し・割り当て・キュー制御が増え、stack/heap 圧迫を起こしやすい。

## 3. 参照モデル（piu）
`piu` は JS API 表面の下を C で実装している。

- Container の add/remove/insert/empty は C
  - 参照: `modules/piu/All/piuContainer.c`
- タッチ hit-test / 伝播 / sample 管理は C
  - 参照: `modules/piu/All/piuApplication.c`
- コンテンツの座標・サイズ・state/style 変更と reflow/invalidate は C
  - 参照: `modules/piu/All/piuContent.c`
- Tween の property 補間コアは C
  - 参照: `modules/piu/All/piuTimeline.c`

`piu-next` も同様に「UIエンジン本体は C、アプリロジックは JS」に寄せる。

## 4. 境界方針
### 4.1 Cネイティブ化すべき箇所（必須）
1. ノードの生成・破棄・親子リンク操作
2. 差分適用（create/remove/reorder/prop update）
3. レイアウト再計算、invalidate、描画スケジューリング
4. hit-test、touch capture、touch sample 管理、伝播順序制御
5. アニメーションの時間進行と補間（フレーム駆動）
6. 低レベルリソース bind/unbind（Skin/Style/Texture/Font）

### 4.2 JSで保持すべき箇所（許容）
1. TSX -> IR 生成（トランスパイル）
2. signal/computed/effect の状態モデル
3. アプリロジック（イベントハンドラ本体）
4. 開発時診断メッセージ
5. bridge の型定義と薄い API ラッパー

### 4.3 JSに残してはいけない箇所（禁止）
1. 毎フレーム走るループ
2. 毎イベントで多数の JS オブジェクトを生成する処理
3. 木全体の再構築を伴う更新
4. タッチ入力の深い再入呼び出し

## 5. 提案アーキテクチャ
## 5.1 Runtime 層
- `NativeRuntimeDriver` の C 実装を追加する。
- JS は `ElementNode` から直接 Piu インスタンスを生成しない。
- JS は「パッチ命令列」を C へ渡し、C が適用する。

### Patch 命令（最小セット）
1. `CREATE_NODE(nodeId, type, props)`
2. `SET_PROP(nodeId, propId, value)`
3. `CLEAR_PROP(nodeId, propId)`
4. `INSERT_CHILD(parentId, nodeId, beforeId?)`
5. `REMOVE_NODE(nodeId)`
6. `ATTACH_REF(nodeId, refId)` / `DETACH_REF(refId)`
7. `SET_EVENT_MASK(nodeId, mask)`

命令列は配列オブジェクトではなく、固定レイアウトの連続バッファ（または等価の低割り当て構造）を優先する。

## 5.2 Touch 層
- C 側で hit-test と touch sample を保持する。
- JS へは正規化済みイベントを「1イベント1コールバック」で通知する。
- 再入防止のため、C 側キュー -> JS ディスパッチ 1段のみ許可する。

## 5.3 Animation 層
- `TweenDriver` の C 実装を標準経路にする。
- JS は開始要求と完了通知のみ。
- 進行中フレームで JS 呼び出しは行わない。

## 5.4 メモリ方針
1. ノード管理は C 側 arena/pool を利用する。
2. touch sample は ring buffer 化する。
3. 命令適用中に不要な一時 JS オブジェクトを作らない。
4. JS の recursive 呼び出しを避ける（イベント処理で Promise 連鎖を作らない）。

## 6. API 方針（モダンI/F維持）
外部 API は維持する。

- TSX 記法
- signal 中心状態管理
- `mountPiuApplication` と driver 取付け API

ただし実装上は、`mountPiuApplication` の既定経路を最終的に native driver 優先へ切り替える。

## 7. テスト戦略（TDD）
1. 先に失敗テストを追加してから C 実装を進める。
2. E2E はタップ連打・長押し・同時タッチ・アニメーション完了順序を固定検証する。
3. piu 比較の計測項目を固定化する。
4. stack 使用量の回帰閾値を CI で監視する。

## 8. 受け入れ基準
1. 2回連続タップを含む連続入力で stack overflow が再発しない。
2. Runtime path で JS 側ノード再構築コードを経由しない。
3. アニメーション進行中にフレーム毎 JS 実行がない。
4. CPU/RAM/起動/FPS/サイズの計測レポートが自動生成される。

