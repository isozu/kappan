---
title: 第5章 設定リファレンス
id: ch05-config-reference
next: 06-accessibility.md
---

# 第5章 設定リファレンス

本章では `kappan.config.ts` で指定できる全フィールドを節ごとに解説する。

## 5.1 設定ファイルの全体像

設定ファイルは TypeScript で書く。`defineConfig` でラップすることで、エディタの型補完と zod による検証の両方を受けられる。

```typescript
import { defineConfig } from '@kappan/core';
import { mono } from '@kappan/themes-mono';

export default defineConfig({
  metadata: {
    /* 後述 */
  },
  source: {
    /* 後述 */
  },
  output: {
    /* 後述 */
  },
  theme: mono(),
});
```

`metadata`、`source`、`theme` は必須で、`output` は省略するとデフォルト値が補われる。

## 5.2 metadata セクション

書誌情報を記述する。OPF（package.opf）と nav.xhtml の生成に使われる。

| フィールド      | 型                     | 必須 | 説明                                                 |
| --------------- | ---------------------- | ---- | ---------------------------------------------------- |
| `title`         | `string`               | 必須 | 書名。1文字以上                                      |
| `creator`       | `Creator[]`            | 必須 | 著者・編者などの一覧。最低1名                        |
| `language`      | `string`               | 任意 | 言語タグ（デフォルト `ja`）                          |
| `publisher`     | `string`               | 任意 | 出版者                                               |
| `identifier`    | `string`               | 任意 | `urn:uuid:<UUID>` 形式の一意識別子。省略時は自動生成 |
| `date`          | `string`               | 任意 | `YYYY-MM-DD` 形式の発行日                            |
| `accessibility` | `AccessibilityOptions` | 任意 | アクセシビリティメタデータ。詳細は第6章              |

### Creator の構造

```typescript
{
  name: string;           // 表示名
  role: string;           // デフォルト 'aut'（著者）
  fileAs?: string;        // ソート用の読み仮名
}
```

`role` は MARC Relator Codes に従う。代表的な値を挙げる。

| コード | 役割                    |
| ------ | ----------------------- |
| `aut`  | 著者（author）          |
| `edt`  | 編者（editor）          |
| `trl`  | 訳者（translator）      |
| `ill`  | 挿絵画家（illustrator） |
| `pbl`  | 出版者（publisher）     |

`fileAs` は五十音順や ABC 順のソートに使われる読み仮名で、日本人の名前を含む書籍では必ず指定することを推奨する。

## 5.3 source セクション

ソース Markdown の場所を指定する。

| フィールド | 型       | 必須 | 説明                                                 |
| ---------- | -------- | ---- | ---------------------------------------------------- |
| `entry`    | `string` | 必須 | 最初の章ファイル（プロジェクトルートからの相対パス） |
| `baseDir`  | `string` | 任意 | Markdown 群の置き場所（デフォルト `src/`）           |

`entry` から始めて、各章ファイルの `next` を辿って収集される。グロブパターン（`src/**/*.md` など）は今後の対応予定である。

## 5.4 output セクション

出力先と出力ファイル名を指定する。

| フィールド | 型       | デフォルト     | 説明               |
| ---------- | -------- | -------------- | ------------------ |
| `dir`      | `string` | `dist/`        | 出力先ディレクトリ |
| `filename` | `string` | `{title}.epub` | 出力ファイル名     |

`filename` 中の `{title}` プレースホルダは `metadata.title` で置換される。ファイル名として不正な文字は `_` に置換される。

## 5.5 theme セクション

テーマを指定する。最小構成では `@kappan/themes-mono` を使う。

```typescript
import { mono } from '@kappan/themes-mono';

export default defineConfig({
  // ...
  theme: mono(),
});
```

他のテーマ（Saiun、Sumi、Kohaku、Hibana）はすべて同じ呼び出し規約（`<name>()` ファクトリ関数）に従う。テーマ作者向けの API も公開されている。

## 5.6 設定の検証

`defineConfig` の内部で zod スキーマによる検証が走る。不正な設定はビルド開始前に詳細なエラーを伴って報告される。例として、`creator` が空配列の場合は次のエラーになる。

```
✗ Failed to load config:
  Invalid Kappan configuration:
    • metadata.creator: Array must contain at least 1 element(s)
```

このような早期検証によって、ビルドパイプラインの深いところで設定不整合が露見する事態を防いでいる。

## 5.7 設定ファイルの場所

デフォルトでは CLI は `./kappan.config.ts` を読み込む。別の場所のファイルを使いたい場合は `--config` で明示する。

```bash
pnpm kappan build --config /path/to/another.config.ts
```

設定ファイル中で `import` した相対パスは、設定ファイル自身の位置を基準として解決される。
