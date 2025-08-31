# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Moddable SDKは組み込みマイクロコントローラー用のJavaScriptアプリケーション開発SDKです。XS JavaScriptエンジンを中心とし、ESP32、ESP8266、Raspberry Pi Pico、nRF52、WebAssemblyなど様々なプラットフォームに対応しています。

## ディレクトリ構造

- **build/**: プラットフォーム固有のビルドファイルとツール
- **contributed/**: コミュニティが提供する非公式プロジェクトとモジュール
- **documentation/**: SDKの包括的なマークダウンドキュメント
- **examples/**: ネットワーク、グラフィックス、ハードウェア、UI等の様々な例
- **modules/**: ランタイムソフトウェアモジュール（ネットワーク、グラフィックス、UI、ハードウェアアクセス等）
- **tools/**: ビルドツール、デバッガー、リソース処理ツール
- **xs/**: XS JavaScriptエンジン、コンパイラー、リンカー

## 開発コマンド

### ビルドとデプロイ
```bash
# シミュレーターでビルドして実行
mcconfig -d -m

# 特定のプラットフォーム向けにビルド（例：Moddable Two）
mcconfig -d -m -p esp/moddable_two

# ESP8266でWi-Fi設定付きビルド
mcconfig -d -m -p esp ssid="WiFi名"

# リリースビルド（デバッグなし）
mcconfig -m

# インストルメント付きリリースビルド
mcconfig -i -m
```

### デバッグ
- `xsbug`: XS JavaScriptソースレベルデバッガー
- デバッグビルド（`-d`フラグ）のみがxsbugに接続可能

### テスト
- **Test262**: TC39公式JavaScript適合テスト
- **testmc**: Moddable SDK固有のテスト
- テストはxsbugデバッガーを通じて実行される

### プロジェクト構造
- **manifest.json**: アプリケーションの設定ファイル（モジュール、リソース、ビルド設定）
- **main.js**: アプリケーションのエントリーポイント

## キーコンセプト

### JavaScript API
- ES2025準拠のJavaScript実装
- マイクロコントローラー向けに最適化されたAPI
- メモリ効率を重視した設計

### グラフィックス
- **Commodetto**: 2Dビットマップグラフィックスライブラリ
- **Poco**: 軽量レンダリングエンジン
- **Piu**: オブジェクトベースUIフレームワーク

### ネットワーク
- HTTP/HTTPS、WebSocket、MQTT、mDNS等の対応
- Bluetooth Low Energy (BLE)サポート

### ハードウェア
- GPIO、アナログ、PWM、I2C等のプロトコル対応
- 様々なセンサーとディスプレイのドライバー