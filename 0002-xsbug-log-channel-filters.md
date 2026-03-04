- Feature Name: `xsbug_log_channel_filters`
- Start Date: 2026-02-27
- RFC PR: (TBD)
- Related Issue: P0-2 (`xsbug-log` の組み込みフィルタ)
- Target: Tooling (`xsbug-log`, `mcconfig`)

## Summary

[summary]: #summary

`xsbug-log` にチャネル分類とフィルタ機能を追加し、ビルド出力・ランタイムログ・テストログを選択的に表示できるようにすることで、デバッグ時のノイズを大幅に減らす。

## Motivation

[motivation]: #motivation

現行運用では、`mcconfig -dl` 実行時に大量ログが混在しやすく、開発者は毎回 `rg` / `grep` 後処理で必要行を抽出している。  
この方式の問題は次の通り。

1. 毎回フィルタ条件が再実装され、チームで統一されない。
2. 失敗の初動分析に時間がかかる。
3. CIログで重要イベントが埋もれる。
4. AI解析前に前処理が必要で、自動修正ループが遅くなる。

ユースケース:

1. **ランタイム障害の切り分け**
   ビルドログを除外し、`DEBUG`/`ERROR` のみ表示したい。
2. **テスト運用**
   `PASS/FAIL` と例外のみ見たい。
3. **CI用途**
   JSON Linesで出力して後続ジョブに渡したい。

## Guide-level explanation

[guide-level-explanation]: #guide-level-explanation

提案後は、`xsbug-log` を次のように利用する。

1. `--channel` で必要チャネルだけ表示する。
2. `--exclude` で不要チャネルを除外する。
3. `--format jsonl` で構造化出力する。

例:

```bash
mcconfig -dl -m -p esp32/moddable_two -t xsbug -- \
  --channel runtime,test --exclude build --format text
```

```bash
xsbug-log --channel runtime,error --format jsonl serial2xsbug /dev/ttyUSB0 921600 8N1
```

期待される効果:

1. デバッグ時の視認性向上。
2. 失敗行までの到達時間短縮。
3. チーム全体で再利用可能な共通ログ運用。

## Reference-level explanation

[reference-level-explanation]: #reference-level-explanation

### チャネルモデル

標準チャネル案:

1. `build`（ビルド/デプロイ由来）
2. `runtime`（`<log>` 等の実行ログ）
3. `test`（テストランナー通知）
4. `error`（例外、break、失敗シグナル）
5. `system`（接続、切断、内部状態）

### CLI拡張案

1. `--channel <a,b,c>`
2. `--exclude <a,b,c>`
3. `--format <text|jsonl>`
4. `--strict-channel`（未分類ログを非表示にする）

### 出力スキーマ（jsonl）

```json
{
  "ts": "2026-02-27T12:34:56.789Z",
  "channel": "runtime",
  "severity": "info",
  "message": "[UI] mounted",
  "source": "xsbug-log",
  "device": "esp32/moddable_two"
}
```

### 互換性

1. オプション未指定時は現行挙動と同等（全チャネル表示）。
2. 既存の `XSBUG_LOGMACHINE` カスタム実装を壊さない。
3. `mcconfig -dl` からの起動経路に透過的に適用可能。

### エラー条件

1. 未知チャネル指定時はエラー終了（`--strict-channel` 有効時）。
2. `--channel` と `--exclude` が矛盾した場合は `channel` 優先。
3. JSONエンコード失敗時はtextへフォールバックし警告出力。

## Drawbacks

[drawbacks]: #drawbacks

1. チャネル分類の初期実装コストがかかる。
2. ログ分類ルールが不十分だと期待との乖離が起きる。
3. オプション増加によりCLI学習コストが増える。

## Rationale and alternatives

[rationale-and-alternatives]: #rationale-and-alternatives

採用理由:

1. 既存 `xsbug-log` の拡張で導入コストが低い。
2. 開発体験とCI可観測性を同時に改善できる。
3. AI処理パイプラインへの入力品質を安定化できる。

代替案:

1. **代替A: 後段 `rg` 運用を継続**
   柔軟だが標準化できず、チーム運用として弱い。
2. **代替B: IDE側フィルタのみ**
   CLI/CI用途をカバーできない。
3. **代替C: 新規ツールを別実装**
   既存資産の再利用性が低く、採用コストが高い。

## Prior art

[prior-art]: #prior-art

1. `docker logs` / `kubectl logs` はラベル・時刻・フォーマットで運用される。
2. 一般的なテストランナーは `junit` / `json` 出力を持ち、後段解析を容易にする。
3. 既存 `xsbug-log` にはプラグイン拡張点があり、段階的導入に向く。

## Unresolved questions

[unresolved-questions]: #unresolved-questions

1. `build` チャネルを `xsbug-log` がどこまで責務として扱うか。
2. severity推定ルールを固定化するか、利用者定義可能にするか。
3. `mcconfig` 側引数受け渡し仕様をどこまで標準化するか。

## Future possibilities

[future-possibilities]: #future-possibilities

1. チャネルごとの色分けテーマ機能。
2. 失敗時に自動要約（first error, likely cause）の組み込み。
3. OpenTelemetry等の外部監視基盤へのブリッジ出力。
