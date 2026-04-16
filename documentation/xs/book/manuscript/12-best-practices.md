# 第11章 組み込み JavaScript の実践原則

ここまで読んできて、「結局どう書けばよいのか」と感じているかもしれません。その感覚は正しいです。`xs` は原理を理解しただけでは足りず、書き方へ落として初めて効いてきます。本章では、原理をそのままレビュー項目へ変換します。

## 11.1 preload できるものを増やす

悪い例から見ます。module top-level に実機依存処理を混ぜると、preload の面積が一気に減ります。

```js
import WiFi from "wifi";
import Sensor from "embedded:sensor/Temperature";

const wifi = new WiFi({ ssid: "..." });
const sensor = new Sensor();

export function read() {
  return sensor.sample();
}
```

この書き方は、一見すると分かりやすいです。ですが module を import した瞬間にネイティブな副作用が走るため、preload しづらくなります。

良い例は、純粋部分と実機依存部分を分けることです。

```js
export function normalizeSample(raw) {
  return {
    value: Math.round(raw.value * 10) / 10,
    state: raw.value > 30 ? "warn" : "ok"
  };
}

export default function start(sensor) {
  return function read() {
    return normalizeSample(sensor.sample());
  };
}
```

module 本体は純粋に保ち、実機依存の初期化は `main` や setup へ追い出します。

## 11.2 共有 object は freeze する

mutable な shared config は、alias と事故の温床になりがちです。

悪い例:

```js
export const config = {
  retry: 3,
  timeout: 5000
};
```

良い例:

```js
export const config = Object.freeze({
  retry: 3,
  timeout: 5000
});
```

ここは「気分の問題」ではありません。freeze できると alias 対象を減らしやすく、preload と ROM 化の利益も守りやすくなります。

## 11.3 動的 key を増やさない

ここは Web の感覚だと見落としやすいところです。外部入力や loop index をそのまま property 名にしていないでしょうか。`xs` では、それが key table の増加に直結します。

悪い例:

```js
function accumulate(samples) {
  const packet = {};
  for (let i = 0; i < samples.length; i++)
    packet[`sensor_${i}`] = samples[i];
  return packet;
}
```

良い例:

```js
function accumulate(samples) {
  return {
    values: samples
  };
}
```

あるいは、必要なら index を持つ array や typed array を使います。

## 11.4 実測: 動的プロパティ名と固定形状のオブジェクト

言葉だけではぴんと来ないので、小さな合成ベンチマークを取りました。Linux x86_64 上で `build/bin/lin/release/xst` を使い、500,000 回ループを回しています。

比較したコードは次の二つです。

悪い例:

```js
for (let i = 0; i < N; i++) {
  const packet = {};
  const key = `sensor_${i}`;
  packet[key] = i;
  total += packet[key];
}
```

良い例:

```js
for (let i = 0; i < N; i++) {
  const packet = { value: i };
  total += packet.value;
}
```

結果はこうなりました。

| 条件 | 1回目 | 2回目 | 3回目 | 平均 |
| --- | --- | --- | --- | --- |
| 動的プロパティ名 | 2.14 s | 2.17 s | 2.15 s | 2.15 s |
| 固定形状のオブジェクト | 0.06 s | 0.06 s | 0.06 s | 0.06 s |

差がかなり大きいので驚くかもしれません。もちろんこれは合成ベンチですし、実アプリそのものではありません。それでも「毎回新しい key を作る書き方は高くつく」という傾向を示すには十分です。

## 11.5 文字列と chunk を甘く見ない

大きな JSON や長い文字列連結は、chunk peak を押し上げます。

悪い例:

```js
let body = "";
for (const sample of samples)
  body += JSON.stringify(sample);
send(body);
```

良い例:

```js
for (const sample of samples)
  sendChunk(sample);
```

あるいは固定長に近いプロトコルへ変換し、逐次送ります。Web のようにメモリが後ろで吸収してくれる前提は置けません。

## 11.6 setup を太らせない

setup は便利です。便利すぎるぶん、何でも詰め込みたくなります。ですが setup が太ると、起動経路がそのまま太ります。

悪い例:

```js
export default async function (done) {
  await connectWiFi();
  await fetchRemoteConfig();
  await warmUpUIAssets();
  await startBackgroundTelemetry();
  done();
}
```

良い例:

```js
export default async function (done) {
  await connectWiFi();
  done();
}
```

残りは main や service 側へ分けます。setup は「起動に必須の環境準備」に絞る方が、あとで苦しくなりません。

## 11.7 Worker は最後に選ぶ

Worker は魅力的です。main を塞がずに済みそうに見えるからです。ですが、別 machine を増やすということは、RAM も複雑さも増えるということです。

まず疑う順番は次です。

1. preload 面積を増やせないか
2. freeze できる object が残っていないか
3. 動的プロパティ名や巨大 chunk を作っていないか
4. それでも main の応答性が守れないか

この順番を飛ばして Worker を入れると、たいてい後でつらくなります。

## 11.8 native 化は profiler の後

JavaScript が遅い、と感じる場面はあるでしょう。ただし、嘆かわしいことに、その勘が外れることも多いです。実際には algorithm より allocation が重い、あるいは I/O 待ちが支配的、ということが珍しくありません。

native 化の前に確認することは次の通りです。

- profiler でホットパスを見たか
- slot / chunk / keys のどれが悪化しているか見たか
- pure / impure の切り分けで解消できないか見たか

## 11.9 manifest をコードの一部として扱う

`creation`、`preload`、`strip`、`resources`、`defines` は、補助設定ではありません。レビュー対象そのものです。

悪い運用:

- manifest 変更を雑にまとめる
- 本文コードだけレビューする
- `dead strip` を build 事故として片付ける

良い運用:

- manifest 変更にも設計理由を書く
- preload / strip / creation の変更を本文コードと一緒に見る
- 実機計測とセットで評価する

## 11.10 レビュー用チェックリスト

| 項目 | 見る理由 |
| --- | --- |
| この module は preload 可能か | 起動時間と RAM に直結 |
| shared object は freeze 済みか | alias と mutable surface を減らす |
| runtime で新しい key を増やしていないか | 長時間運転の不安定化を防ぐ |
| 巨大 chunk を一時生成していないか | chunk peak を抑える |
| setup が太っていないか | 起動経路を細く保つ |
| Worker は本当に必要か | RAM と complexity の追加コストが大きい |
| native 化の根拠は profiler にあるか | 思い込みの最適化を避ける |

## 11.11 anti-pattern

- 何でも `main` の top-level に置く
- 外部入力をそのまま key にする
- mutable config を shared object として配る
- `eval` を開発補助のつもりで残す
- 巨大 string / binary を一括で組み立てる
- Worker を「非同期だから速い」とだけ考えて入れる

## 11.12 この章のまとめ

1. `xs` の実践原則は preload、freeze、keys、chunk、manifest へ収束する
2. 悪い例と良い例の差は、構文の好みではなく machine への負荷の差
3. 合成ベンチマークでも動的プロパティ名のコストはかなり大きい
4. C と Worker は強力だが、順番を誤ると負債になりやすい
