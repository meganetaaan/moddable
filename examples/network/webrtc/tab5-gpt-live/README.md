# GPT-Live-1で会話するTab5サンプル

M5Stack Tab5のマイクとスピーカーで音声会話し、画面に日本語字幕を表示します。「開始」「終了」「ミュート」と音量ボタンを備えます。入力と出力の字幕は別々に保持し、それぞれ直近600文字を表示対象とします。

音声から端末の独自ツールも使えます。「端末の音量を40パーセントに変更して」「今の音量とWi-Fiの状態を教えて」と話しかけると、`set_volume`と`get_device_status`を実行し、その結果を返答に使います。成功・失敗は`LIVE tool`ログで確認できます。

## ビルド環境を用意する

このブランチのTab5プラットフォーム、ESP-IDF 6.0.2、`fontbm`を使用します。ESP WebRTC Solutionは次のコミットを参照します。

```sh
git clone https://github.com/espressif/esp-webrtc-solution.git /path/to/esp-webrtc-solution
git -C /path/to/esp-webrtc-solution checkout c8650846b512e6e1375e5f78c1c41619b8d645eb
export ESP_WEBRTC_SOLUTION=/path/to/esp-webrtc-solution
export MODDABLE=/path/to/this/worktree
export PATH="$MODDABLE/build/bin/lin/release:$PATH"
export IDF_PATH=/path/to/esp-idf-v6.0.2
. "$IDF_PATH/export.sh"
```

Moddableのホストツールはこのworktreeからビルドしてください。ESP Capture 1.0.4、ESP-SR 2.4.7などの依存はマニフェストから取得します。

## 秘密情報と日本語フォントを生成する

通常のOpenAI APIキーを端末に入れない構成では、先に[短期トークンサーバーの手順](broker/README.md)を実施してください。以下は通常キーで直接接続する場合の設定です。

このディレクトリで次を実行します。Wi-Fiのパスワードは入力欄で非表示になります。

```sh
python3 configure.py --env-file /path/to/.env --ssid YOUR_WIFI_SSID
```

`.env`の`OPENAI_API_KEY`を読み、権限0600の`manifest.local.json`を生成します。日本語フォントは既存のNoto Sans JPから生成します。設定ファイルと生成フォントはGit管理外です。APIキーとWi-Fi認証情報はビルド済みファームウェアにも含まれるため、ファームウェアやビルドディレクトリを共有しないでください。

通常は画面の「開始」で接続します。端末時刻が未設定なら、Wi-Fi接続後にNTPで同期します。実機試験では`--auto-start --test-seconds 45`を追加すると、起動後に1回だけ接続し、接続から45秒後に終了します。自動開始の実行済み状態を端末に保存するため、再起動しても同じ設定で再接続し続けることはありません。試験をやり直す場合は`configure.py`で新しい設定を生成してください。

次の設定では、最初に3分、続いて30秒を4回接続します。正常終了を確認できた場合だけ次の接続へ進みます。各回の開始10秒後にミュートし、15秒後に再開します。

```sh
python3 configure.py --env-file /path/to/.env --ssid YOUR_WIFI_SSID \
	--auto-start --test-seconds 180 --test-repeat-seconds 30 --test-cycles 5 --test-mute
```

## ビルドと実機への書き込み

```sh
mcconfig -dn -m -p esp32/m5stack_tab5 -t build
export UPLOAD_PORT=/dev/ttyACM1
export DEBUGGER_PORT=/dev/ttyACM1
mcconfig -dl -m -p esp32/m5stack_tab5
```

今回の対象機のUSBシリアル番号は`60:55:F9:FB:02:A3`です。複数台ある場合は`/dev/serial/by-id`で照合してから書き込んでください。デバッガーはxsdbを使います。`LIVE state`、`LIVE event`、`LIVE stats`で接続状態と音声処理の進行を確認できます。字幕もデバッグ出力されるため、ログの取り扱いは会話内容に合わせてください。

## ホスト側のプロトコル試験

worktreeルートで実行します。APIキーやネットワークは使いません。

```sh
build/bin/lin/release/xst -m tests/modules/network/services/realtimeConversation/core.js
build/bin/lin/release/xst -m tests/modules/network/services/realtimeConversation/http.js
```

## 実機検証（2026-09-12）

| 項目 | 結果 |
| --- | --- |
| プロトコル／HTTPSのホスト試験 | 25件＋8件が合格。ツールと短期トークン接続の終了競合を含む |
| 短期トークンサーバー | 8件が合格。期限切れ・再利用・同時使用・別セッション操作を検証 |
| Tab5ビルド、既存の`tab5-whip`ビルド | 成功 |
| 時刻未設定からの起動 | NTP同期後、証明書を検証してLiveへ接続 |
| マイク入力と日本語字幕 | PCで再生した英語の試験文を認識し、日本語の返答を受信 |
| Web検索 | `response.web_search_call.completed`と日本語の結果を受信 |
| 応答中の停止要求 | 20まで数える応答が17で止まり、新しい要求への返答に切り替わった |
| 3分の会話 | `session.closed`と確定使用量180秒を受信 |
| 連続開始・終了 | 7回正常終了。ミュート／再開も各回成功 |
| 3分接続後の再接続 | 別の再試験で180秒＋30秒を正常終了 |
| 資源解放 | 5回試験の解放後空きヒープは27,632,199〜27,632,219バイト。継続的な減少なし |
| タッチ修正後の手動操作 | 実機のボタンから2回接続・終了。確定使用量62秒／89秒を受信 |
| 終了・音量ボタンの表示 | ユーザーが「会話を終了しました」と音量の表示、およびタッチ動作を確認 |
| 人による音声・字幕・割り込み確認 | 実機を操作したユーザーが、聞き取りやすさ・字幕表示・返答中の割り込みすべて問題なしと確認 |
| 独自ツール | 日本語の試験音声から音量40%への変更と端末状態取得を実行。両方の成功ログと日本語の返答を確認 |
| 短期トークンでの実機接続 | 独自CAを検証するHTTPSでトークンを取得し、GPT-Liveへ接続。再接続で新しいトークンを発行 |
| 短期トークン接続でのツール実行 | `set_volume`と`get_device_status`が成功。日本語で音量40%とWi-Fi状態の返答を受信 |
| 短期トークン接続の終了 | 122秒／77秒の確定使用量と正常終了を受信。両方でサーバーの`session.released`を確認 |
| 端末からのAPIキー除外 | サーバーモードの設定、書き込んだBINとELFに通常のOpenAI APIキーを含まないことを確認 |

Opusエンコーダーのスタック不足による再起動は、エンコーダー／デコーダーのスタックを40 KiBにして解消しました。

Tab5のタッチドライバーにあった余分な座標回転も削除しました。センサーが返す720×1280の座標をPiu側で画面の向きに合わせます。修正前は「開始」を押しても別の位置として扱われ、ボタンが反応しませんでした。

試験中に一度、Wi-Fiの受信強度を取得できなくなり、ミュート解除と終了確認が失敗しました。端末リセットで復旧し、その後の7回の接続、および180秒＋30秒の再試験では再発していません。原因は未特定です。AECの抑制量と割り込み遅延の定量評価は未実施です。

公開APIと終了結果の扱いは[モジュールのREADME](../../../../modules/network/services/realtimeConversation/README.md)を参照してください。
