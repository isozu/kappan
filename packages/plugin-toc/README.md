# @kappan/plugin-toc

読者が読む「目次」ページ (`content/toc.xhtml`) を spine に追加する Kappan プラグイン。

EPUB3 の必須ナビゲーション (`nav.xhtml`、リーダーアプリの目次パネル用) とは別に、**紙の本のような目次ページ** を本文の前 (または後) に挿入する。

## 必要なもの

- [`@kappan/plugin-heading-number`](../plugin-heading-number) を **先に** 配置すること。`headingNumber` が publish する `ChapterRegistry` を読んで目次を組み立てる。

## 使い方

```ts
import { defineConfig } from '@kappan/core';
import { headingNumber } from '@kappan/plugin-heading-number';
import { toc } from '@kappan/plugin-toc';

export default defineConfig({
  // ...
  plugins: [
    headingNumber(),
    toc({ depth: 2 }), // 章 + h2 まで
  ],
});
```

## オプション

| 名前                | 型                                          | 既定                  | 説明                                           |
| ------------------- | ------------------------------------------- | --------------------- | ---------------------------------------------- |
| `title`             | `string`                                    | `'目次'`              | 目次ページのタイトル (h1)                      |
| `depth`             | `1 \| 2 \| 3`                               | `1`                   | 章のみ / +h2 / +h3                             |
| `position`          | `'before-bodymatter' \| 'after-bodymatter'` | `'before-bodymatter'` | 本文の前 / 後                                  |
| `href`              | `string`                                    | `'content/toc.xhtml'` | EPUB 内パス                                    |
| `id`                | `string`                                    | `'gentoc'`            | manifest / spine の id                         |
| `includeNonChapter` | `boolean`                                   | `false`               | 凡例・索引など `kind !== 'chapter'` を含めるか |

## CSS フック

生成 XHTML は以下のクラスを使う。テーマ側 (themes-saiun など) で装飾可能：

- `.toc-page` — 目次 nav 要素
- `.toc-title` — h1
- `.toc-list` — `<ol>` リスト
- `.toc-chapter` — 章 `<li>`
- `.toc-sections` — ネストした節 `<ol>`
- `.toc-section`, `.toc-section-h2`, `.toc-section-h3` — 節 `<li>`
