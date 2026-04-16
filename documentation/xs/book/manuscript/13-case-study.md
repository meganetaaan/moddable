# 第12章 小さな実践例

## 12.1 題材

ここでは、温湿度センサーの値を定期的に収集し、しきい値を超えたらネットワーク経由で送信する小さなテレメトリアプリを題材にします。狙いは機能の多さではなく、`xs` 向きの設計がどこに現れるかを通しで見ることです。

要件は次の通りです。

- 起動後すぐに画面またはログへ現在状態を表示したいです
- センサー読み取りは周期的です
- 送信先は Wi-Fi 経由です
- 静的な変換表やしきい値は ROM に置きたいです
- 実機依存処理と pure logic を分けたいです

## 12.2 ファイル構成

```text
telemetry/
  manifest.json
  main.js
  sensor.js
  telemetry.js
  thresholds.js
```

役割分担は次の通りです。

| ファイル | 役割 |
| --- | --- |
| `thresholds.js` | しきい値やラベルなどの固定データ |
| `sensor.js` | 生データを正規化する pure logic |
| `telemetry.js` | 送信 payload を作る pure logic |
| `main.js` | 実機依存の起動、タイマ、ネットワーク呼び出し |
| `manifest.json` | preload、strip、creation の設計 |

## 12.3 manifest

まず manifest から見ます。

```json
{
  "include": [
    "$(MODDABLE)/examples/manifest_base.json",
    "$(MODDABLE)/examples/manifest_net.json"
  ],
  "creation": {
    "static": 32768,
    "chunk": {
      "initial": 1536,
      "incremental": 512
    },
    "heap": {
      "initial": 512,
      "incremental": 64
    },
    "stack": 256,
    "keys": {
      "initial": 48,
      "incremental": 0,
      "name": 53,
      "symbol": 3
    },
    "main": "main"
  },
  "preload": [
    "setup/network",
    "thresholds",
    "sensor",
    "telemetry"
  ],
  "strip": [
    "*",
    "eval",
    "Function"
  ],
  "modules": {
    "*": [
      "./main",
      "./sensor",
      "./telemetry",
      "./thresholds"
    ]
  }
}
```

ここでの意図は明確です。

- pure modules を preload します
- `eval` と `Function` を禁止して runtime parser を外しやすくします
- keys は runtime で増えすぎない前提を置きます
- `main` は実機依存部分だけに寄せます

## 12.4 `thresholds.js`

固定データは preload と freeze の典型例です。

```js
const thresholds = {
  temperature: Object.freeze({
    warn: 30,
    danger: 35
  }),
  humidity: Object.freeze({
    warn: 70,
    danger: 80
  })
};

export default Object.freeze(thresholds, true);
```

この module は pure で、build time 実行に向いています。実行中に変わらないので alias も不要です。

## 12.5 `sensor.js`

センサー読み取り自体は native 側 API を叩くとしても、値の正規化や段階判定は pure logic にできます。

```js
import thresholds from "thresholds";

function classify(value, limit) {
  if (value >= limit.danger)
    return "danger";
  if (value >= limit.warn)
    return "warn";
  return "normal";
}

export function normalizeSample(raw) {
  const temperature = Math.round(raw.temperature * 10) / 10;
  const humidity = Math.round(raw.humidity);
  return Object.freeze({
    temperature,
    humidity,
    temperatureState: classify(temperature, thresholds.temperature),
    humidityState: classify(humidity, thresholds.humidity)
  });
}
```

この module は pure です。native sensor API をここへ入れていないのがポイントです。

## 12.6 `telemetry.js`

payload 生成も pure logic に寄せます。

```js
export function makeTelemetryPayload(sample, now = Date.now()) {
  return Object.freeze({
    ts: now,
    temperature: sample.temperature,
    humidity: sample.humidity,
    state: sample.temperatureState === "danger" || sample.humidityState === "danger"
      ? "alert"
      : "ok"
  });
}
```

この形にしておくと、テストしやすく、preload 可能で、main は wiring に集中できます。

## 12.7 `main.js`

実機依存の処理はここへ寄せます。

```js
import Timer from "timer";
import { normalizeSample } from "sensor";
import { makeTelemetryPayload } from "telemetry";

function readRawSensor() {
  return {
    temperature: globalThis.sensor.readTemperature(),
    humidity: globalThis.sensor.readHumidity()
  };
}

function send(payload) {
  globalThis.telemetryClient.post(JSON.stringify(payload));
}

export default function () {
  Timer.repeat(() => {
    const sample = normalizeSample(readRawSensor());
    const payload = makeTelemetryPayload(sample);
    trace(`sample=${JSON.stringify(sample)}\n`);
    send(payload);
  }, 5000);
}
```

本来、`JSON.stringify` の chunk コストは気になります。運用では、ここをより小さな専用エンコーダへ置き換える価値があります。ただし構造を先に pure / impure へ分けておくと、差し替えやすくなります。

## 12.8 この形が `xs` 向きである理由

この例が `xs` 向きなのは、次の理由からです。

- fixed data が `thresholds.js` に閉じており、preload / freeze しやすいです
- `sensor.js` と `telemetry.js` は pure module で、ROM に寄せやすいです
- `main.js` は実機依存 API とタイマだけを担当します
- runtime に増える key を抑えやすいです
- 後から C 実装や Worker 化を検討するときも境界が明確です

## 12.9 改善ポイントの見つけ方

この例を実機へ載せたら、次を xsbug で見ます。

| 観測項目 | 何を確認するか |
| --- | --- |
| Modules pane | `thresholds`、`sensor`、`telemetry` が preload 済みか |
| Slot Heap Used | sample / payload 生成後に戻るか |
| Chunk Heap Used | `JSON.stringify` のピークが高すぎないか |
| Keys Used | 送信のたびに増え続けないか |
| Stack Used | Timer callback 内の処理が浅いか |

## 12.10 改善案

問題が出たときの改善案は次の通りです。

| 症状 | 改善案 |
| --- | --- |
| Chunk peak が高い | JSON 生成を streaming 化する、固定フォーマットにする |
| Slot が戻らない | payload をキャッシュし過ぎていないか見る |
| 起動が遅い | `main` の top-level を減らし、preload 面積を増やす |
| ネットワーク待ちで main が詰まる | Worker の導入を検討する |
| しきい値更新が必要 | mutable config を別 module / storage に切り出す |

## 12.11 Worker 化を検討する場面

送信処理が重く、main の UI やセンサー応答を阻害するなら、送信系だけ Worker へ逃がす選択肢があります。ただし最初からそうするべきではありません。

理由は単純です。

- 別 machine の RAM コストが発生します
- `postMessage` によるコピーコストが増えます
- setup が自動で走らないため、環境差分を意識する必要があります

まずは pure logic の整理、preload、string / buffer 削減で足りるかを見ます。

## 12.12 実測 TODO

<div class="todo">
このケーススタディには、次の実測を次版で差し込みます。<br><br>
・simulator と実機での起動時間比較<br>
・preload 前後の Slot/Chunk/Keys 差分<br>
・JSON 生成を streaming 化したときの chunk peak 比較
</div>

## 12.13 この章のまとめ

1. `xs` 向きの設計は、pure / impure の分離から始まります
2. manifest はケーススタディの中心であり、単なる付属品ではありません
3. preload と freeze を前提に module を切ると、後の改善余地が大きくなります
4. 実測は最後に必要ですが、構造設計だけでもかなり多くの問題を防げます

次章では、この実践を踏まえて、そもそも `xs` を選ぶべき状況と避けるべき状況を整理します。
