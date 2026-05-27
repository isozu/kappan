# @kappan/remark-jp

Kappan の公式プラグイン。日本語組版のための拡張記法を提供する。

- `ruby`：`{漢字|かんじ}` → `<ruby>漢字<rt>かんじ</rt></ruby>`
- `kenten`：`[重要]{.kenten}` → `<em class="kenten">重要</em>`

## Installation

```bash
pnpm add @kappan/remark-jp
```

## Usage

```typescript
import { defineConfig } from '@kappan/core';
import { ruby, kenten } from '@kappan/remark-jp';

export default defineConfig({
  // ...
  plugins: [ruby(), kenten()],
});
```

## ruby Options

```typescript
ruby({ enablePipeSyntax: true }); // デフォルト true
```

`enablePipeSyntax: false` で `{漢字|かんじ}` 記法を無効化できる（属性記法のみを使いたいケース向け、属性記法は別途プラグインで実装予定）。

## Documentation

- [Kappan リポジトリ](https://github.com/isozu/kappan)

## License

MIT
