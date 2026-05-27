# @kappan/epub-packager

EPUB 3.3 の ZIP コンテナ・OPF・NAV・container.xml を組み立てる低レベルパッケージ。通常は `@kappan/core` の `buildBook` 経由で利用する。

## Installation

```bash
pnpm add @kappan/epub-packager
```

## Usage

```typescript
import { packageEpub, type EpubPackage } from '@kappan/epub-packager';

const pkg: EpubPackage = {
  metadata: {
    /* dc:title, dc:identifier, etc. */
  },
  manifest: [
    /* ManifestEntry[] */
  ],
  spine: [
    /* SpineEntry[] */
  ],
  resources: new Map([
    /* path -> bytes/string */
  ]),
};

await packageEpub({ pkg, outputPath: 'book.epub' });
```

## Exports

- `packageEpub(opts)`：ZIP コンテナの生成（mimetype 非圧縮ルール対応）
- `buildContainerXml(rootfilePath?)`：META-INF/container.xml
- `buildPackageOpf(metadata, manifest, spine)`：EPUB/package.opf
- `buildNavXhtml(entries, language?)`：EPUB/nav.xhtml
- 各種型（`EpubPackage`、`Metadata`、`ManifestEntry`、`SpineEntry`）

## Documentation

- [Kappan リポジトリ](https://github.com/isozu/kappan)

## License

MIT
