# @kappan/core

Kappan のパイプライン本体。Markdown → mdast → hast → XHTML への変換、設定読み込み、プラグインライフサイクル、EPUBCheck 連携を提供する。

## Installation

```bash
pnpm add @kappan/core
```

## Usage

```typescript
import { defineConfig, buildBook } from '@kappan/core';

const config = defineConfig({
  metadata: { title: '私の本', creator: [{ name: '著者' }] },
  source: { entry: 'src/index.md' },
  theme: /* テーマ */,
});

await buildBook({ config, configDir: '/path/to/book', outputPath: 'out.epub' });
```

書籍プロジェクトの作り方は本体リポジトリの `docs/quickstart.md` を、プラグインの書き方は `docs/plugin-authoring.md` を参照。

## Exports

- `defineConfig(input)`：設定の型補完と zod 検証
- `buildBook(opts)`：書籍全体のビルド
- `buildChapter(opts)`：単一章のビルド（preview server 等で利用）
- `definePlugin(input)`：プラグインのファクトリ定義
- `loadConfig(path)`：設定ファイルの動的読み込み
- 各種型（`KappanConfig`、`PluginContext`、`Diagnostic` 等）

## Documentation

- [Kappan リポジトリ](https://github.com/isozu/kappan)
- [プラグイン作者ガイド](https://github.com/isozu/kappan/blob/main/docs/plugin-authoring.md)

## License

MIT
