# クイックスタート

このドキュメントは Kappan で**書籍著者**が最初に EPUB を出力するまでの手順を示す。

> **実行場所について**
> `@kappan/*` パッケージは npm 公開準備済み。本リポジトリをクローンする場合は `pnpm kappan ...` をルートで実行し、書籍プロジェクトには `--config /absolute/path/to/your-book/kappan.config.ts` で指す。npm 公開後は書籍プロジェクトのディレクトリで `npx kappan build` を直接実行できる。グローバルインストールも `npm i -g @kappan/cli` で可能。

## 必要環境

- Node.js 20 LTS 以上（`.nvmrc` で 20.19.6 を指定）
- pnpm 10 以上（Corepack で解決）
- Java 17 以上（EPUBCheck を走らせる場合のみ）

## 5 分で動かす

```bash
git clone https://github.com/isozu/kappan.git
cd kappan
corepack enable
pnpm install

# 同梱の最小フィクスチャをビルド
pnpm kappan build --config tests/fixtures/minimal-commonmark/kappan.config.ts

# tests/fixtures/minimal-commonmark/dist/Minimal\ CommonMark.epub が生成される
```

生成された `.epub` を Apple Books / Thorium Reader などで開いて確認できる。

## EPUBCheck で検証する

```bash
# EPUBCheck JAR をローカルキャッシュ ~/.kappan/tools/epubcheck/ に取得
pnpm epubcheck:fetch

# ビルド時に検証を走らせる
pnpm kappan build --config tests/fixtures/minimal-commonmark/kappan.config.ts --validate
```

期待出力：

```
✓ Built tests/fixtures/minimal-commonmark/dist/Minimal CommonMark.epub
✓ EPUBCheck: 0 errors, 0 warnings
```

## 独自の書籍を作る

任意のディレクトリに以下を配置する。

```
my-book/
├── kappan.config.ts
└── src/
    ├── 01-intro.md
    └── 02-design.md
```

`kappan.config.ts`：

```typescript
import { defineConfig } from '@kappan/core';
import { mono } from '@kappan/themes-mono';

export default defineConfig({
  metadata: {
    title: '私の本',
    creator: [{ name: '著者名', fileAs: 'ちょしゃめい' }],
    language: 'ja',
    identifier: 'urn:uuid:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  },
  source: { entry: 'src/01-intro.md', baseDir: 'src/' },
  theme: mono(),
});
```

`src/01-intro.md`（front-matter で次の章を指定）：

```markdown
---
title: 第1章 はじめに
id: ch01
next: 02-design.md
---

# 第1章 はじめに

本文を書く。
```

`src/02-design.md`：

```markdown
---
title: 第2章 設計
id: ch02
---

# 第2章 設計

本文を書く。
```

ビルド：

```bash
pnpm kappan build --config /path/to/my-book/kappan.config.ts
```

## 画像の取り扱い

Markdown の画像参照（`![alt text](path/to/image.png)`）は、章ファイルからの相対パスでローカル画像を指せる。`alt` 属性は必須で、空の場合は装飾画像として `role="presentation"` を付ける必要がある（空 alt はビルドエラー）。

## ライブプレビュー

執筆中にブラウザで即時反映を見るには：

```bash
pnpm kappan preview --config /path/to/my-book/kappan.config.ts
# → http://127.0.0.1:5173 を開く
```

`.md` を保存すると **中央値 7.2 ms** で章本文がリロードされる。エラーは画面上部に赤いオーバーレイで表示され、warning / info の diagnostics は下部パネルに流れる。

## Saiun テーマと公式プラグインを使う

本格的な技術書見た目には `@kappan/themes-saiun`（彩雲）と 4 つの公式プラグインを組み合わせる：

```typescript
import { defineConfig } from '@kappan/core';
import { saiun } from '@kappan/themes-saiun';
import { reviewCompat } from '@kappan/plugin-review-compat';
import { ruby, kenten } from '@kappan/remark-jp';
import { shikiHighlight } from '@kappan/remark-tech';
import { figureNumbering } from '@kappan/plugin-figure-numbering';
import { kinsoku } from '@kappan/plugin-kinsoku';

export default defineConfig({
  metadata: {
    title: '私の本',
    creator: [{ name: '著者名', fileAs: 'ちょしゃめい' }],
    language: 'ja',
    identifier: 'urn:uuid:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  },
  source: { entry: 'src/01-intro.md', baseDir: 'src/' },
  theme: saiun({ accent: '#1f3a5f' }),
  plugins: [
    reviewCompat(),
    ruby(),
    kenten(),
    shikiHighlight({ theme: 'github-light' }),
    figureNumbering(),
    kinsoku(),
  ],
});
```

これで以下が有効になる：

- `{漢字|かんじ}` 形式のルビ
- `[重要]{.kenten}` 形式の圏点（傍点）
- コードブロックの shiki シンタックスハイライト
- 画像の `{#fig:id}` 自動採番と `[@fig:id]` 相互参照
- JLReq 準拠の禁則処理

## アクセシビリティ検証

EPUBCheck に加えて、ACE by DAISY で詳細チェック：

```bash
# 初回のみ optionalDependencies をインストール
pnpm add -w @daisy/ace-core @daisy/ace-axe-runner-puppeteer

# ACE 検証付きビルド
pnpm kappan build --config /path/to/my-book/kappan.config.ts --ace

# critical / serious があれば exit 2 で失敗
pnpm kappan build --config /path/to/my-book/kappan.config.ts --ace --ace-strict
```

## ベンチマークを取る

```bash
pnpm bench --iterations 10
```

出力は JSON 形式で標準出力に流れる。`--output bench-results/$(date +%s).json` で保存可能。PR 用の回帰判定は `pnpm bench:compare --baseline X.json --candidate Y.json`（Welch's t-test + IQR 1.5× + 累積 15% 劣化判定）。

## 既存 Re:VIEW プロジェクトを持っている場合

`.re` ファイルや `config.yml`、`catalog.yml` を持つプロジェクトは、`kappan migrate` で一括変換できる。

```bash
pnpm kappan migrate /path/to/my-review-book
```

インライン 25+ 種、ブロック 18+ 種、catalog 4 セクションを受理。詳細は [`migrating-from-review.md`](./migrating-from-review.md) を参照。
