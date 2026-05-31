# showcase-all-features — Kappan 全部入りショーケース

Kappan の主要記法を 1 冊に詰め込んだ横組み（彩雲テーマ）の完成見本。
README のヒーロー画像の出どころであり、ビルドが通ること自体が全プラグイン結合の回帰テストになる。

縦組み専用の見せ場（縦中横の実描画・会話文の字下げ）は
[`../showcase-novel/`](../showcase-novel/) を参照。

## この例が示す記法

| 章 | 記法 |
| -- | ---- |
| はじめに | ルビ（パイプ `{活版\|かっぱん}` ＋属性 `[校正]{ruby="こうせい"}`）、圏点 `[重要]{.kenten}`、CommonMark/GFM（リスト・表・引用・強調・リンク・取り消し線） |
| 第1章 | 図番号 `{#fig:id}`、コードハイライト（shiki）＋リスト番号 `{#lst:id}`、表番号 `{#tbl:id}`、節 `{#sec:id}`、相互参照 `[@fig:]` `[@lst:]` `[@tbl:]` `[@sec:]` `[@chap:]` |
| 第2章 | インライン数式 `$…$`・ディスプレイ数式 `$$…$$`＋`{#eq:id}`／`[@eq:id]`、脚注 `[^id]`、索引 `{!語\|よみ!}`（巻末索引を自動生成） |
| 第3章 | 囲み記事 `:::note` / `:::tip` / `:::warning[題]`、コラム `:::column[題]{#col:id}` ＋ 章跨ぎ参照 `[@col:id]` / `[@fig:章ID/id]` |

加えて、自動目次（`plugin-toc`、コラムも掲載）・章節の自動採番（`plugin-heading-number`）・
禁則処理（`plugin-kinsoku`）が全体に効いている。

## ビルド

```bash
pnpm kappan build -c examples/showcase-all-features/kappan.config.ts --validate
```

`--validate` は EPUBCheck 5.x（要 Java 17+、`pnpm epubcheck:fetch`）。本例は 0 errors / 0 warnings。

## スクリーンショット再生成

`screenshots/all-features.png`（README ヒーロー = 第1章）と各章 PNG は次で再生成する。
Chrome for Testing が必要（`npx @puppeteer/browsers install chrome@stable`）。

```bash
node --import tsx examples/showcase-all-features/capture-screenshots.ts
```
