# @kappan/plugin-figure-numbering

図表の自動採番と相互参照解決プラグイン。Pandoc-crossref 互換の参照記法をサポートする。

- `![alt](path){#fig:id}` → 図番号 `図1.1` を alt に付与
- `[@fig:id]` → `図1.1` に置換

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

- 画像の alt が「`図1.1: システム構成図`」に
- 本文の `[@fig:arch]` が「`図1.1`」に

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
