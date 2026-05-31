# @kappan/plugin-column

コラム（傍流記事）を Markdown に追加する Kappan プラグイン。
[remark-directive](https://github.com/remarkjs/remark-directive) の `:::column` 記法を使い、
目次掲載と相互参照（`[@col:id]`）まで面倒を見る。Re:VIEW の `//column` ＋ `@<column>{}` に相当する。

## 記法

```markdown
:::column[なぜ DeFi は速いのか]{#col:why-fast}
コラム本文。複数段落・コード・図も入る。
:::

このトピックは [@col:why-fast] で詳しく扱った。
```

- `[なぜ DeFi は速いのか]` … コラムのタイトル（目次にも出る）
- `{#col:why-fast}` … 参照 id。本文中の `[@col:why-fast]` でリンクできる
- 章をまたぐ参照は `[@col:章ID/why-fast]`（例 `[@col:ch03/why-fast]`）。章 ID は章ファイルの `id`

## 出力

```html
<aside epub:type="sidebar" class="admonition column" id="col-why-fast">
  <p class="admonition-title column-title">なぜ DeFi は速いのか</p>
  <p>コラム本文。…</p>
</aside>
```

本文中の参照は `<a class="kappan-xref kappan-colref" href="#col-why-fast">コラム「なぜ DeFi は速いのか」</a>` になる。

## 目次（plugin-toc）への掲載

`plugin-heading-number` が publish する `ChapterRegistry` の章レコードにコラムを追記する。
`@kappan/plugin-toc` がそれを読んで目次に「コラム」行を出す。**`plugins` 配列では
`headingNumber()` より後に `column()` を置くこと**（レジストリを前提とするため）。

```ts
import { headingNumber } from '@kappan/plugin-heading-number';
import { column } from '@kappan/plugin-column';
import { toc } from '@kappan/plugin-toc';

export default defineConfig({
  // …
  plugins: [headingNumber(), column(), toc({ depth: 2 })],
});
```

## オプション

| オプション | 既定                | 説明                                                             |
| ---------- | ------------------- | ---------------------------------------------------------------- |
| `refLabel` | `コラム「{title}」` | `[@col:id]` のリンク文言。`{title}` がコラムタイトルに置換される |

未解決の `[@col:id]` はビルド時に warning を出す。

## ライセンス

MIT
