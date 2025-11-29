# stack-chan Piu Face: Design Notes

## Goals
- FaceContext を唯一の state とし、描画・アニメーションは常にこれを参照。
- Blink / Breath / Saccade をモジュラーな Modifier として適用し、CPU・ヒープ消費を抑える。
- Piu のレイアウト／描画特性に合わせ、不要な Content 作成や再配置を避ける。

## FaceContext
```ts
type FaceContext = {
  mouth: { open: number }            // 0..1
  eyes: {
    left:  { open: number, gazeX: number, gazeY: number }
    right: { open: number, gazeX: number, gazeY: number }
  }
  breath: number                     // 0..1 (ゆらぎ)
  emotion: 'NEUTRAL' | 'ANGRY' | 'SAD' | 'HAPPY' | 'SLEEPY' | 'DOUBTFUL' | 'COLD' | 'HOT'
  theme: { primary: [r,g,b], secondary: [r,g,b] }
}
```
- currentContext と lastContext の2つだけを持ち、参照をスワップする方式でヒープ割当を抑える。
- deepEqual ではなく、手書きのフィールド比較で差分検出（口・目・テーマ単位の軽量比較）。

## Modifiers
各 Modifier は `(intervalMs, faceContext) => void` で、副作用として FaceContext を直接書き換える。
- **Blink**: 乱数ベースで open を 1→0→1 に補間。left/right で同一タイミング。生成物なし、Math.random() の呼び回数も最小に。
- **Breath**: `breath` のゆらぎを sin 波で更新。オフセットのみ更新し、事前計算不要。
- **Saccade**: 視線 (gazeX/Y) を短い間隔でステップ変更。目ごとに同じ値を共有し、計算は1回に。
- Modifier の導入順は [Blink, Breath, Saccade]。各 Modifier は自身が触るフィールドのみ変更。

## Renderingパイプライン（責務分離案）
1. `tick(interval)` 呼び出し。
2. `currentContext` に `desiredContext` をコピー。
3. Modifiers を順に適用（副作用で currentContext 更新）。
4. **パーツ自身で差分判定**: FaceBehavior が最新の FaceContext を子に配信し、各 Behavior が自身のキャッシュと比較して必要な更新だけ行う。
   - MouthBehavior: `lastOpen` を保持し、変化時のみ `width/height/left/top` を更新。
   - EyeBehavior: `lastGazeX/Y/open` を保持し、虹彩の translate/scale だけを更新。Outline 再生成は必要時のみ。
   - EyelidBehavior: `lastOpen` や emotion による形状をキャッシュし、まぶた高さやパスを更新。
   - Theme 変更は FaceBehavior が skin を一括変更（色再計算のみ）。
5. Content の生成破棄はゼロ。更新は setter と Outline 差し替えに限定。

## Piu 実装ポイント
- Mouth/Eyelid/Eye は既存の Content/Shape を再利用し、`width/height/left/top` の setter のみで動かす。
- Outline は再利用: `CanvasPath` を毎フレーム新規生成せず、できるだけ同じ `Outline` を `translate/scale` で再利用。必要最小限で再生成。
- アニメーション駆動は `application.interval`（または Face root の interval）で 30–60fps 程度に固定。モディファイアの周期は各自で内部カウント。
- 乱数呼び出しはブリンク開始時・サッカード更新時のみ。

## CPU/メモリ節約策
- new / delete を避け、すべてのパーツを初期化時に作成・保持。
- Color, vectors などは再利用バッファを共有（例: `tmpColor` 配列を1つだけ保持）。
- パス計算が不要なフレームでは Outline へ触れない。Eye/Mouth/Eyelid の Behavior 内で「値が変わったときだけ再計算」。
- `interval` を 30–50ms にして無駄な wake-up を減らす。

## TODO / 次の実装ステップ
1) FaceContext ユーティリティ（生成・コピー）。差分判定は各 Behavior に移管するため最小限。  
2) Blink/Breath/Saccade の Modifier 実装（副作用型）。  
3) FaceBehavior: interval ドライバ + FaceContext 配信。  
4) Mouth/Eye/Eyelid Behavior にローカルキャッシュと差分更新処理を実装。  
5) 既存 main.js を新パイプラインに差し替え。  
6) トレース用の軽量ログフック（ビルド時フラグで無効化可）。  
