# @kappan/themes-saiun

Kappan の Saiun（彩雲）テーマ。技術書・実用書向け。明朝＋サンセリフ、青系アクセント、コードブロックは角丸グレー。情報密度と可読性のバランスを重視する。

## Installation

```bash
pnpm add @kappan/themes-saiun
```

## Usage

```typescript
import { defineConfig } from '@kappan/core';
import { saiun } from '@kappan/themes-saiun';

export default defineConfig({
  // ...
  theme: saiun({ accent: '#1f3a5f' }), // accent はオプション
});
```

## Customization

CSS カスタムプロパティを上書きすることで細部の調整ができる。

```css
:root {
  --saiun-accent: #2a4a7f;
  --saiun-text: #222;
}
```

## Documentation

- [Kappan リポジトリ](https://github.com/isozu/kappan)

## License

MIT
