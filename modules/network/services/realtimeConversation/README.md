# RealtimeConversation for M5Tab / CoreS3

M5Stack Tab5からGPT-Live-1へ接続する音声会話モジュールです。Opus音声はWebRTCで送受信し、セッション制御と字幕は`oai-events`データチャネルで扱います。通常キーによる直接接続と、付属サーバーの短期トークンを使う接続に対応します。

`gpt-live-1`と音声`marin`を既定値とし、調べ物はOpenAIが管理するResponsesバックエンド（`gpt-5.6-terra`、`web_search`）へ委譲します。ChatAudioIOとは独立したモジュールです。

## アプリケーションから接続する

マニフェストに`$(MODDABLE)/modules/network/services/realtimeConversation/manifest.json`を含め、Wi-FiのIPアドレス取得後、証明書検証に使うシステム時刻を設定してから接続します。ビルド環境と操作例は[Tab5サンプル](../../../../examples/network/webrtc/tab5-gpt-live/README.md)を参照してください。

```js
import RealtimeConversation from "realtimeConversation";

const conversation = new RealtimeConversation({
	apiKey,
	onStateChanged(state) { trace(`${state}\n`); },
	onTranscript({role, delta, start_ms, end_ms}) {
		// deltaを空白も含めて連結する。両者の時刻が重なる場合もある。
	},
	onEvent(event) {},
	onError(error) { trace(`${error.code}: ${error.message}\n`); }
});
await conversation.connect();
conversation.setVolume(0.5);
await conversation.setMuted(true);
await conversation.setMuted(false);
const result = await conversation.close();
// result.finalizedがtrueの場合、session.closedを確認済み。
```

| API | 動作 |
| --- | --- |
| `connect(): Promise<{id}>` | `session.started`まで待機。開始のタイムアウトは60秒 |
| `close(): Promise<CloseResult>` | `session.close`を送り、最長15秒待って音声・通信資源を解放 |
| `setMuted(boolean): Promise<void>` | 入力をミュート／再開。コマンドIDが一致する応答を最長5秒待機 |
| `setVolume(number): void` | 0〜1で再生音量を設定 |
| `state` | `idle`、`connecting`、`connected`、`closing`、`closed`、`error` |
| `sessionId`, `muted`, `volume` | 現在のセッションIDと音声設定 |
| `usage` | 最後に届いた累積使用量。`seconds`は加算せず更新 |
| `stats` | 音声サンプル数、平均絶対振幅、バッファ不足・あふれ回数、空きヒープ |

オプションは`apiKey`のほか、`model`、`voice`、`instructions`、`delegation`と上記コールバックを受け付けます。`onEvent`にはResponses委譲に関する`response.event`も届きます。

字幕は入力・出力ごとの時刻付き断片です。ターン完了通知として扱わず、履歴には上限を設けてください。ミュート応答が失われた場合、マイクはローカルでミュートした状態を保ちます。

## 短期トークンで接続する

`apiKey`の代わりに`broker`を指定すると、通常のOpenAI APIキーを端末に渡さずに接続できます。付属サーバーが発行する60秒有効・1回限りのトークンを使用します。OpenAI公式のRealtime用Ephemeralトークンとは異なります。

```js
const conversation = new RealtimeConversation({
	broker: {
		url: "https://broker.example:8443",
		deviceToken,
		// 独自CAを使う場合のみ、DER形式の公開CA証明書をcertificateに渡す。
	},
	tools,
	onTranscript(fragment) {},
	onError(error) {}
});
await conversation.connect();
```

接続ごとに端末認証・トークン発行・SDP交換を行います。トークン取得が失敗しても通常キーによる接続へ切り替えません。HTTPSを必須とし、リダイレクトには追従しません。終了用トークンはセッションに限定され、通常終了・通信エラー・遅れて届いた開始応答の後片付けに使います。

このモードのモデル・指示・音声・ツール定義はサーバー側の設定が適用されます。端末の`tools`には実行関数を登録します。詳細は[付属サーバーの手順](../../../../examples/network/webrtc/tab5-gpt-live/broker/README.md)を参照してください。

## 独自ツールを実行する

`tools`に関数定義と`execute`を渡します。Responsesへの委譲時に関数定義を登録し、完了した関数呼び出しを端末で実行します。既定のWeb検索と併用できます。

```js
const conversation = new RealtimeConversation({
	apiKey,
	tools: [{
		name: "get_status",
		description: "端末の現在の状態を取得する。",
		parameters: {type: "object", properties: {}, required: [], additionalProperties: false},
		execute(args, context) {
			if (Object.keys(args).length || context.isCancelled()) throw new Error("Invalid request");
			return {ready: true};
		}
	}],
	toolTimeout: 30000,
	onToolResult({name, error}) { trace(`${name}: ${error ?? "ok"}\n`); }
});
```

`execute`は文字列、JSONに変換できる値、またはそれらを返すPromiseを返します。文字列はそのまま、それ以外はJSONにして返却します。引数はJSONオブジェクトとして解析しますが、JSON Schema全体の検証は端末では行いません。範囲・型・権限の確認は`execute`内で行ってください。`strict`の既定値は`true`です。

モジュールは`response.created`のIDと`response.output_item.done`の関数呼び出しを保持し、`response.completed`後に実行します。すべての結果を`response.item.create`で返してから、`response.create`で応答を継続します。空の完了スナップショットや重複通知で呼び出しを取りこぼしたり、同じ`call_id`を再実行したりしません。異なるIDの呼び出しは別操作として扱います。

未登録の関数、不正な引数、例外、時間切れは、エラーコードを含む結果としてバックエンドに返します。例外のメッセージは送信しません。`onToolResult`で各結果を確認できます。時間切れは既定30秒です。会話終了・時間切れ後は結果を送らず、実行中の処理には`context.isCancelled()`で中止状態を伝えます。外部操作を強制的に取り消すことはできないため、非同期処理はこの状態を確認してから副作用を確定してください。発話への割り込みだけではツールは中止しません。

登録は32関数、1応答は16呼び出し、1セッションは256個の異なる呼び出しIDまでです。結果は1件8,192文字までで、送信待ちイベント全体にも128 KiBの上限があります。大きなデータは短く要約して返してください。

## 終了結果を確認する

`CloseResult`は`{finalized, reason, usage?}`です。通信切断や終了タイムアウトでは`finalized: false`になり、使用量は最終値とは限りません。既知のセッションIDがあればHTTP hangupも試みますが、これだけで使用量の確定とは判断しません。開始前のキャンセルは`reason: "not_started"`で、セッションは作成されません。

同じインスタンスでの`connect()`や`close()`の重複呼び出しは、同じ処理を待ちます。終了後に会話を始める際は、新しいインスタンスを作成してください。通信が切れても、有料セッションを自動で作り直すことはありません。

HTTPS要求は45秒、応答本文は128 KiBを上限とし、成功・失敗のどちらでも接続を閉じます。証明書検証に必要なCA証明書はモジュールのマニフェストに含めています。

## 音声とネイティブ資源の所有

Tab5の既存プロバイダーがES7210とES8388を初期化します。本モジュールはI2S0の送受信を同時に確保し、48 kHzのステレオI2Sを使います。マイクと再生参照を同じリサンプラーで16 kHzへ変換し、ESP-SRの`AEC_MODE_FD_LOW_COST`へ入力します。AEC参照にはソフトウェア音量調整後の再生信号と無音区間を含めます。DMA遅延の初期設定は30 msです。実際のエコー抑制効果と割り込み性能は実機試験で確認する必要があります。

会話中は`device.audio`などから別のAudioIn／AudioOutを開かないでください。同時に開始できるRealtimeConversationは1つです。終了処理ではネイティブタスクを停止し、終了通知をJavaScriptが受け取ってからホストデータを解放します。イベントキューは128件・合計128 KiB、送信コマンドキューは8件で、あふれはエラーとして通知します。

Opusのエンコーダーとデコーダーには、それぞれ40 KiBのタスクスタックを確保します。ESP Captureの既定値4 KiBでは、ESP32-P4上のSILKエンコードでスタック保護例外が発生するためです。

## プロトコルの参照先

- [OpenAI Live API](https://developers.openai.com/api/docs/guides/live)
- [WebRTC接続](https://developers.openai.com/api/docs/guides/voice-webrtc?api=live)
- [Responsesへの委譲](https://developers.openai.com/api/docs/guides/live-delegation)

本モジュールは`POST /v1/live/sessions`を使用します。WebRTCでは`session.start`や音声のBase64イベントを送信しません。

## 独自の認証・設定サービスを接続する

`apiKey`、`broker`、`signaling`は一つだけ指定します。`signaling.createSession({sdp, canStart, starting})`は認証と設定取得を行い、作成要求直前に`canStart()`を確認して`starting()`を呼びます。返り値は作成APIのResponseです。取得した関数定義は、作成前に`conversation.setTools(tools)`で登録できます。`acceptSession(result)`は終了用資格情報を保存し、`hangup({sessionId})`は対象セッションを終了します。通常終了時にもhangupを呼び、アプリ側の予約を解放します。

このアダプターにTenant、端末認証、スキルの取得を置きます。音声PCMやOpusをアダプターへ渡す必要はありません。作成の結果が不明な通信失敗を、新規の有料セッションとして自動再試行しないでください。

## CoreS3の音声経路

`esp32/m5stackchan_cores3`ではAW88298の再生周波数をホスト側で48 kHzへ設定し、Wi-FiのIP取得と時刻設定を終えてから開始します。I2S、Opus、RTP、再生補充はネイティブタスクで処理します。会話制御を専用Workerへ置く場合、メインへ送るのは字幕や間引いたレベル通知だけです。

CoreS3は初期版では半二重です。受信PCMに発話レベルの出力がある間はマイクをローカルで閉じ、受信した静音PCMが500 ms続くと解除します。アプリ側からAPIのmuteも併用できます。RTP未着・アンダーランは静音と判定しません。Tab5のAEC経路は維持します。

`stats.underruns`は出力発話中の連続した不足を一回として数え、`silenceMs`と`maxSilenceMs`は不足による無音時間を表します。正常なセッション終了と、音質・実際に聞き取れたかの評価は別に行います。

録音処理の拡張にはCの`liveAudioTransformCapture(samples, count)`を使える。16 kHz・mono PCM16の入力をOpusへ渡す直前に呼ばれ、既定は何もしない。アプリは同名のstrong symbolでDSPや試験音源を実装できる。処理はネイティブの録音タスクで動くため、ブロックやJavaScript呼び出しは禁止。ミュート中とCoreS3の再生ゲートが閉じている間は変換を呼ばず、無音を送る。

ネイティブ側はJavaScriptからのイベント読み取りを監視する。10秒途絶えた場合は`session.close`を送信して通信・音声資源を解放し、`event_loop_watchdog`を報告する。JavaScriptの停止やWorker通知の詰まりでも有料接続を放置しないための監視であり、`session.closed`を受信したことにはしない。デバッガで10秒以上停止した場合にも作動する。

無料の切り分けには低水準の`Transport.start({captureOnly:true})`を使える。実際の入力・Opus符号化を動かし、パケットを読み捨てて`encodedFrames`と`encodedPts`を記録する。SDP仲介やOpenAI接続は行わない。通常の会話APIでは使わない。
