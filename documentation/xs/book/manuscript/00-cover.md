# 詳解xs

副題: Webエンジニアのための組み込みJavaScriptランタイム読本

<div class="lead">
ブラウザや Node.js に慣れた JavaScript エンジニアが、<code>xs</code> と Moddable SDK を通じて「制約の強い環境で JavaScript を動かす」とは何かを理解し、実装に落とし込めるようになるための本です。
</div>

## 本書の焦点

- JavaScript エンジン一般の仕組み
- `xs` ランタイム固有の設計
- 組み込み向けツールチェーンとビルド前倒し
- RAM/ROM 制約を前提にした設計原則
- `XS in C`、Compartment、Worker、Mods、`xsbug` の実践的な使い方

## 想定読者

- 普段の業務で JavaScript や TypeScript を使っている Web エンジニア
- Node.js やブラウザ API には慣れているが、JS エンジン内部の仕組みは追っていない方
- RAM、ROM、起動時間、電力制約のある環境での開発経験が少ない方

## 版情報

- 版: 初版増補ドラフト
- 組版: Vivliostyle
- 対象コードベース: Moddable SDK Runtime 同梱資料および `xs` 実装

<div class="note">
本書は、<code>documentation/xs</code> 以下の公式資料、<code>documentation/base</code> 以下のホスト資料、そして <code>xs/sources</code> 以下の実装を相互参照しながら再構成しています。公式文書の翻訳ではなく、Web エンジニア向けに論点を並べ替えた解説書です。
</div>

<div class="note">
用語の意味が曖昧なまま先へ進むと、あとで一気に苦しくなります。見慣れない語が続くときは、巻末の付録C「用語集」を先に開いてください。
</div>
