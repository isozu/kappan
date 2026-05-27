# @kappan/plugin-heading-number

見出しの自動採番プラグイン。章（h1）に「第N章」、節（h2 以下）に「N.M」「N.M.K」を付ける。

- `# はじめに` → `第1章　はじめに`
- `## 背景` → `1.1　背景`
- `### 詳細` → `1.1.1　詳細`

章番号は spine 順（章ファイルの並び）で採番するため、番号を持たない素の見出しだけの本でも
多章で正しく連番になる。既に「第N章」を書いている見出しはその番号を尊重する。

## Installation

```bash
pnpm add @kappan/plugin-heading-number
```

## Usage

```typescript
import { defineConfig } from '@kappan/core';
import { headingNumber } from '@kappan/plugin-heading-number';

export default defineConfig({
  // ...
  plugins: [headingNumber()],
});
```

## Markdown Example

```markdown
# はじめに

## 背景

### 動機
```

出力：

- `# はじめに` → `第1章　はじめに`
- `## 背景` → `1.1　背景`
- `### 動機` → `1.1.1　動機`

採番したくない見出しには `{-}`（または `{.unnumbered}`）を付ける：

```markdown
## 謝辞 {-}
```

## Options

```typescript
headingNumber({
  labelStyle: 'jp', // 'jp' (第1章 / 1.1) | 'en' (Chapter 1 / 1.1)
  numberChapter: true, // h1 に「第N章」を付ける（既定 true）
  maxDepth: 3, // 節番号を振る深さ（2〜4、既定 3 = h2・h3）
  startNumber: 1, // 開始章番号（既定 1）
  separator: '　', // 番号と本文の区切り（既定: 和=全角空白 / 英=半角空白）
});
```

## Notes

- 章番号は `onMdastAllChapters` で spine 順に採番する。素の h1 が複数章にわたる場合でも
  正しく連番になる。
- `@kappan/plugin-figure-numbering` と併用し図表番号にも章番号を反映させたい場合は、各章
  h1 に章番号を明記する（例 `# 第3章 タイトル`）。素の h1 を本プラグインで自動採番した場合、
  figure-numbering 側は章番号を 1 とみなすことがある。

## License

MIT
