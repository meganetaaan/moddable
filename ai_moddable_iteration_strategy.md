# AIでModdableの開発イテレーションを高速化する方策

## 目的
- 変更から検証までの時間を短縮する
- 描画回りの不具合を早期に検出する
- ログ解析をAIが扱いやすい形にする
- 実機依存の手戻りを減らす

## 現状の整理（重要）
- `testmc` には既に描画検証機能がある  
  (`screen.checksum`, `screen.checkImage`, `screen.doTouch*`)
- ただし、これが「アプリE2Eの継続運用」に結びついていない
- `xsbug-log` は `XSBUG_LOGMACHINE` で拡張可能だが、標準ではログフィルタが弱い

## 課題と解決策
| 課題 | 影響 | 解決策 | すぐやること |
|---|---|---|---|
| E2Eテストの仕組みがない | 変更のたびに目視確認が必要 | `testmc` ベースで「UIシナリオE2E」を追加 | 代表3画面をチェックサム化して自動テスト化 |
| Piu/Commodettoの描画結果を確認できない | レイアウト崩れや回帰を見逃す | `screen.checkImage` を基準にし、要所フレームを検証 | 重要画面のゴールデンチェックサムを作成 |
| ゴールデンがハッシュのみで人間に読みにくい | PRレビューで正誤判断が難しい | 正解画像(PNG)とchecksumの二層管理 | `tests/golden` に画像基準を導入 |
| xsbugターミナルログが多すぎる | 本質的なデバッグログが埋もれる | `XSBUG_LOGMACHINE` でチャンネル別フィルタ | `BUILD/DEBUG/TEST` のログ分類を導入 |
| ビルドと実行ログが混在 | 1回の確認コストが高い | build/deploy/xsbug を分離実行 | `-t build`/`-t deploy`/`-t xsbug` の運用を標準化 |
| テスト実行がGUI寄り | 自動化/CIに載せにくい | ヘッドレス実行スクリプトを整備 | `mcconfig -dl` 前提の実行ラッパー作成 |
| simulatorで非moduleテストをまとめ実行すると不安定 | `duplicate variable` などで誤検知が増える | 暫定で「1 test = 1 simulator process」にする | `mctest list` + 単体 `mctest run` ループを標準化 |
| CIでの回帰検知が弱い | 問題が後工程で発覚 | シミュレータ + 実機の2段CI | PRでsmoke、nightlyでフルテスト |
| 失敗時の情報が散在 | AI解析の精度が下がる | 失敗時アーティファクトを固定形式で保存 | checksum/log/stacktraceを1フォルダに集約 |
| パフォーマンス退行の見える化不足 | 体感劣化を後から検知 | FPS/heap/GC/起動時間を定点計測 | 主要シナリオの閾値テストを追加 |
| マニフェスト構成が案件ごとにばらつく | 新規開発の立ち上がりが遅い | `examples` / `contributed` 準拠の雛形を標準化 | スキャフォールディング定義を固定 |

## 最優先2課題への具体策

### 1. E2E不在・描画確認不可への対応
`testmc` を核に、以下の3層で検証する。

1. 描画ユニットテスト
   - Poco/Piu部品単位で `screen.checkImage` を使う
2. UIシナリオテスト
   - `screen.doTouchBegan/Moved/Ended` で操作を再現
   - 状態遷移ごとに `screen.checkImage` を比較
3. 実機スモークE2E
   - 主要フローのみを日次で実機実行（起動、画面遷移、入力、通信）

実装ポイント:
- 「画面全体1枚」ではなく「シナリオ中の要所フレーム」を検証する
- 画面フォーマット差分（`rgb565le` など）ごとに期待値を分ける
- 失敗時はチェックサムだけでなくイベント列も保存する

### 2. xsbugログ過多への対応
短期は運用、長期は拡張で解決する。

短期（運用）:
```bash
# 1) ビルド
mcconfig -d -m -p esp32/moddable_two -t build

# 2) デプロイ
mcconfig -d -m -p esp32/moddable_two -t deploy

# 3) 実行ログ確認（ビルド出力を最小化）
mcconfig -dl -m -p esp32/moddable_two -t xsbug
```

testmc simulator 暫定運用:
```bash
node tools/testmc/mctest.js list --app testmc --root tests/modules --select 'piu/rgb565le/*' | \
while IFS= read -r test; do
	[ -z "$test" ] && continue
	node tools/testmc/mctest.js run \
		--app testmc \
		--root tests/modules \
		--select "$test" \
		--launch "xvfb-run -a mcconfig -d -m -p lin -t xsbug" \
		--connect-timeout 60000 \
		--timeout 60000 || break
done
```

中期（拡張）:
- `XSBUG_LOGMACHINE` で独自 `LogMachine` を差し込み
- 出力を `channel` 付きJSON Linesに変換
  - 例: `{"ts":"...","channel":"debug","msg":"..."}`
- AIには `debug`/`test` のみ渡す

## 追加改善: ゴールデンデータをhuman readableにする
現状は `screen.checkImage("md5...")` 形式で、機械判定は速いがレビュー性が低い。  
このため、ゴールデンは「画像」と「checksum」の二層構成にする。

推奨構成:
```text
tests/
  e2e/
    scenarios/
      home.flow.js
      settings.flow.js
  golden/
    rgb565le/
      home/
        step01.png
        step02.png
      settings/
        step01.png
    checksums/
      rgb565le.json
```

運用ルール:
1. レビュー対象は `png`（人間が確認）
2. 自動判定は `checksums/*.json`（高速・軽量）
3. `update-golden` で `png` と checksum を同時更新
4. PRでは画像差分とchecksum差分をセットで確認

これにより、既存の `testmc` 互換を維持しつつ、ゴールデン更新判断を人間が行いやすくできる。

## スキャフォールディング定義（examples / contributed準拠）

### 方針
- 共通は `examples/manifest_base.json` に寄せる
- 機能は `manifest_net.json` / `manifest_piu.json` の include で合成する
- プロダクト固有設定はローカル `manifests/*.json` に分離する
- 実機固有値は `platforms` と `config` に閉じ込める

### 推奨ディレクトリ
```text
<project>/
  manifest.json
  manifests/
    manifest.app.json
    manifest.platforms.json
    manifest.e2e.json
  src/
    main.js
    app/
  assets/
  tests/
    e2e/
      scenarios/
    golden/
      rgb565le/
      checksums/
  tools/
    e2e/
      update-golden.js
      verify-golden.js
```

### テンプレート1: ルート `manifest.json`（合成専用）
```json
{
  "include": [
    "$(MODDABLE)/examples/manifest_base.json",
    "$(MODDABLE)/examples/manifest_net.json",
    "$(MODDABLE)/examples/manifest_piu.json",
    "./manifests/manifest.app.json",
    "./manifests/manifest.platforms.json"
  ]
}
```

### テンプレート2: `manifests/manifest.app.json`（アプリ本体）
```json
{
  "modules": {
    "main": "./src/main",
    "*": "./src/app/*"
  },
  "preload": [
    "main"
  ],
  "resources": {
    "*": [
      "./assets/*"
    ],
    "*-alpha": [
      "./assets/masks/*"
    ]
  },
  "config": {
    "appName": "sample-app",
    "features": {
      "e2e": true
    }
  }
}
```

### テンプレート3: `manifests/manifest.platforms.json`（実機差分）
```json
{
  "platforms": {
    "esp32": {
      "modules": {
        "setup/network": "$(BUILD)/devices/esp32/setup/network"
      },
      "preload": "setup/network",
      "defines": {
        "poco": {
          "log": false
        }
      }
    },
    "nrf52/moddable_four": {
      "config": {
        "format": "Gray256"
      }
    },
    "...": {
      "error": "platform unsupported"
    }
  }
}
```

### テンプレート4: `manifests/manifest.e2e.json`（E2E専用ビルド）
```json
{
  "include": [
    "./manifest.app.json"
  ],
  "config": {
    "e2e": {
      "enabled": true,
      "goldenPath": "./tests/golden/rgb565le"
    }
  },
  "defines": {
    "poco": {
      "log": false
    }
  }
}
```

使い分け:
- 開発通常: `manifest.json`
- E2E更新: `mcconfig manifests/manifest.e2e.json -d -m ...`
- リリース: E2E専用configを含まないmanifestでビルド

## AI前提の開発ループ（推奨）
1. AIが変更差分を読み、影響範囲から必要テストを選ぶ
2. 自動で `build -> deploy -> xsbug-log -> test` を実行
3. 失敗時にAIがログを要約し、再現条件と仮説を提示
4. AIが最小修正案を作成し、再テスト
5. 成功時に「変更理由 + テスト証跡」をMarkdownに出力

## 90日ロードマップ

### 0-2週（即効）
- ログ分離運用を標準化（build/deploy/xsbug分割）
- 代表画面の `screen.checkImage` テストを追加
- 失敗アーティファクト保存ルールを決定

### 3-6週（基盤化）
- `XSBUG_LOGMACHINE` カスタム実装
- ヘッドレス実行ラッパー整備
- PR用smokeテストを導入

### 7-12週（拡張）
- 実機nightly E2Eを導入
- パフォーマンス回帰テストを導入
- AI自動修正ループ（Fail -> Hypothesis -> Patch -> Re-test）を定着

## 成果指標（KPI）
- 変更から一次検証完了までの時間（目標: 50%以上短縮）
- 描画回帰の検出率（目標: 目視検出前に80%以上を自動検知）
- ログ解析時間（目標: 障害切り分け時間を半減）
- PRあたりの再オープン率（目標: 継続的低下）

## 補足（この計画のポイント）
- 「新規に巨大な仕組みを作る」より、既存の `testmc` と `xsbug-log` を拡張する方が速い
- まずは代表フローを少数で自動化し、成功パターンを横展開する
