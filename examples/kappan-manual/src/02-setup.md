---
title: 第2章 環境の準備
id: ch02-setup
next: 03-first-book.md
---

# 第2章 環境の準備

本章では Kappan を動かすために必要なソフトウェアの導入と、リポジトリの取得手順を扱う。

## 2.1 必要なソフトウェア

| ソフトウェア | バージョン   | 用途                       | 必須・任意 |
| ------------ | ------------ | -------------------------- | ---------- |
| Node.js      | 20 LTS 以上  | ビルド本体の実行           | 必須       |
| pnpm         | 10 以上      | パッケージマネージャ       | 必須       |
| Java         | 17 以上      | EPUBCheck の実行           | 任意       |
| Git          | 任意の最新版 | ソース取得とバージョン管理 | 必須       |

Node.js のバージョンは厳格に確認される。リポジトリの `.nvmrc` で 20.19.6 を指定しており、`engine-strict=true` の設定により範囲外の Node では `pnpm install` が失敗する。これは「環境ごとの差異で動作が変わらない」状態を担保するための意図的な制約である。

## 2.2 Node.js の導入

Node.js は公式サイトのインストーラを使うか、`nvm`（バージョン切り替えツール）経由で導入する。`nvm` を利用する場合、リポジトリのディレクトリで次のように実行すれば `.nvmrc` の値が自動的に選ばれる。

```bash
nvm use
```

`.nvmrc` で指定したバージョンが手元に無ければ、`nvm install` を一度走らせる。

## 2.3 pnpm の有効化

Node.js 16.13 以降に同梱されている **Corepack** を有効化することで、pnpm を任意のバージョンで利用できる。Kappan のリポジトリには `package.json` の `packageManager` フィールドで pnpm のバージョンが固定されているため、Corepack が自動的に同じバージョンを選ぶ。

```bash
corepack enable
```

これで `pnpm` コマンドが使えるようになる。バージョン確認は次の通り。

```bash
pnpm --version
```

## 2.4 Java の導入（EPUBCheck 用）

EPUBCheck は W3C 公式の EPUB 検証ツールで、Java 製である。Kappan の `--validate` オプションを使う場合に必要となる。任意なので、まずビルドの動作確認だけ行いたい段階では飛ばしてもよい。

macOS では Homebrew でインストールできる。

```bash
brew install openjdk@17
```

導入後、`java -version` で `17.x.x` が返ることを確認する。

## 2.5 Kappan の取得

Kappan はモノレポとして GitHub で公開されている。取得とセットアップは次の通り。

```bash
git clone https://github.com/isozu/kappan.git
cd kappan
corepack enable
pnpm install
```

`pnpm install` 後の workspace 構造は次のようになる。

```
kappan/
├── packages/
│   ├── core/             # @kappan/core
│   ├── epub-packager/    # @kappan/epub-packager
│   ├── cli/              # @kappan/cli
│   └── themes-mono/      # @kappan/themes-mono
├── examples/
│   └── kappan-manual/    # 本書のソース
├── tests/
│   └── fixtures/         # ゴールデンファイルテスト用フィクスチャ
└── docs/                 # クイックスタート・ガイド・リファレンス
```

## 2.6 動作確認

セットアップが正しく済んでいることは、同梱のテストを走らせれば確認できる。

```bash
pnpm test
```

全テストが緑色（pass）になれば、開発環境は整っている。続けて、EPUBCheck の検証も試したい場合は次のコマンドで JAR を取得する。

```bash
pnpm epubcheck:fetch
```

このコマンドは `~/.kappan/tools/epubcheck/` に EPUBCheck JAR をダウンロードして展開する。一度実行すれば再取得は不要である。
