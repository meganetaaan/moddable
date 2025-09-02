# piuのOutline Shape機能の拡張

## 背景

- piuにはShape要素があり、fillとstroke要素を1個ずつ描画できる。

## 要求事項

- 複数のShape要素を重ねて描画したい
  - キャラクターの「瞳」の上に「まぶた」を描画して目を表現したい

## 現行実装の課題

- Shape要素1個あたり、fill outlineとstroke outlineを1色ずつしか指定できない
- Shape要素自体を複数、同じ座標に重ねることで上記の表示ができるが、描画タイミングがずれるためにグリッチが発生する場合がある（まぶたがチラチラと明滅し、下の瞳がすべて表示される

## 解決策の案

- Shapeを改修して「複数のOutlineを同時に描画する」要素を作成する
- Commodetto PocoのI/Fベースでのアウトライン描画を自由に行える
- piuのdie cut機構によって「指定した座標と幅、高さ」で描画は切り取られる

## 現状

modules/piu/multiOutlineにpiu/shapeをコピーしてきた状態

examples/piu/multiOutlineShape shapeのサンプルをコピーしてきた状態