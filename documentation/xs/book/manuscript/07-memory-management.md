# 第6章 メモリ管理

組み込み JavaScript で最も現実的な制約は RAM です。`xs` を使いこなすには、GC のアルゴリズム名を知るだけでは不十分で、「どの記述が slot を増やし、どの記述が chunk を増やし、何を freeze すると alias 予算が減るのか」を理解する必要があります。

## 6.1 GC を一般論として見る

JavaScript エンジン一般では、GC は「到達可能なオブジェクトを残し、それ以外を回収する仕組み」です。到達可能性の起点は、現在の stack、global、closure、各種内部 root、host が保持する参照です。

この考え方自体は `xs` でも同じです。ただし `xs` では、

- slot と chunk を分けている
- chunk は移動しうる
- host object と handle が GC に参加する
- frozen / ROM object と runtime object が混ざる

という事情があるため、GC の設計判断がアプリ設計へ見えやすくなっています。

## 6.2 slot heap と chunk heap の圧力

メモリ不足とひとことで言っても、どの領域が詰まっているかで対策は変わります。

| 症状 | 詰まりやすい領域 | 見直しの方向 |
| --- | --- | --- |
| object / closure / property が多い | slot heap | object 数削減、freeze、host chunk 化 |
| 文字列、ArrayBuffer、resource 展開が重い | chunk heap | 文字列生成削減、Resource 利用、分割読込 |
| 再帰や深い call / 複雑な式 | stack | アルゴリズム変更、stack 増量 |
| 動的 property 名が多い | keys | key 予算増量、名前生成削減 |

`xsbug` の Instrumentation を見ながら、どこが増えているのかを切り分ける習慣が重要です。

## 6.3 freeze が RAM に効く理由

`documentation/xs/preload.md` では、ROM 上の object を変更可能にするため、XS は alias 用の pointer を持つと説明されています。つまり、ROM object が「変更されうる」と見なされる限り、そのための RAM を確保しなければなりません。

このため、freeze には二つの意味があります。

1. API 的に「変更しない」ことを宣言できます。
2. 実装的に alias pointer を減らし、RAM を節約できます。

Web での `Object.freeze` は設計上の意思表明で終わることも多いですが、`xs` ではメモリ最適化として実利があります。

## 6.4 `const` と module closure

preload された module の top-level 変数は closure として残ります。`preload.md` には、可変な module 変数に対しても差分用 pointer が必要だとあります。つまり次の二つは、RAM コストが違います。

```js
const config = Object.freeze({...}, true);
```

```js
let config = {...};
```

もちろん `let` が必要な場面はあります。しかし「本当は不変なのに惰性で `let` を使う」ことは、`xs` では RAM 浪費です。Web でも `const` を基本にする文化はありますが、`xs` ではその意味がもっと具体的です。

## 6.5 文字列とキーの罠

`documentation/xs/XS Differences.md` では、`xs` の文字列表現が一般的な Web エンジンと違う点に触れています。さらに、key table の存在により、動的な property 名を増やすコードはメモリを押し上げます。

たとえば次のようなコードは要注意です。

```js
state[`sensor_${index}_${Date.now()}`] = value;
```

この一行で、

- 新しい文字列が増えます
- 新しい property key が増えます
- object も肥大化します

デバッグ用に一時的に書いたコードが、そのまま本番で key table を圧迫することは珍しくありません。

## 6.6 host object はメモリ最適化にもなる

`documentation/xs/handle.md` で説明されているように、C 側 chunk に複数の値を密に詰めると、JavaScript object の property slot 群よりメモリ効率がよい場合があります。たとえば座標、色、境界矩形、センサ生データのように固定構造で高頻度アクセスされるものは、host chunk にする価値があります。

これは「何でも C で書け」という意味ではありません。重要なのは境界の切り方です。

- ポリシーや業務ロジックは JS に残します。
- 高頻度で細かい property dispatch が多い部分は C を検討します。
- C 側は chunk と handle を使って GC と整合させます。

## 6.7 GC 由来の症状をどう見るか

実機でよく見る症状は次のようなものです。

| 症状 | よくある原因 |
| --- | --- |
| 一定時間後に不安定になる | 小さな allocation を継続的に積み上げている |
| 画面更新が周期的に重くなる | frame ごとの一時 object 生成が多い |
| Worker 追加後に急に落ちる | VM ごとの予算見積もり不足 |
| Mods 導入後に build は通るが runtime で破綻する | keys や static 予算が不足している |

GC 自体を悪者にするのではなく、「何が allocation を発生させているか」を見るべきです。`xs` では allocation 圧力がコード構造にかなり素直に反映されます。

## 6.8 実装読解の手がかり

`xs/sources/xsMemory.c` には、frozen object かどうか、patch が必要かどうかに応じた分岐があります。細部まで追わなくても、「変更不可能な object には patch の仕組みを用意しなくてよい」という設計がコードに落ちていることを確認すると、freeze の意味が腹落ちします。

また `documentation/xs/handle.md` は、chunk が移動しうること、handle が slot に固定されることを明快に説明しています。GC の教科書よりも、こちらを読むほうが `xs` 実務には役立ちます。

## 6.9 実務ルール

この章だけで先に覚えてよい実務ルールを挙げます。

1. top-level 定数データは、freeze と preload を前提に設計します。
2. 動的 key 生成を避けます。
3. frame ごとに object を作らないようにします。
4. Worker ごとに別予算を与えます。
5. 大きな可変構造や高頻度データは host chunk 化を検討します。

## 6.10 この章のまとめ

`xs` のメモリ管理は、GC の種類を知ることよりも、「どの記述がどの領域に圧力を掛けるか」を理解することが重要です。freeze、`const`、key 予算、host object、Worker 予算は、すべてメモリ管理の話としてつながっています。
