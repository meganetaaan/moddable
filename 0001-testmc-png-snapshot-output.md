- Feature Name: `testmc_png_snapshot_output`
- Start Date: 2026-02-27
- RFC PR: (TBD)
- Related Issue: P0-1 (`testmc` のPNGスナップショット出力)
- Target: Tooling (`testmc`, `xsbug-log`)

## Summary

[summary]: #summary

`testmc` に「テスト実行中の描画結果をPNGとして保存する標準機能」を追加し、`screen.checkImage` のハッシュ検証と組み合わせて、機械判定と人間レビューを同時に成立させる。

## Motivation

[motivation]: #motivation

現行のグラフィクステストは `screen.checksum` / `screen.checkImage` によるハッシュ比較が中心で、回帰検知としては高速で有効である。一方で、次の課題がある。

1. ハッシュ値のみでは「何が変わったか」を人間が判断しづらい。
2. ゴールデン更新時に妥当性レビューを行うコストが高い。
3. 失敗時に再現環境を持たないメンバーが差分確認できない。
4. AIが説明を生成する際に、視覚的根拠を添えづらい。

このため、ハッシュに加えてPNGスナップショットを標準出力できる仕組みが必要である。  
ユースケースは以下。

1. **UIリファクタリング時のゴールデン更新**
   ハッシュ差分だけでなく画像差分をPRで確認し、意図した変更かを合意できる。
2. **デバイス依存描画差分の切り分け**
   `rgb565le` と他フォーマットで期待値が異なる場合でも、画像比較で差分の種類を把握できる。
3. **失敗時の非同期レビュー**
   テスト担当者以外でも保存済みPNGから不具合傾向を確認できる。

## Guide-level explanation

[guide-level-explanation]: #guide-level-explanation

提案後の使い方は次の通り。

1. 既存の `screen.checkImage(expected)` はそのまま使う。
2. 必要なステップで `screen.captureImage("home/step01")` を呼ぶ。
3. 実行後、`tests/golden/<format>/<scenario>/<step>.png` が生成される。
4. 既存ハッシュとPNGを同時に更新する。

例:

```js
/*---
flags: [module]
---*/
import {} from "piu/MC";

new Application(null, { /* ... */ });

screen.captureImage("home/step01");
screen.checkImage("b2342b9d128b17b544c8a1e7c4ff652d");
```

これにより、貢献者は「機械判定はハッシュ」「レビュー判断はPNG」という一貫した思考モデルで運用できる。  
既存テスト資産は破壊せず、段階的にPNG併用へ移行できる。

## Reference-level explanation

[reference-level-explanation]: #reference-level-explanation

### API提案

`testmc` の `screen` 拡張として以下を追加する。

1. `screen.captureImage(path[, options])`
2. `screen.captureNext([path, options])`（次回 `end` 時のみ保存）

`options` 例:

- `format`: `"png"`（将来拡張余地）
- `region`: `{x, y, width, height}`
- `annotate`: `boolean`（メタ情報埋め込み）

### データフロー

1. `ChecksumOut.end()` 時点で確定した描画データをキャプチャ対象として扱う。
2. ピクセルをテストランナーへ転送する。
3. ホスト側でPNGエンコードし、決定したパスへ保存する。

### 実装候補

1. `tools/testmc/commodettoChecksumOut.js` 拡張
2. `tools/xsbug-log` の既存バイナリ転送経路を活用
3. 追加メタデータ（pixelFormat, width, height）を付与

### 失敗時挙動

1. 保存失敗時はテストを失敗扱いにし、明示メッセージを返す。
2. `region` が不正な場合は `RangeError` を返す。
3. パス衝突時は `--overwrite` ポリシーに従う（初期値: fail）。

### 互換性

1. `screen.checkImage` 既存動作は変更しない。
2. PNG機能を使わないテストは現行コストのまま。
3. メモリ制約のため、バッファ保持は最小化しチャンク転送を優先する。

## Drawbacks

[drawbacks]: #drawbacks

1. テスト実行時間とI/O量が増える。
2. ホスト側PNGエンコード実装の保守コストが発生する。
3. 画像が増えることでリポジトリ管理負荷が上がる。

## Rationale and alternatives

[rationale-and-alternatives]: #rationale-and-alternatives

採用理由:

1. ハッシュ比較の高速性を維持したまま可読性を補完できる。
2. 既存 `testmc` ワークフローに自然に統合できる。
3. スナップショットを標準化することで運用ばらつきを抑えられる。

代替案:

1. **代替A: すべてハッシュのみで維持**
   レビュー性が解決しないため不採用。
2. **代替B: 外部スクリーンショット機材で運用**
   自動化困難かつ再現性が低いため不採用。
3. **代替C: 差分画像のみ保存**
   元画像がないと説明困難なため不採用。

## Prior art

[prior-art]: #prior-art

1. ブラウザE2E（Playwright/Cypress）の snapshot testing は、画像と差分を保存してレビューに使う運用が一般的。
2. ネイティブUIのゴールデンテストでも、ハッシュ単独より「可視成果物 + 自動判定」が主流。
3. 既存Moddableでは `screen.checkImage` によるハッシュ運用が確立しており、これを拡張する形が最小変更。

## Unresolved questions

[unresolved-questions]: #unresolved-questions

1. PNGエンコードをデバイス側で行うかホスト側で行うか。
2. 画像保存先の標準レイアウトをどこまで固定するか。
3. 大量スナップショット時の容量管理（圧縮・保持期間）をどうするか。

## Future possibilities

[future-possibilities]: #future-possibilities

1. 自動差分画像生成（before/after/diff）の標準化。
2. `checkImage` 失敗時に自動でPNGを採取するモード。
3. CIでの画像アーティファクト公開（PRコメント連携）。
