# Linux シミュレータでの IO AudioIn/AudioOut 対応設計

## 目的
Linux 上の Moddable シミュレータ（`-p sim/...`）で、IO モジュールの `AudioIn` / `AudioOut` を macOS と同等に利用できるようにする。macOS では AudioQueue を使った実装が既にあるため、その API と挙動に合わせた Linux 実装を完成させる。

## 背景 / 現状
- **macOS**: `modules/io/audioin/mac/audioin.m` / `modules/io/audioout/mac/audioout.m` に AudioQueue ベースの実装があり、`onReadable` / `onWritable` で JS へコールバックする構成が確立している。
- **Linux**: `modules/io/audioin/lin/audioin.c` / `modules/io/audioout/lin/audioout_.c` に ALSA + GLib を使った実装が既に存在する。
  - 別スレッドで ALSA の `snd_pcm_readi` / `snd_pcm_writei` を実行し、GLib の idle source を使って JS 側へ `onReadable` / `onWritable` をデリバリする。
- **問題点**: Linux シミュレータでビルドしたアプリが ALSA にリンクされないため、`AudioIn` / `AudioOut` を含むとリンクエラーまたはロード時の未解決シンボルが発生する。
  - `tools/mcconfig/make.lin.mk` の `LINK_LIBRARIES` に `-lasound` が入っていない。

## 目標
- Linux シミュレータで `AudioIn` / `AudioOut` が **同一の JS API** で動作する。
- macOS 実装と同様に、`onReadable` / `onWritable` は **メインスレッド** 上で実行される。
- 既存の Linux 実装（ALSA + GLib + worker thread）を最大限活用する。

## 非目標
- デバイス選択 UI の追加や GUI 設定。
- API の互換性を壊す拡張（Linux 固有オプションの追加）。
- 音声エフェクトやミキサー機能の追加。

## 提案アーキテクチャ
### ランタイム構成（現行 Linux 実装の踏襲）
- **I/O スレッド**
  - ALSA PCM を `snd_pcm_open("default")` で開く。
  - `snd_pcm_hw_params_*` でフォーマット・サンプルレート・チャネル数を設定。
  - `AudioIn` は `snd_pcm_readi` でバッファを埋める。
  - `AudioOut` は `snd_pcm_writei` でバッファを再生。
- **メインスレッド**
  - `g_idle_source_new()` により JS コールバックをメインスレッドへディスパッチ。
  - `onReadable` / `onWritable` の呼び出し条件は macOS と同じく `running` フラグで制御。

### API 互換性
- `audioType` は macOS と同様に `"LPCM"` のみ許可。
- `bitsPerSample` は 8 / 16 を許可。
- `channels` は 1 / 2 を許可。
- `sampleRate` は 8000〜48000 を許可。
- `queueLength` を指定可能。
- `start()` / `stop()` は JS コールバックの有効化/無効化として振る舞う。

## ビルド / リンク設計（主要変更点）
Linux シミュレータで `AudioIn` / `AudioOut` を利用するには、**app 用共有ライブラリ（mc.so）** に ALSA をリンクする必要がある。

### 方針
- **アプリ側で AudioIn/Out を使う場合のみ ALSA をリンク**する。
- そのために `make.lin.mk` に「追加ライブラリ変数」を用意し、`AudioIn/Out` の manifest から設定できるようにする。

### 具体的変更
1) `tools/mcconfig/make.lin.mk`
- `LINK_LIBRARIES` に追加の変数を連結できるようにする。
- 例:
  ```make
  LINK_LIBRARIES = -lm -lc $(shell $(PKGCONFIG) --libs gio-2.0) -lpthread $(LINUX_AUDIO_LIBS)
  C_FLAGS = -fPIC -shared -c $(shell $(PKGCONFIG) --cflags gio-2.0) $(LINUX_AUDIO_CFLAGS)
  ```

2) `modules/io/audioin/manifest.json` / `modules/io/audioout/manifest.json`
- `lin` の platform 設定に `build` を追加して ALSA ライブラリを要求する。
- 例:
  ```json
  "platforms": {
    "lin": {
      "build": {
        "LINUX_AUDIO_LIBS": "-lasound"
      },
      "modules": { ... }
    }
  }
  ```

### 依存関係
- Linux ビルド環境に `libasound2-dev`（または相当する ALSA 開発パッケージ）が必要。
- 既存のシミュレータは GTK/GLib を使っているため、GLib 依存は既に満たされる想定。

## エラーハンドリング方針
macOS では `AudioQueueNewInput/Output` に失敗した場合、コンストラクタで例外を投げる。Linux 実装は ALSA を別スレッドで開くため、現状は stderr に出るだけで JS へは伝わらない。

**改善案（任意）**:
- ALSA 初期化をコンストラクタに寄せる、または
- 初期化失敗時に `xsUnknownError("cannot open audio device")` をメインスレッドへ通知する。

この改善は今回の「Linux シミュレータでの利用可能化」の必須条件ではないが、macOS 互換性を高めるために検討する。

## テスト計画
### 1. AudioOut
- `examples/io/audioout/play-async` / `play-sync` を `-p sim/...` でビルドし再生確認。
- 音量変更 API (`volume`) が意図通り動作するか確認。

### 2. AudioIn
- `examples/io/audioin/levelmonitor` / `capture-sync` を `-p sim/...` でビルドし入力確認。
- Linux デスクトップ環境でマイク権限が必要な場合は OS 設定で許可する。

### 3. 回帰
- AudioIn/Out を使わない通常のシミュレータアプリが ALSA 未インストール環境でもビルド可能か（追加リンクを optional にできているか）を確認。

## リスク / 課題
- **ALSA 依存**: `libasound2-dev` がない環境では AudioIn/Out を含むビルドが失敗する。
- **デバイス競合**: ALSA の `default` デバイスが占有されている場合、初期化に失敗する可能性がある。
- **遅延**: `queueLength` と `bufferSize` が不適切だと遅延やドロップが発生する。

## まとめ
Linux では既に AudioIn/Out の ALSA 実装があるため、**ビルド・リンクの整備が主作業**となる。`make.lin.mk` に追加ライブラリを注入できる仕組みを導入し、AudioIn/Out の manifest から `-lasound` を指定することで、macOS と同様に IO AudioIn/Out を Linux シミュレータで利用可能にする。
