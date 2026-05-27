# How-to: 索引を作る

索引は `@kappan/plugin-jp-index`（0.2.0、MeCab 不要）で生成する。本文に索引マーカーを埋め、巻末に `<nav epub:type="index">` が自動で追加される。

## 索引語をマークする

3 つの記法が使える。

```markdown
<!-- 読みなし（表層形がそのまま並べ替えキーになる） -->

{!活版印刷!}は近代日本の出版を支えた。

<!-- 読み指定（`|` の後ろが読み。五十音ソートのため推奨） -->

{!活版印刷|かっぱんいんさつ!}は近代日本の出版を支えた。

<!-- 属性記法（既存の Markdown を壊さずマークしたいとき） -->

[活版印刷]{.index reading="かっぱんいんさつ"}は近代日本の出版を支えた。
```

索引順序は **あ → 英数 → 記号**。読みが正確だと並びも正確になる。

## プラグインを有効にする

```ts
import { jpIndex } from '@kappan/plugin-jp-index';

export default defineConfig({
  // ...
  plugins: [jpIndex()],
});
```

巻末索引のタイトルやリンク先を変えたいとき：

```ts
plugins: [jpIndex({ title: '索引', href: 'index.xhtml' })],
```

## 読みを自動推定する（任意）

読みを毎回手で書きたくない場合、`autoReading` を有効にすると `kuromoji.js`（optionalDependencies）で未指定項目の読みを推定する。

```ts
plugins: [jpIndex({ autoReading: true })],
```

```bash
pnpm add kuromoji
```

> `autoReading: true` でも `kuromoji.js` が未導入なら、表層形を読みにフォールバックして warning を出す。正確な並びが必要な箇所は `reading` を明示するのが確実。

## MeCab 不要

Kappan の索引は MeCab / UniDic などの形態素解析器に依存しない。読みは記法での手動指定が基本で、`kuromoji.js` は任意の補助。

## 関連

- [記法リファレンス](../reference/notations.md)
