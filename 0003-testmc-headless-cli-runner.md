- Feature Name: `testmc_headless_cli_runner`
- Start Date: 2026-02-27
- RFC PR: (TBD)
- Related Issue: P0-3 (ヘッドレス公式テストランナー)
- Target: Tooling (`testmc`, test runner, CI integration)

## Summary

[summary]: #summary

GUI依存の現行テスト運用を補完するため、`testmc` / `test262` をCLIから選択実行できる公式ヘッドレスランナーを提供し、ローカル自動化とCI運用を標準化する。

## Motivation

[motivation]: #motivation

現在のテスト運用は `xsbug` のTestタブに依存する操作が多く、次の制約がある。

1. CIでの再現が難しい。
2. GUI環境がないホストで運用できない。
3. テスト選択・実行・結果収集をスクリプト化しづらい。
4. 失敗結果の機械可読出力が限定的。

ユースケース:

1. **PRごとのsmoke test**
   特定ディレクトリだけ短時間で実行し、結果を自動判定したい。
2. **nightly full test**
   長時間の総合実行を無人で回し、失敗一覧を保存したい。
3. **開発者ローカル再現**
   失敗テストだけをCLIで再実行したい。

## Guide-level explanation

[guide-level-explanation]: #guide-level-explanation

提案後は、次のようなCLIを使う。

```bash
mctest run \
  --app testmc \
  --platform esp32/moddable_two \
  --select "moddable/tests/modules/piu/rgb565le/*" \
  --format junit \
  --out ./artifacts/test-results.xml
```

```bash
mctest run \
  --app test262 \
  --platform sim/moddable_two \
  --select "language/expressions/**" \
  --format json \
  --out ./artifacts/test262.json
```

使う側の考え方:

1. ビルド/デプロイ/実行を1コマンドで委譲するか、既存成果物を再利用するかを選ぶ。
2. テスト選択は `--select`（glob/prefix）で指定する。
3. 結果は `text/json/junit` から用途に応じて出力する。

これにより、GUI操作を前提にしない、再現可能なテスト運用をチーム標準にできる。

## Reference-level explanation

[reference-level-explanation]: #reference-level-explanation

### 提案コマンド

`mctest` を新設し、最低限以下を提供する。

1. `mctest run`
2. `mctest list`
3. `mctest rerun --failed <report>`

### 主なオプション

1. `--app <testmc|test262>`
2. `--platform <...>`
3. `--manifest <path>`
4. `--select <pattern>`
5. `--format <text|json|junit>`
6. `--out <path>`
7. `--timeout <ms>`
8. `--no-build` / `--no-deploy`

### 実行モデル

1. 必要なら `mcconfig` を呼び出してビルド・デプロイ。
2. テストランナーがデバッガ通信路を確立。
3. 指定パターンのテストを順次実行。
4. 失敗時に例外・ログ・対象テスト名を収集。
5. 集計結果を選択フォーマットで出力。

### 失敗モデル

1. 接続不可: 終了コード `2`
2. テスト失敗あり: 終了コード `1`
3. 内部エラー: 終了コード `3`
4. 全件成功: 終了コード `0`

### 互換性と移行

1. GUI Testタブ運用は維持する。
2. 既存テスト資産（frontmatter・構成）は変更不要。
3. 段階的にCLI運用へ移行可能。

## Drawbacks

[drawbacks]: #drawbacks

1. 新規ランナー実装と保守コストが発生する。
2. GUIとCLIで機能差が出ると混乱を招く。
3. デバイス固有タイミング差による不安定性対応が必要。

## Rationale and alternatives

[rationale-and-alternatives]: #rationale-and-alternatives

採用理由:

1. CI自動化のボトルネックを直接解消する。
2. ローカル再現コストを下げ、バグ修正サイクルを短縮できる。
3. 出力フォーマット標準化でAI/解析ツール連携が容易になる。

代替案:

1. **代替A: GUI操作をスクリプト化**
   環境依存が強く、安定運用が難しい。
2. **代替B: 各プロジェクトが独自ランナーを作成**
   重複投資と仕様分断が発生する。
3. **代替C: `mcconfig` に最小機能のみ追加**
   テスト選択・集計・再実行を十分に表現できない。

## Prior art

[prior-art]: #prior-art

1. `cargo test`, `pytest`, `go test` はCLI実行と機械可読レポートを標準提供。
2. ブラウザE2Eランナー（Playwright等）は headless 実行を基本機能として持つ。
3. 組み込み系でも、デバイス接続を含めたCLIテストランナーを持つプロジェクトはCI運用が安定しやすい。

## Unresolved questions

[unresolved-questions]: #unresolved-questions

1. `mctest` を新規ツール化するか、既存ツールのサブコマンドにするか。
2. test262リポジトリパス解決をどこまで自動化するか。
3. 実機切断や再接続時のリトライポリシーをどう設計するか。

## Future possibilities

[future-possibilities]: #future-possibilities

1. 失敗最小再現セットの自動抽出。
2. flaky test 検知（再実行統計）と隔離実行。
3. CI向けデフォルトワークフローテンプレートの同梱。
