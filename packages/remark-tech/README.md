# @kappan/remark-tech

Kappan の公式プラグイン。技術書向けの拡張記法を提供する。shiki によるシンタックスハイライトを提供する。

## Installation

```bash
pnpm add @kappan/remark-tech
```

## Usage

```typescript
import { defineConfig } from '@kappan/core';
import { shikiHighlight } from '@kappan/remark-tech';

export default defineConfig({
  // ...
  plugins: [shikiHighlight({ theme: 'github-light' })],
});
```

## shikiHighlight Options

```typescript
shikiHighlight({
  theme: 'github-light', // BundledTheme の任意
});
```

`theme` には shiki のすべての BundledTheme 名（`github-dark`、`one-dark-pro`、`vitesse-light` 等）が指定できる。

## Documentation

- [shiki](https://shiki.style/)
- [Kappan リポジトリ](https://github.com/isozu/kappan)

## License

MIT
