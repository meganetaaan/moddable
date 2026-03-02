# piu-next TODO

最終更新: 2026-02-28
設計参照: `contributed/piu-next/NATIVE_BOUNDARY_DESIGN.md`

## P0: ブリッジ基盤の成立（完了）
- [x] `RuntimeDriver` / `TweenDriver` の bridge API と型を追加する
- [x] JSフォールバックと bridge 経路の切替を統一する
- [x] bridge API の最小テスト（unit / mcsim smoke）を追加する
- [x] `counter-app` で bridge 未注入時のフォールバック動作を確認する
- [x] `npm run test:ci`（当時）を通す
- 完了条件: bridge API を公開し、未注入環境で既存アプリが後退なく動作する

## P1: Must機能ギャップ解消
- [x] `onTap` 以外を含む型付きイベントモデルを設計・実装する
- [x] TSXサンプルを正式化する（`node(...)` 直書き依存を下げる）
- [x] リソース管理APIの最小版を実装する
- [x] 設定ミス時の診断メッセージを強化する
- [x] 追加分のunit/e2eテストを整備する
- [ ] FR-006（手書き `d.ts` 廃止）の未達を解消する（`src/jsx.d.ts` 依存の整理）
- [ ] FR-011（Cタイムライン駆動で毎フレームJS不要）を満たす
- 完了条件: FR-010, FR-012〜FR-015 をコード+テストでカバーし、FR-011 は P2 で達成する

## P2: Cネイティブノード制御の実装（最優先）
### P2-A: RuntimeDriver C実体（mount/update/dispose）
- [x] 失敗テストを先行追加する（native runtime bridge 未注入時/注入時の経路差を検証）
- [x] `contributed/piu-next/native`（または同等）に runtime driver C 実装を追加する
- [x] `__piuNextRuntimeBridge` を注入する初期化モジュールを追加する
- [x] mount/update/dispose の最小経路を mcsim で通す
- 完了条件: JS `mountPiuApplication` が native runtime driver session を確実に取得する

### P2-B: C側パッチ適用エンジン
- [x] 失敗テストを先行追加する（create/remove/reorder/property update）
- [x] 非key・同形状更新の in-place 更新を実装し、identity更新テストを通す
- [ ] ノードIDと key 対応の管理テーブルを C 側に実装する
- [ ] `CREATE_NODE` / `SET_PROP` / `CLEAR_PROP` / `INSERT_CHILD` / `REMOVE_NODE` を実装する
- [ ] JS 側 full rebuild 経路（`application.empty/add`）に依存しない更新へ切替する
- [ ] `counter-app` の更新でノード再構築が起きないことをログで検証する
- 完了条件: タップ更新時に必要最小限の差分命令のみ適用される

### P2-C: Touch経路のC主導化
- [ ] 失敗テストを先行追加する（連打、長押し、touch move）
- [ ] C側で hit-test / touch sample / dispatch queue を保持する
- [ ] JS通知を 1イベント1コールバックに正規化する
- [ ] 再入防止を実装する（イベント処理中の深い再帰を禁止）
- [ ] tap 2連打/連続タップの stack overflow 再発防止を E2E で固定化する
- 完了条件: `counter-tap-twice` 相当シナリオで stack overflow が再発しない

### P2-D: TweenDriver Cタイムライン化（FR-011）
- [ ] 失敗テストを先行追加する（進行値、完了通知、stop）
- [ ] Cタイムライン実装を追加し、毎フレーム JS 実行を撤廃する
- [ ] `__piuNextTweenBridge` 注入経路を実装する
- [ ] JS fallback driver は非対応環境用の退避経路に限定する
- 完了条件: 標準構成でアニメーション進行中のフレーム毎 JS 実行が発生しない

### P2-E: メモリ/スタック回帰ガード
- [ ] piu baseline と piu-next の touch path stack 使用量比較を自動化する
- [ ] piu baseline と piu-next の touch path heap 使用量比較を自動化する
- [ ] 回帰閾値を定義し CI 失敗条件に組み込む
- 完了条件: touch path の stack/heap が閾値内で安定する

### P2-F: 統合検証
- [ ] `counter-app` を bridge 有効モードで mcsim 実行し JS fallback 未使用を確認する
- [ ] native runtime + native tween の同時有効化 E2E を追加する
- [ ] 代表3画面（静的/動的/アニメーション）でネイティブ経路を検証する
- 完了条件: `piu-next` が bridge API だけでなく C 実体を伴う実行経路で動作する

## P3: 性能・品質ゲート達成
- [ ] CPU計測を自動化する（warmup/計測区間を固定）
- [ ] RAMピーク計測を自動化する（touch/animation時ピークを記録）
- [ ] FPS計測を自動化する（drop frame率を出力）
- [ ] 起動時間計測を自動化する（初回描画完了まで）
- [ ] バイナリサイズ計測を自動化する（構成別）
- [ ] 代表3画面以上のベンチマークシナリオを追加する
- [ ] piu比の閾値を要件準拠（+5%目標）へ引き上げる
- [ ] 描画ゴールデン差分テストを整備し、再現性要件を計測に含める
- [ ] CIで型検査/単体/e2e/性能計測をゲート化する
- [ ] 総合性能レポートを出力する（NFR別の合否を明示）
- 完了条件: NFR-001〜NFR-008 を計測レポートで満たす

## P4: 移行資産とリリース準備
- [ ] 移行ガイド初版を作成する
- [ ] `template` / `anchor` 対応表を作成する
- [ ] codemod初版を作成する
- [ ] experimental向け破壊的変更ポリシーを明文化する
- [ ] MVP判定チェックを文書化する
- 完了条件: 要求仕様 11章のMVP条件を満たす文書一式が揃う

## 継続運用タスク
- [ ] `tests/e2e` の未追跡デバッグスクリプトを整理する（採用/削除/隔離）
