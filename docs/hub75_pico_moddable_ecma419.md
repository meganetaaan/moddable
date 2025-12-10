# HUB75モジュール設計（RP2040 + Moddable ECMA-419）

## 概要
- RP2040_LEDARTボードと64×32ドットのHUB75 RGB LEDマトリクスをModdable SDKから直接駆動するための設計メモです。
- HUB75特有の多信号・多ビットプレーン制御を、ECMA-419準拠の`device.io.Digital` APIで実装する際の注意点とループ設計をまとめます。
- 本文のピンアサインとタイミングは`reference/hub75.py`（MicroPython版サンプル）をベースにRP2040_LEDARTの実配線へ合わせています。

## 1. HUB75プロトコルの制御方法
- HUB75は1/8または1/16デューティで上下2系統（上段RGB: R1/G1/B1, 下段RGB: R2/G2/B2）のデータラインと、行選択用アドレスバス（A～D）、`CLK`、`LAT`（Latch）、`OE`（Output Enable）で構成されます。
- 1フレームは「1行分のビットプレーンを順次シフト → ラッチ → 発光 → 次行へ移動」を複数ビット深度分だけ繰り返すことで表現します。
- 典型的なシーケンス（1ビットプレーン・1行）
  1. `OE`をHighで消灯し、`LAT`をLowに戻す。
  2. 上下2行ぶんのピクセルデータをR1/G1/B1/R2/G2/B2へ順にクロック同期でシフト出力 (`CLK`立ち上がりごとに新データ) する。
  3. 行アドレスA～Dを次に表示したい行番号へセットする。
  4. `LAT`をHigh→Lowとトグルしてシフトレジスタの内容を表示レジスタへ転送する。
  5. `OE`をLowへ落として所定の点灯時間だけ保持（ビットプレーンのウェイトに応じて短～長時間）。
  6. 次のビットプレーンまたは次の行へ進む。
- 高ビット深度表示では、ビットプレーンごとに`OE`のLow期間を2^nスケールで調整する簡易PWM（Binary Code Modulation）を用います。タイマ割り込みまたは正確な遅延制御が必要です。

## 2. Moddable ECMA-419 Digitalによる制御ループ
- Moddableでは`device.io.Digital`が単一ピン入出力、`device.io.DigitalBank`が複数ピン一括制御を提供し、どちらもECMA-419のI/O抽象化に準拠しています。
- HUB75のように6本のデータ線を同時駆動する場合、以下の方針で実装すると配線数を抑えつつループ性能を確保できます。

### 2.1 初期化
```javascript
const {Digital, DigitalBank} = device.io;

const data = new DigitalBank({
  pins: [ /* R1,G1,B1,R2,G2,B2 */ 0, 1, 2, 3, 4, 5 ],
  mode: DigitalBank.Output,
});
const addr = new DigitalBank({
  pins: [ /* A,B,C,D */ 6, 7, 8, 9 ],
  mode: DigitalBank.Output,
});
const clk = new Digital({ pin: 11, mode: Digital.Output });
const lat = new Digital({ pin: 12, mode: Digital.Output });
const oe  = new Digital({ pin: 13, mode: Digital.Output });
```
- `DigitalBank`は`write(value)`に32bitマスクを受け取り、一度に複数ピンを書き換えられます。`pins`配列の順序はビット0→nに対応するため、RGBピンとビット配置を揃えておくとループ中のマスク計算が単純化します。

### 2.2 スキャンループ
- メインループは`Timer.repeat`や`mod.Timer`（Moddable RuntimeのタイマAPI）で行単位の更新を呼び出し、ループ内部でビットプレーンを細分化します。
- 1ビットプレーン書き込みの擬似コード：
```javascript
function pushRow(rowIndex, plane) {
  // 1. 消灯しラッチ解除
  oe.write(1);
  lat.write(0);

  // 2. ピクセルデータのシフト出力
  const rowBufferTop = frameBuffer[plane][rowIndex];
  const rowBufferBottom = frameBuffer[plane][rowIndex + panelHeight];
  for (let column = 0; column < panelWidth; column++) {
    const bits =
      ((rowBufferTop[column] >> plane) & 0x01) |
      (((rowBufferTop[column] >> plane) & 0x01) << 1) |
      // ... R2/G2/B2分のビット合成
      (((rowBufferBottom[column] >> plane) & 0x01) << 5);
    data.write(bits);
    clk.write(1);
    clk.write(0);
  }

  // 3. 行選択とラッチ
  addr.write(rowIndex & 0x0F);
  lat.write(1);
  lat.write(0);

  // 4. 発光（プレーン重みで遅延）
  oe.write(0);
  Timer.delayMicroseconds(basePulse << plane);
  oe.write(1);
}
```
- 実装では`bits`計算を事前にルックアップテーブル化し、`clk`トグルは`write(~CLK_STATE)`のようにビット反転だけで済ませると更に高速です。
- フレーム全体は、最下位ビットから最上位ビットまで`pushRow`を繰り返し呼び出すことでPWM階調を再現します。`System.setInterval`で最終リフレッシュを制御し、オーバーランしないよう`Timer.delayMicroseconds`やRP2040のPIO/Tickを活用します。

### 2.3 バッファ管理
- 表示用と描画用の二重バッファ（`Uint16Array`や`ArrayBuffer`）を用意し、スキャンループは読み取り専用に保ちます。
- 描画完了後にポインタを入れ替えるだけでフリッカのない更新が可能です。Moddableの`Worker`や`Stream` APIで描画処理を分離するとCPUリソースを平準化できます。

### 2.4 リフレッシュレートの目安
- 64×32パネルを1/16デューティ・5ビットプレーンで駆動する場合、**フレームリフレッシュは最低でも180〜200 Hz**を確保すると肉眼でのフリッカをほぼ感じなくなり、カメラ撮影時のバンドも軽減できます。
- 200 Hzフレームを維持するには、16行×5プレーン×2（上下2行同時）=160ステップを5 ms以内にこなす必要があるため、プレーン0の発光時間（`basePulse`）はおおむね8〜10 µsが上限となります。`Timer.delayMicroseconds`だけで間に合わない場合はPIOやCネイティブ拡張でクロック生成を肩代わりしてループの実行時間を短縮してください。
- PWM階調を増やす（ビットプレーンを増やす）場合やパネルをデイジーチェーンする場合は比例してループ時間が伸びるので、ターゲットのフレームレート目標から逆算して`basePulse`やプレーン数を調整します。

## 3. RP2040_LEDARTボードのピンアサイン
- MicroPythonサンプル（`reference/hub75.py`）と同じ配線をModdable実装でも利用します。`device.pin`マップには下表の名前を設定してください。

| 信号 | HUB75ラベル | RP2040 GPIO | 備考 |
|------|-------------|-------------|------|
| R1   | R1          | GP0         | 上段赤データ |
| G1   | G1          | GP1         | 上段緑データ |
| B1   | B1          | GP2         | 上段青データ |
| R2   | R2          | GP3         | 下段赤データ |
| G2   | G2          | GP4         | 下段緑データ |
| B2   | B2          | GP5         | 下段青データ |
| A    | 行アドレス0 | GP6         | | 
| B    | 行アドレス1 | GP7         | |
| C    | 行アドレス2 | GP8         | |
| D    | 行アドレス3 | GP9         | 32行パネルで使用 |
| CLK  | CLK         | GP11        | シフトクロック |
| LAT  | LAT         | GP12        | ラッチ信号 |
| OE   | OE          | GP13        | Active Low |
| VCC  | 5V          | 5V          | パネル電源（外部） |
| GND  | GND         | GND         | 電源/信号共通基準 |

- `GP10`は未使用ですが、将来の拡張用に確保しておくと便利です。
- Moddableのビルドシステムでは、マニフェストに直接`pins`属性を書くのではなく、ターゲットボード定義（providerパターン）から`device.io`と`device.pin`を公開するのが一般的です。

### 3.1 ターゲットボード定義の追加
- `build/devices/pico/targets`配下に`pico_ledart`ディレクトリを作成し、下記のようにファイルを配置します。

```
build/devices/pico/targets/pico_ledart/
 ├─ manifest.json
 └─ host/provider.js
```

- `manifest.json`では既存ターゲットと同様に必要なドライバマニフェストを`include`し、`preload`でproviderをロードします。

```json
{
  "include": [
    "$(MODDABLE)/modules/io/manifest.json"
  ],
  "modules": {
    "host/provider": "./host/provider"
  },
  "preload": "host/provider"
}
```

### 3.2 providerでのピン定義例
- `host/provider.js`には、HUB75で使用するGPIOを`device.pin`としてエクスポートし、`device.io`で`Digital`/`DigitalBank`を公開します。既存ターゲット（例：`ws_round`）と同じスタイルで記述できます。

```javascript
import Digital from "embedded:io/digital";
import DigitalBank from "embedded:io/digitalbank";

const device = {
  io: { Digital, DigitalBank },
  pin: {
    hub75: {
      data: [0, 1, 2, 3, 4, 5],
      addr: [6, 7, 8, 9],
      clk: 11,
      lat: 12,
      oe: 13
    }
  }
};

export default device;
```
- アプリケーション側では`device.pin.hub75`から配列を参照し、`DigitalBank`初期化時に利用します。必要に応じて`setup-target.js`を追加し、電源投入時のOEやバックライト制御を行ってください。

## 4. 実装例と移植ポイント
- MicroPython版（`reference/hub75.py`）では`rgbmatrix.RGBMatrix`がPIOでシフト出力を担当し、行切り替え・PWMもライブラリ内に隠蔽されています。
- Moddable移植では同等の処理をアプリ側で実装する必要があるため、以下のポイントに注意してください。
  - データ整形：描画テキストや図形は`displayList`や自前のキャンバスで組み立て、ビットプレーン配列へ変換する。
  - タイミング：`OE`制御を最優先にし、JavaScript処理が遅延するとフリッカが発生するため、必要に応じてネイティブモジュール（xsnapやCアドオン）で高速化する。
  - 電源：5V供給と大電流に備え、`OE`をHigh（消灯）にしてから配線作業を行う。

### 4.1 最小コードスケッチ
```javascript
import Timer from "timer";
const {Digital, DigitalBank} = device.io;

// 初期化（2.1と同様）
// ...

const basePulse = 8;  // µs（5プレーン・約200 Hzを狙う場合の目安）
const planes = 5;     // 5bit

Timer.repeat(() => {
  for (let plane = 0; plane < planes; plane++) {
    for (let row = 0; row < 16; row++) {
      pushRow(row, plane);
    }
  }
}, 0);
```
- `pushRow`は前述の関数を利用します。RP2040のPIOを併用する場合は、ModdableのCモジュールからPIOステートマシンを設定し、JavaScript側ではプレーン切り替えのみ担う構成も可能です。

---
本設計書をベースに、Moddable環境向けのHUB75ドライバを実装し、MicroPython版からの移植作業を進めてください。

## 5. ネイティブドライバ拡張計画（PIO + DMA）
- JavaScriptのみでの制御はピーク約6×16ループ/秒程度で頭打ちになり、64×32パネルではフリッカが残ります。そのため、RP2040固有のPIOおよびDMAを利用したネイティブドライバを併設する方針です。

### 5.1 モジュール構成
- `modules/io/hub75/pico/`
  - `manifest.json`: Picoターゲットでネイティブドライバを有効化。
  - `hub75.c` / `hub75.js`: C本体とJavaScriptグルーコードは同名ファイルとして配置（Moddableのロード規則）。
    - `hub75.c` がPIO / DMA初期化およびXS API公開を担当。
    - `hub75.js` は`embedded:io/hub75/pico`で`require`されるラッパーとなり、C側エクスポートをそのまま返すシンプルな実装（他モジュールの`pwm.c`＋`pwm.js`と同様）。
  - `hub75.pio`: PIOアセンブリ。6本のRGBデータ線＋CLKを`out pins, 7`で一括シフトし、LAT/OE制御を別ステートマシンで処理します。
  - `hub75_dma.c/.h`: DMAチャネル設定とIRQハンドラ。ビットプレーンごとのデータストリームとOEパルス幅更新を連携させます。
  - （任意）`README.md`: PIOピンマップと使用方法のメモ。
- JavaScriptグルーコードはCモジュールと同名（`hub75.js`）で`embedded:io/hub75/pico`としてexportし、必要に応じて追加の高レベルAPIを`modules/io/hub75/controller.js`などに記述します。
- `manifest.json`の`modules`セクションでは他モジュール同様、`"embedded:io/hub75/pico" : "./hub75"`の形式で同名ファイルをインポートします。
- 既存試験用アプリをベースに`examples/drivers/hub75/pico_ledart_native/`を追加し、ネイティブドライバ経由で描画するサンプルを用意します。

### 5.2 PIO + DMA 戦略
- **SM0**: RGBデータ6本＋CLKを直列シフト。DMAからのビットプレーンバッファを連続ストリームで処理。
- **SM1**: LAT/OE制御専用。LATトグルとOEパルス長をPIO内で生成し、DMAから受け取るパラメータでビットウェイトを切替。
- DMAチャネル0がSM0へビットプレーンを供給し、チャネル1がOEパルス幅（プレーンごとのオン時間）を更新。チェーンモードで互いに再始動させ、CPU介入を最小化します。
- PIOまたはDMAのIRQで1プレーン完了を通知し、C側で行アドレス更新および次プレーン移行を行います。

### 5.3 バッファおよびデータ形式
- SRAM上に二重バッファを確保。構造は`uint16_t planes[planeCount][rows][columns]`相当のフラット配列とし、各要素にRGB6bit＋CLK Highの7ビットを配置します。
- JavaScript側でビットプレーンを作る場合は、既存の配列生成ロジックをそのまま流用し、`ArrayBuffer`としてネイティブ層へ引き渡す形が可能です。
- C側でバッファメタデータ（行数・列数・プレーン数・パルス幅）を構造体に保持し、DMA再設定時に参照します。

### 5.4 XS API デザイン
- `new Hub75Controller(options)`：
  - `options.pin`: `data[]`, `clk`, `lat`, `oe`, `addr[]` を含むピン配置。
  - `options.size`: `{width, height, colorDepth, scanLines}`。provider既定値をデフォルトにします。
  - `options.planeDurations`: PWM重みのマイクロ秒配列。
- メソッド案：
  - `configure(bitplanes, rows, width)`: バッファフォーマットを再設定。
  - `start(buffer)`: DMAループを起動し、受け取った`ArrayBuffer`を表示。
  - `swapBuffers(buffer)`: フレーム境界で表示バッファを切替。
  - `stop()`: DMA/PIO停止、OE High。
  - `setPlaneDurations(array)`: 動的な輝度カーブ変更。
- 追加で`onFrameDone`コールバックや`frameCount`ゲッターを用意し、描画状態をモニタできるようにします。

### 5.5 C実装ポイント
- PWMモジュール等の既存コード（`modules/io/pwm/pico/_pwm.c`など）を参考にXSホストモジュールの構造体・デストラクタを整備。
- PIOプログラム読み込み・ステートマシン起動・DMAチャネル割り当てを初期化フェーズで実施。
- `Hub75Record`構造体に以下を保持：
  - `xsSlot self`/`callback`（JSとの連携用）。
  - PIO SM番号やプログラムオフセット。
  - DMAチャネルID、制御ブロック、現在のバッファアドレス。
  - プレーンごとのOEパルス幅をPIOクロックカウントへ変換した配列。
- IRQハンドラから`modMessagePostToMachine`でJSコールバックを呼び出し、フレーム完了通知やバッファスワップ処理を行います。

### 5.6 プロバイダとアプリ側変更
- `build/devices/pico/targets/pico_ledart/host/provider.js`に`device.peripheral.Hub75`を追加し、事前定義したピンマップとタイミングをバンドル。
- `examples/drivers/hub75/pico_ledart_native`では、このネイティブドライバを使ってビットプレーン生成・ダブルバッファを実装し、`swapBuffers`で描画更新。

### 5.7 ドキュメンテーション・テスト
- 本ドキュメントにネイティブ構成の概要とAPIサンプルを掲載（本節）。
- `hub75.pio`にはステートマシン動作のコメントを追加し、PIN割り当てとクロック計算を明記。
- CLIテスト：`mcconfig -d -m -p pico/pico_ledart examples/drivers/hub75/pico_ledart_native`で動作確認し、`Time.microseconds`を用いたフレーム時間測定ユーティリティをサンプルに含めます。

上記の構成で、JavaScript側はビットプレーン生成と描画ロジックに専念でき、走査ループはPIO + DMAがリアルタイムで実行されるため、200 Hz以上のリフレッシュを狙うことが可能になります。
