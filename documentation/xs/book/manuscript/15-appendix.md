# 付録

## 付録A まず覚えるコマンド

| 目的 | コマンド例 |
| --- | --- |
| XS shell を試す | `xst` |
| simulator debug build | `mcconfig -d -m -p simulator` |
| 実機 debug build | `mcconfig -d -m -p esp32/<board>` |
| 実機 release build | `mcconfig -m -p esp32/<board>` |
| mod build | `mcrun -d -m` |
| Vivliostyle preview | `npm run preview` |
| Vivliostyle build | `npm run build` |

## 付録B source map

本書の内容を実装へ戻って確認するときの入口を整理します。

| テーマ | まず見るファイル |
| --- | --- |
| machine 準備と clone | `xs/sources/xsAPI.c` |
| memory allocation と GC | `xs/sources/xsMemory.c` |
| Promise jobs | `xs/sources/xsPromise.c` |
| module 解決 | `xs/sources/xsModule.c` |
| bytecode / 実行系 | `xs/sources/xsRun.c`, `xs/sources/xsScript.c` |
| preload / freeze / linker | `xs/tools/xsl.c` |
| compiler | `xs/tools/xsc.c` |
| setup | `documentation/base/setup.md` |
| Worker | `documentation/base/worker.md` |
| Compartment | `documentation/xs/XS Compartment.md` |
| Mods | `documentation/xs/mods.md` |
| debugger | `documentation/xs/xsbug.md` |

## 付録C 用語集

| 用語 | 意味 |
| --- | --- |
| machine | `xs` の実行状態全体です |
| preparation | `xsl` が作る read-only machine の雛形です |
| slot | 固定長の基本単位です |
| chunk | 可変長データ領域です |
| key | property 名や識別子管理の単位です |
| preload | module 初期化の build time 実行です |
| alias | ROM object 変更時に RAM 側 clone へ切り替える仕組みです |
| strip | 不要 built-ins を削って engine profile を作ることです |
| ROM colors | ROM 上 property access を最適化する graph coloring 手法です |
| setup module | main より前に走る環境初期化 module です |
| Compartment | 同一 machine 内の軽量 sandbox です |
| Worker | 別 machine を起動する API です |

## 付録D 実装読解の順番

本書を読み終えたあとに source を追うなら、次の順が負担を抑えやすいです。

1. `documentation/xs/XS Differences.md`
2. `documentation/xs/preload.md`
3. `xs/sources/xsAPI.c`
4. `xs/sources/xsMemory.c`
5. `xs/tools/xsl.c`
6. `documentation/base/setup.md`
7. `documentation/base/worker.md`
8. `documentation/xs/xsbug.md`

## 付録E 図版・スクリーンショット TODO

現時点で人手取得を前提に残しているものです。詳細管理は `99-asset-todo.md` にあります。

- 最新版 xsbug PROFILE タブのスクリーンショット
- 実機デプロイから xsbug 接続までのログ
- ケーススタディの preload 前後比較グラフ

## 付録F 本書の要点

最後に一行ずつ要約します。

- JavaScript エンジン一般の仕組みと、`xs` の特殊化は分けて理解するべきです
- `xs` の核は build time 前倒し、ROM 活用、freeze、strip です
- manifest はランタイム設計図です
- preload 可能な module 設計が、起動時間と RAM を左右します
- Worker や C は強力ですが、計測と責務分離が先です
