# @kappan/plugin-figure-numbering

図表の自動採番と相互参照解決プラグイン。Pandoc-crossref 互換の参照記法をサポートする。

- `![alt](path){#fig:id}` → 単独段落のブロック画像を `<figure><figcaption>図1.1: alt</figcaption></figure>` に変換し、番号付きキャプションを可視で出す
- GFM テーブル ＋ 直前/直後の `{#tbl:id} キャプション` 段落 → `<figure>` で包み「表1.1: …」を表示
- `[@fig:id]` / `[@tbl:id]` → `図1.1` / `表1.1` に置換

## Installation

```bash
pnpm add @kappan/plugin-figure-numbering
```

## Usage

```typescript
import { defineConfig } from '@kappan/core';
import { figureNumbering } from '@kappan/plugin-figure-numbering';

export default defineConfig({
  // ...
  plugins: [figureNumbering()],
});
```

## Markdown Example

```markdown
# 第1章 構成

![システム構成図](arch.png){#fig:arch}

[@fig:arch] のとおり、3 階層で構成される。
```

出力：

- 画像が `<figure>` で包まれ、キャプション「`図1.1: システム構成図`」が図の下に表示される（alt は素の説明「`システム構成図`」のまま）
- 本文の `[@fig:arch]` が「`図1.1`」に

```markdown
比較表 {#tbl:cmp}

| 項目 | A   | B   |
| ---- | --- | --- |
| 速度 | 速  | 遅  |
```

表の直前（または直後）に `{#tbl:id}` を含む段落を置くと、その表が `<figure>` で包まれ
「`表1.1: 比較表`」のキャプションが付く。

## Options

```typescript
figureNumbering({
  labelStyle: 'jp', // 'jp' (図1.1) | 'en' (Fig.1.1)
});
```

## Reference Notations

| 記法        | 種別   |
| ----------- | ------ |
| `[@fig:id]` | 図     |
| `[@tbl:id]` | 表     |
| `[@lst:id]` | リスト |

## Documentation

- [Kappan リポジトリ](https://github.com/isozu/kappan)
- [Pandoc-crossref](https://lierdakil.github.io/pandoc-crossref/)

## License

MIT
