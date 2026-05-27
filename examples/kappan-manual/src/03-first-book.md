---
title: 第3章 最初の本を作る
id: ch03-first-book
next: 04-markdown-syntax.md
---

# 第3章 最初の本を作る

本章では、最小構成の書籍プロジェクトを一から組み立てて EPUB を出力するまでを通す。

## 3.1 ディレクトリ構成

書籍プロジェクトは次の構成を取る。

```
my-book/
├── kappan.config.ts     # 設定ファイル
└── src/
    ├── 01-introduction.md
    ├── 02-design.md
    └── 03-conclusion.md
```

設定ファイルとソースディレクトリを置けば、それで最小構成は揃う。

## 3.2 設定ファイルの作成

`kappan.config.ts` を以下の内容で作成する。

```typescript
import { defineConfig } from '@kappan/core';
import { mono } from '@kappan/themes-mono';

export default defineConfig({
  metadata: {
    title: '私の最初の本',
    creator: [{ name: '著者名', fileAs: 'ちょしゃめい' }],
    language: 'ja',
    identifier: 'urn:uuid:00000000-0000-0000-0000-000000000001',
  },
  source: { entry: 'src/01-introduction.md', baseDir: 'src/' },
  theme: mono(),
});
```

`defineConfig` は型補完を効かせるためのユーティリティで、内部で zod による設定検証も行う。必須フィールドは `metadata.title`、`metadata.creator`（最低1名）、`source.entry`、`theme` の四つである。

## 3.3 章ファイルの記述

各章ファイルは YAML front-matter で順序情報を持つ。

`src/01-introduction.md`：

```markdown
---
title: 第1章 はじめに
id: ch01
next: 02-design.md
---

# 第1章 はじめに

本書の目的を記す。
```

- `title`：章タイトル。目次に掲載される
- `id`：EPUB の manifest と spine で使う識別子
- `next`：次の章ファイル名（同じ `src/` ディレクトリ内の相対パス）

`next` が指定されていない章で連結は終わる。同じ書籍内で循環参照が発生した場合はビルド時にエラーとなる。

## 3.4 ビルド

設定ファイルとソースが揃ったら、ビルドコマンドを実行する。

```bash
pnpm kappan build --config /path/to/my-book/kappan.config.ts
```

成功すれば `my-book/dist/` 配下に `.epub` ファイルが生成される。デフォルトの出力ファイル名は `{title}.epub` で、`{title}` 部分が設定の `metadata.title` で置換される。

出力例：

```
✓ Built my-book/dist/私の最初の本.epub
```

## 3.5 出力先の変更

出力先ディレクトリを変えたい場合は、`--out` で指定するか、`kappan.config.ts` の `output.dir` を変更する。

```bash
pnpm kappan build --config ./kappan.config.ts --out ./build
```

ファイル名のパターンは `output.filename` で変更できる。`{title}` のほかにも将来的に `{version}` などのプレースホルダが追加される予定である。

## 3.6 検証付きビルド

EPUBCheck を導入済みであれば、ビルド後に検証を走らせることができる。

```bash
pnpm kappan build --config ./kappan.config.ts --validate
```

検証で fatal または error が出ると、CLI は終了コード 2 を返す。CI/CD ではこの終了コードをチェックすることで、不正な EPUB が公開されることを防げる。

## 3.7 終了コード

CLI の終了コードは次の意味を持つ。

| 終了コード | 意味                                        |
| ---------- | ------------------------------------------- |
| 0          | 成功                                        |
| 1          | ユーザーエラー（設定不正、a11y 違反等）     |
| 2          | EPUBCheck がエラーまたは fatal を返した     |
| 3          | 内部エラー、または EPUBCheck が見つからない |

CI スクリプトでこれらを区別すれば、原因に応じた振る舞いを実装できる。
