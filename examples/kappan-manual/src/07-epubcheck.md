---
title: 第7章 EPUBCheck で検証する
id: ch07-epubcheck
next: 08-store-submission.md
---

# 第7章 EPUBCheck で検証する

EPUBCheck は W3C 公式の EPUB 検証ツールで、商業流通における事実上の最低ラインを担保する。本章ではその導入と運用を扱う。

## 7.1 EPUBCheck とは

EPUBCheck は EPUB ファイルが EPUB 3 仕様に準拠しているかを検証する Java 製ツールである。W3C が公式に管理しており、各種電子書籍ストア（Apple Books、Kobo、honto など）は内部的に EPUBCheck を用いた入稿審査を行っている。

検証項目は多岐にわたる。代表的なものを挙げる。

- ZIP コンテナ構造の正当性（`mimetype` の非圧縮配置など）
- `META-INF/container.xml` の文法
- `package.opf` の必須メタデータ
- XHTML5 文法の遵守
- 内部リンクと参照の整合性
- 画像・フォント・CSS ファイルの media-type 適合
- アクセシビリティ要件の最低限の確認

## 7.2 導入

Kappan には EPUBCheck の JAR ファイルは同梱されていない。これは EPUBCheck のライセンスと git リポジトリ肥大化の両面の配慮による。代わりに、次のコマンドで GitHub Releases から取得して `~/.kappan/tools/epubcheck/` にキャッシュする仕組みがある。

```bash
pnpm epubcheck:fetch
```

このコマンドは初回のみ実行すればよい。バージョンを上げる場合は `tools/epubcheck/fetch.mjs` の `EPUBCHECK_VERSION` 定数を更新して再取得する。

Java 17 以上が必要である。Java のインストール手順は第2章「環境の準備」を参照されたい。

## 7.3 検証付きビルド

ビルドコマンドに `--validate` フラグを付けると、ビルド成功後に EPUBCheck が自動的に走る。

```bash
pnpm kappan build --config ./kappan.config.ts --validate
```

すべて成功した場合の出力例：

```
✓ Built dist/my-book.epub
✓ EPUBCheck: 0 errors, 0 warnings
```

検証で問題があった場合は、エラー詳細が標準エラー出力に流れる。

```
✓ Built dist/my-book.epub
✗ EPUBCheck: 0 fatal, 1 error, 2 warnings
  [ERROR] OPF-014: meta property "schema:accessibilitySummary" is missing.
```

## 7.4 EPUBCheck の出力レベル

EPUBCheck は問題を 4 段階で報告する。

| レベル  | 意味                                | Kappan CLI の扱い    |
| ------- | ----------------------------------- | -------------------- |
| FATAL   | 致命的エラー。EPUB が成立していない | 終了コード 2         |
| ERROR   | 仕様違反                            | 終了コード 2         |
| WARNING | 仕様準拠だが推奨されない            | 終了コード 0（成功） |
| INFO    | 情報提供                            | 終了コード 0（成功） |

FATAL と ERROR を 0 件にすることが、商業流通への入稿準備が整った状態の指標となる。

## 7.5 環境変数による JAR パスの指定

エアギャップ環境や CI/CD で別の場所に EPUBCheck を置きたい場合は、環境変数 `KAPPAN_EPUBCHECK_PATH` で JAR パスを直接指定できる。

```bash
KAPPAN_EPUBCHECK_PATH=/opt/epubcheck/epubcheck.jar pnpm kappan build --validate
```

優先順位は次の通り。

1. 環境変数 `KAPPAN_EPUBCHECK_PATH`
2. `~/.kappan/tools/epubcheck/epubcheck-<version>/epubcheck.jar`

両方とも見つからなければ `EpubcheckNotInstalledError` で終了する。

## 7.6 CI/CD での運用

GitHub Actions で EPUBCheck を走らせる例を示す。

```yaml
- uses: actions/setup-java@v4
  with:
    distribution: temurin
    java-version: '17'

- uses: actions/cache@v4
  with:
    path: ~/.kappan/tools/epubcheck
    key: epubcheck-5.2.1

- run: pnpm epubcheck:fetch
- run: pnpm kappan build --config ./kappan.config.ts --validate
```

`actions/cache` でキャッシュすることで、毎回のダウンロードを避けられる。

## 7.7 ローカルでの素早い検証

開発中に EPUBCheck の起動オーバーヘッド（JVM 起動で数秒）が無視できない場合は、`--validate` を外したビルドを高速に繰り返し、最終的なコミット前にだけ検証を走らせる運用が現実的である。`kappan preview` のライブプレビューではビルドが高速に完了するが、`--validate` のような重い検証は明示的に呼び出す形となる。

## 7.8 EPUBCheck で警告が出やすい項目

実際の運用で警告として出やすい項目を挙げる。これらは Kappan の出力では基本的に出ないが、独自カスタマイズを加えた場合に発生しうる。

- **OPF-014**：`schema:accessibilitySummary` が無い → 自動付与で回避
- **CSS-007**：未知の CSS プロパティ → ベンダープレフィックスや実験的 CSS を避ける
- **HTM-014**：alt 属性が空で role=presentation が無い → 装飾画像の明示
- **PKG-021**：未使用の manifest 項目 → 内部チェックで防がれている

これらが出た場合、まず Kappan のバージョンと出力 EPUB の構造を見直すか、独自の前処理が原因かを切り分ける。
