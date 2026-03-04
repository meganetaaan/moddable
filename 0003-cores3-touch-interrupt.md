- Feature Name: `cores3_touch_interrupt_via_aw9523`
- Start Date: 2026-02-27
- RFC PR: (TBD)
- Related Issue: (TBD)
- Target: Moddable SDK (`m5stack_cores3`)

## Summary
[summary]: #summary

CoreS3 のタッチ入力は、ハードウェア的には割り込み利用が可能だが、現行 Moddable 実装では `interrupt` 未接続のためポーリング前提で動作している。  
本 RFC は、`m5stack_cores3` ターゲットで FT6206 系タッチドライバを割り込み駆動できるようにするための、Codex 向け改修指示を定義する。

要点:
- `provider.js` から touch ドライバへ `interrupt` を渡せる状態にする。
- CoreS3 固有回路（FT6336U INT -> AW9523 -> GPIO21）を前提に、AW9523 経由の要因判別を実装する。
- 共有 INT 線のため、touch 以外の要因を無視できる構成にする。
- 割り込み経路が使えない場合は既存ポーリングをフォールバックとして維持する。

## Motivation
[motivation]: #motivation

`stackchan/touch.ts` は `touch.configuration?.interrupt` が無い場合に `Timer.repeat` ポーリングへフォールバックする設計で、CoreS3 では現状この経路に入る。  
タッチ割り込みを有効化できれば、不要な周期処理を減らし、UI/音声処理と競合しやすいメインスレッド負荷を下げやすくなる。

現状の根拠:
- `reference/moddable/build/devices/esp32/targets/m5stack_cores3/host/provider.js`
  - `new Touch({... sensor ...})` へ `interrupt` を渡していない。
- `reference/moddable/modules/drivers/sensors/ft6206/ft6206.js`
  - `interrupt` が渡されると `interrupt.io` を生成し、`onReadable` で `onSample` を呼ぶ実装がある。

## Guide-level explanation
[guide-level-explanation]: #guide-level-explanation

### 目標動作
1. CoreS3 で touch を初期化すると、可能な場合は割り込み駆動になる。
2. 物理的には GPIO21 の `I2C_INT` を監視し、エッジ発生時に AW9523 を読んで要因を判別する。
3. AW9523 の要因が touch (`P1_2`) のときのみ FT6206 の `onSample` を発火する。
4. 割り込み構築に失敗した場合は安全にポーリングへフォールバックする。

### 回路前提（CoreS3）

```mermaid
flowchart LR
  FT[FT6336U TOUCH_INT] --> AWP12[AW9523 P1_2]
  AWP12 --> AWINT[AW9523 INTN]
  AWINT --> I2CINT[I2C_INT net]
  I2CINT --> ESP21[ESP32-S3 GPIO21]
```

## Reference-level explanation
[reference-level-explanation]: #reference-level-explanation

### 1. 改修対象（必須）
- `reference/moddable/build/devices/esp32/targets/m5stack_cores3/host/provider.js`
- `reference/moddable/build/devices/esp32/targets/m5stack_cores3/setup-target.js`

必要に応じて追加:
- `reference/moddable/build/devices/esp32/targets/m5stack_cores3/host/*` に補助モジュール（INT 多重化・判別ロジック）

### 2. 実装方針
1. **provider から interrupt を渡す**
   - `sensor.Touch` 生成時に `interrupt` を渡せるようにする。
   - ただし単純な GPIO 直結ではなく、AW9523 要因判別を挟んだ `interrupt.io` を使う。

2. **AW9523 の読み出し API を整備**
   - `setup-target.js` の `AW9523` クラスに、少なくとも `readByte(address)` を追加する。
   - INT 判別に必要なレジスタ読み出しを可能にする。

3. **共有 INT 線の要因判別**
   - GPIO21 エッジ検出時に AW9523 側で割り込み要因を確認する。
   - touch 起因（P1_2）でなければ FT6206 `onSample` を呼ばない。
   - 共有線のため、誤発火を避ける。

4. **フォールバック維持**
   - interrupt 初期化失敗、判別不能、設定未対応時は `interrupt` なしで Touch を生成し、既存ポーリング互換を保つ。

### 3. Codex 実装タスク（チェックリスト）
- [ ] `provider.js` で CoreS3 touch 初期化時に interrupt 経路を構築する。
- [ ] AW9523 判別ロジックを実装し、touch 要因のみ `onReadable` 相当を通知する。
- [ ] `setup-target.js` の AW9523 ユーティリティを拡張し、必要レジスタを read できるようにする。
- [ ] 例外時フォールバック（interrupt 無効化）を実装する。
- [ ] 既存タッチ機能（sample/configure）が回帰しないことを確認する。

### 4. 受け入れ条件（Acceptance Criteria）
- CoreS3 で touch 初期化後、`touch.configuration.interrupt === true` になる経路が存在する。
- 共有 INT 線の touch 以外要因で誤って `onSample` が過剰発火しない。
- interrupt 経路が使えない環境でも従来どおりポーリングで動作する。
- 既存 API 互換（`sample()`, `configure()`, `close()`）を壊さない。

### 5. テスト観点（最低限）
1. **機能テスト**
   - 連続タップ時にイベント欠落がない。
   - 非タップ時に無駄な callback 連打がない。

2. **回帰テスト**
   - CoreS3 以外ターゲットへの影響がない。
   - 割り込み無効時に従来どおりポーリングで動作する。

3. **安定性**
   - `close()` 後に interrupt リソースリークがない。
   - I2C 読み出し失敗時にハードクラッシュせずフォールバックする。

## Drawbacks
[drawbacks]: #drawbacks

- CoreS3 固有実装（AW9523 経路）を持つため、ターゲット依存コードが増える。
- 共有 INT 線の要因判別を誤ると、入力欠落または誤発火のリスクがある。
- 実装によっては I2C 読み出しコストが割り込み処理に追加される。

## Rationale and alternatives
[rationale-and-alternatives]: #rationale-and-alternatives

- 代替案1: `interrupt` を渡さずポーリング継続
  - 実装は簡単だが、周期負荷と応答性の改善が見込めない。
- 代替案2: GPIO21 を直接 touch interrupt とみなして `onSample`
  - 共有 INT 線のため誤発火リスクが高い。
- 採用案: AW9523 判別を挟んだ interrupt 駆動 + フォールバック
  - 安全性と改善効果のバランスが最もよい。

## Prior art
[prior-art]: #prior-art

- `ft6206.js` は `interrupt` 引数を受けると `interrupt.io` を用いた割り込み駆動が可能。
- CoreS3 の現行 provider は `interrupt` を未接続。

## Unresolved questions
[unresolved-questions]: #unresolved-questions

- AW9523 側で touch 要因を判別する最小レジスタセットの最終確定。
- 共有 INT 線上の他デバイス要因をどこまで吸収するか（汎用化範囲）。
- `ft6206_async.js` へ切り替えるべきか（別 RFC で扱うか）。

## Future possibilities
[future-possibilities]: #future-possibilities

- CoreS3 の I2C_INT 利用デバイスを統合管理する Interrupt Mux の共通化。
- touch ドライバの async 化と組み合わせた、さらに低負荷な入力処理。
