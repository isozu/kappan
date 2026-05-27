# @kappan/themes-mono

Kappan の最小テーマ。装飾を抑えたベースライン構成で、本文は明朝、見出しはサンセリフ、コードは等幅で組む。

## Installation

```bash
pnpm add @kappan/themes-mono
```

## Usage

```typescript
import { defineConfig } from '@kappan/core';
import { mono } from '@kappan/themes-mono';

export default defineConfig({
  // ...
  theme: mono(),
});
```

## Documentation

- [Kappan リポジトリ](https://github.com/isozu/kappan)

## License

MIT（同梱されるシステムフォント参照はそれぞれのライセンスに従う）
