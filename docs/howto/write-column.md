# How-to: コラム（読み物）を入れたい

本筋から少し離れた読み物を「コラム」として入れたいときは `@kappan/plugin-column` を使う。
目次掲載と相互参照まで面倒を見る。Re:VIEW の `//column` ＋ `@<column>{}` に相当する。

## 基本

```markdown
:::column[なぜ DeFi は速いのか]{#col:why-fast}
コラム本文。複数段落・コード・図も入る。
:::
```

出力：

```html
<aside epub:type="sidebar" class="admonition column" id="col-why-fast">
  <p class="admonition-title column-title">なぜ DeFi は速いのか</p>
  <p>コラム本文。…</p>
</aside>
```

- `[なぜ DeFi は速いのか]` … コラムのタイトル（目次にも出る）
- `{#col:why-fast}` … 参照 id

## 本文から参照する

```markdown
このトピックは [@col:why-fast] で詳しく扱った。
```

→ `コラム「なぜ DeFi は速いのか」` というリンクになる。章をまたぐときは
`[@col:章ID/why-fast]`（例 `[@col:ch03/why-fast]`）。章 ID は章ファイルの
front-matter `id`（見出しの `{#chXX}` マーカーと揃える）。未定義の参照はビルド時に warning。

## プラグインを有効にする（順番に注意）

コラムを目次に載せるには `plugin-heading-number` が publish する章レジストリが要る。
**`headingNumber()` より後に `column()` を置くこと**。目次ページは `toc()`。

```ts
import { headingNumber } from '@kappan/plugin-heading-number';
import { column } from '@kappan/plugin-column';
import { toc } from '@kappan/plugin-toc';

export default defineConfig({
  // ...
  plugins: [headingNumber(), column(), toc({ depth: 2 })],
});
```

## 参照リンクの文言を変える

```ts
column({ refLabel: 'コラム『{title}』' }); // {title} がタイトルに置換される
```

注記・警告など短い囲みが欲しいだけなら [囲み記事 How-to](./write-admonition.md) を参照。
