# ChatAudioAI - 音声対話AIシステム詳細解説

## 概要

ChatAudioAIは、Moddable SDKで実装されたリアルタイム音声対話AIシステムです。複数のAIサービス（OpenAI、Google Gemini、Hume AI、Eleven Labs）と統合し、マイクロコントローラー上で音声によるAI対話を実現します。このシステムは「Conversational AI」アプリケーションとして実装されており、効率的なメモリ使用と音声ストリーミングが特徴です。

## システムアーキテクチャ

### 基本構成

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  メインアプリ      │◄──►│  ChatAudioIO     │◄──►│  Workerプロセス   │
│  (UI + Audio)   │    │  (調整レイヤー)     │    │  (AI Service)   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
        ▲                        ▲                        ▲
        │                        │                        │
   ┌─────▼─────┐         ┌──────▼──────┐         ┌──────▼──────┐
   │ AudioIn/  │         │ SharedArray │         │ WebSocket   │
   │ AudioOut  │         │ Buffer      │         │ + JSON解析  │
   └───────────┘         └─────────────┘         └─────────────┘
```

### 主要コンポーネント

1. **ChatAudioIO クラス** (`/modules/network/services/chatAudioIO/ChatAudioIO.js`)
   - メインアプリとWorkerプロセス間の調整役
   - 音声入出力の管理
   - 状態管理とイベント配信

2. **Worker プロセス**
   - 各AIサービス用の専用Worker
   - WebSocket通信とJSON解析
   - 音声エンコーディング/デコーディング

3. **Conversational AI アプリケーション** (`/contributed/conversationalAI/`)
   - Piuフレームワークベースのユーザーインターフェース
   - AI Persona設定とサービス切り替え
   - リアルタイム音声可視化

## 内部処理詳細

### 1. ChatAudioIO クラス

#### 状態管理

```javascript
static FAILED = -1;
static DISCONNECTED = 0;
static DISCONNECTING = 1;
static CONNECTING = 2;
static CONNECTED = 3;
static SPEAKING = 4;     // ユーザー発話中（音声送信）
static LISTENING = 5;    // AI応答中（音声受信）
static WAITING = 6;      // 音声出力待機
```

#### 音声バッファ管理

```javascript
// 入力バッファ（マイクからの音声）
this.inputBuffer = new SharedArrayBuffer(512 * 1024);
this.inputSampleRate = 24000;

// 出力バッファ（AIからの音声）
this.outputBuffer = new SharedArrayBuffer(512 * 1024);
this.outputSampleRate = 24000;

// アトミック操作用バリア
this.barrier = new Int32Array(new SharedArrayBuffer(4));
```

#### 音声レベル計算（C実装）

```c
// ChatAudioIO.c:26-44
void xs_computeLevel(xsMachine *the) {
    uint8_t* buffer;
    xsUnsignedValue size, i;
    int16_t* samples;
    double average = 0.0;
    int32_t result;

    // 16ビットPCMサンプルの平均振幅を計算
    _xsmcGetBuffer(the, &(xsArg(0)), (void**)&buffer, &size, 0);
    size >>= 1;
    samples = (int16_t*)buffer;
    for (i = 0; i < size; i++) {
        int16_t sample = samples[i];
        if (sample < 0) sample = -sample;
        average += sample;
    }
    result = round(average / size);
    xsResult = xsInteger(result);
}
```

### 2. Worker通信システム

#### メッセージフロー

```javascript
// アプリ → Worker
{
    id: "configure",
    instructions: "あなたは親切なAIアシスタントです",
    functions: [...],
    voiceName: "nova"
}

// Worker → アプリ
{
    id: "connected"
}

// 音声送信
{
    id: "sendAudio",
    offset: 1024,
    size: 1024
}

// 音声受信
{
    id: "receiveAudio", 
    offset: 2048,
    size: 1024
}
```

#### Worker実装の例（OpenAI Realtime）

```javascript
class OpenAIRealTimeModel extends ChatWebSocketWorker {
    constructor(options) {
        super(options);
        this.host = "api.openai.com";
        this.path = `/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01`;
        this.headers = [
            ["OpenAI-Beta", "realtime=v1"],
            ["Authorization", `Bearer ${config.openAIKey}`]
        ];
    }
    
    // 音声データのエンコーディング（A-law形式）
    sendAudio(message) {
        const buffer = new Uint8Array(this.inputBuffer, message.offset, message.size);
        Encode.toAlaw(buffer, buffer);  // 16bit PCM → A-law 圧縮
        message.size >>= 1; 
        return super.sendAudio(message);
    }
}
```

### 3. 効率的なJSON + Base64パーサー

#### JSONBase64Parser の仕組み

従来のアプローチの問題点：
- Base64音声データが複数回メモリにコピーされる
- 完全なペイロードを待つ必要がある
- メモリ使用量が膨大になる

JSONBase64Parserの解決策：
```javascript
class JSONBase64Parser {
    constructor(target, buffer, alignment) {
        this.target = target;
        this.buffer = buffer;     // SharedArrayBuffer
        this.alignment = alignment; // 16bit音声の場合は2
    }
    
    // ストリーミング解析
    read(packet) {
        // パケットごとにJSONを解析
        // Base64文字列を直接バイナリに変換
        // SharedArrayBufferに循環書き込み
    }
    
    // Base64判定コールバック
    isBase64(result, object, name) {
        return (result?.type == "response.audio.delta") && (name == "delta");
    }
}
```

### 4. 音声処理フロー

#### 入力処理（マイク → AI）

```javascript
// AudioIn設定
this.input = new AudioIn({
    sampleRate: this.inputSampleRate,
    onReadable: (size) => {
        if (!this.microphone) return;
        
        // 循環バッファに書き込み
        const samples = new Uint8Array(this.inputBuffer, this.inputBufferOffset, size);
        this.input.read(samples);
        
        // 音声レベル計算
        const level = computeLevel(samples);
        this.onInputLevelChanged(level);
        
        // SPEAKING状態の場合、Workerに送信
        if (this.state == ChatAudioIO.SPEAKING) {
            this.worker.postMessage({ 
                id:"sendAudio", 
                offset:this.inputBufferOffset, 
                size 
            });
        }
        
        this.inputBufferOffset += size;
    },
});
```

#### 出力処理（AI → スピーカー）

```javascript
// AudioOut設定
this.output = new AudioOut({
    sampleRate: this.outputSampleRate,
    onWritable: (size) => {
        let start = this.outputBufferTail;
        let stop = this.outputBufferHead;
        
        // 循環バッファから読み取り
        if (stop < start) {
            // バッファ終端まで再生
            let delta = this.outputBufferSize - start;
            if (delta > size) delta = size;
            
            const samples = new Uint8Array(this.outputBuffer, start, delta);
            const level = computeLevel(samples);
            this.output.write(samples);
            
            start += delta;
            size -= delta;
            if (start == this.outputBufferSize) start = 0;
        }
        
        // 通常の読み取り
        if ((start < stop) && (size > 0)) {
            let delta = stop - start;
            if (delta > size) delta = size;
            
            const samples = new Uint8Array(this.outputBuffer, start, delta);
            this.output.write(samples);
            start += delta;
        }
        
        // アトミック操作でWorkerに進捗通知
        this.outputBufferTail = start;
        Atomics.store(this.barrier, 0, start);
        Atomics.notify(this.barrier, 0);
        
        // 再生完了時の状態遷移
        if ((start == stop) && (this.state == ChatAudioIO.WAITING)) {
            this.worker.postMessage({ id:"listened" });
            this.state = ChatAudioIO.SPEAKING;
            this.ensureInput();
        }
    },
});
```

### 5. AIサービス統合

#### 対応サービス

1. **OpenAI Realtime API**
   - GPT-4o Realtime Preview
   - A-law音声エンコーディング
   - Server VAD（音声活動検出）

2. **Google Gemini Live**
   - Multimodal Live API
   - リアルタイム会話

3. **Hume AI EVI**
   - Empathic Voice Interface
   - 感情認識機能

4. **Eleven Labs Conversational AI**
   - 音声クローニング
   - 高品質音声合成

#### 設定例（model.json）

```json
[
    {
        "title": "Embedded Software Dev",
        "subtitle": "Moddable Developer", 
        "instructions": "あなたは組み込みソフトウェアエンジニア向けのアシスタントです...",
        "service": "openai",
        "voiceName": "sage"
    },
    {
        "title": "Masterful Raconteur",
        "subtitle": "Traditional bard",
        "instructions": "あなたは物語の語り手です...",
        "service": "gemini", 
        "voiceName": "aoede"
    }
]
```

### 6. UIフレームワーク連携

#### Piuアーキテクチャ

```javascript
// main.js - アプリケーション初期化
export default function() {
    globalThis.controller = new Controller;
    globalThis.application = new Application(
        { model }, 
        {
            commandListLength: 6000,
            displayListLength: 10000,
            touchCount: 1,
            behavior: controller
        }
    );
}

// Controller.js - 画面遷移管理
class Controller extends Behavior {
    display(container, view, backwards) {
        if (this.view) {
            if (backwards)
                this.view.runTransitionBackwards(view);
            else {
                if (this.view.historical)
                    this.history.push(this.view);
                view.runTransitionForwards(this.view);
            }
        }
        this.view = view;
    }
}
```

#### Home画面の実装

```javascript
// views/Home.js
class HomeBehavior extends View.Behavior {
    onCreate(container, view) {
        super.onCreate(container, view);
        
        // ChatAudioIO初期化
        this.chat = new ChatAudioIO({
            specifier: view.specifier,
            instructions: view.instructions,
            voiceName: view.voiceName,
            onStateChanged: (state) => {
                this.onStateChanged(container, state);
            },
            onInputLevelChanged: level => {
                container.distribute("onInputLevelChanged", level);
                if (this.silence && level > 1000) {
                    this.view.SPEAKING.start();
                }
            },
            onOutputLevelChanged: level => {
                container.distribute("onOutputLevelChanged", level);
            },
            onInputTranscript: (text, more) => {
                this.onInputTranscript(container, text, more);
            },
            onOutputTranscript: (text, more) => {
                this.onOutputTranscript(container, text, more);
            },
        });
    }
}
```

### 7. メモリ効率化の工夫

#### SharedArrayBuffer活用

```javascript
// 音声バッファをプロセス間で共有
this.inputBuffer = new SharedArrayBuffer(512 * 1024);
this.outputBuffer = new SharedArrayBuffer(512 * 1024);

// アトミック操作でのバリア同期
this.barrier = new Int32Array(new SharedArrayBuffer(4));
Atomics.store(this.barrier, 0, position);
Atomics.notify(this.barrier, 0);
```

#### 循環バッファ方式

```javascript
// 入力バッファの循環利用
let delta = this.inputBufferSize - this.inputBufferOffset;
if (delta < size) {
    this.inputBufferOffset = 0;  // バッファ先頭に戻る
    delta = this.inputBufferSize;
}
```

#### ストリーミング音声処理

- パケット単位での音声処理
- Base64の直接デコード
- フレームバッファの排除
- リアルタイム再生

### 8. 状態遷移図

```
DISCONNECTED ──connect()──► CONNECTING ──connected()──► CONNECTED
     ▲                                                       │
     │                                                       │
     └──disconnected()◄── DISCONNECTING ◄──disconnect()──   │
                                                             │
                                                             ▼
    ┌─── WAITING ◄──speak()◄── LISTENING ◄──listen()──── SPEAKING
    │      │                                                 ▲
    │      │                                                 │
    └──────┴──listened()─────────────────────────────────────┘
```

### 9. エラーハンドリング

```javascript
// 接続エラー
failed(message) {
    this.error = message.string;
    this.state = ChatAudioIO.FAILED;
    this.ensureInput();
    this.onStateChanged(this.state);
}

// ネットワークエラー
onError: () => {
    this.postMessage({ id:"failed", string:"network error" });
    this.close();
}

// WebSocketクローズ
onClose: () => {
    const code = (data[0] << 8) | data[1];
    const reason = String.fromArrayBuffer(data.buffer.slice(2));
    if (code != 1000)
        this.postMessage({ id:"failed", string:reason });
    else
        this.postMessage({ id:"disconnected" });
}
```

## まとめ

ChatAudioAIは、組み込みマイクロコントローラーでの音声AI対話を実現する高度なシステムです。主な特徴：

- **効率的なメモリ使用**: SharedArrayBufferと循環バッファ
- **リアルタイム処理**: ストリーミング音声とJSONパーサー
- **モジュラー設計**: Worker分離とサービス抽象化
- **豊富なAI対応**: 4つの主要AIサービス統合
- **モバイル風UI**: Piuフレームワークの活用

このアーキテクチャにより、限られたリソースでありながら高品質な音声AI体験を提供しています。