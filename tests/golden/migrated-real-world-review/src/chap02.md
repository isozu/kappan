---
title: 第2章 実装
id: chap02
chapterNumber: 3
next: chap03.md
---
# 第2章 実装 {#implementation}

<a id="list-main"></a>
**主処理**
```typescript
import { buildBook } from '@kappan/core';

export async function main() {
  await buildBook({
    config: loadConfig(),
    outputPath: 'book.epub',
  });
}
```

:::note[NOTE]
M1 では `buildBook` と `buildChapter` の2つを公開している。
:::

:::warning
EPUBCheck を通さない EPUB は商業流通に出さないこと。
:::

詳細は //list[main] を参照。[^note1] に補足を記す。

[^note1]: 設計判断は ADR-0001 で記録している。
