import path from 'node:path';
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { Command, Option } from 'clipanion';

/**
 * `kappan init` — テンプレートから新規 Kappan プロジェクトを生成する。
 *
 * 3 種類のテンプレートを提供する：
 *   - tech-book: Saiun + reviewCompat + figureNumbering + kinsoku + ruby + kenten
 *   - novel: Mono（縦組みの Sumi に対応次第切替）+ kinsoku + ruby + kenten
 *   - manual: Mono（Hibana に対応次第切替）+ figureNumbering + kinsoku
 *
 * Sumi / Kohaku / Hibana は縦組み対応の完了で正式テーマになる予定。それまでは
 * 既存テーマ（Mono / Saiun）で代用し、kappan.config.ts の冒頭コメントで明示する。
 */
export type InitTemplate = 'tech-book' | 'novel' | 'manual';

const TEMPLATES: ReadonlyArray<InitTemplate> = ['tech-book', 'novel', 'manual'];

export class InitCommand extends Command {
  static override paths = [['init']];

  static override usage = Command.Usage({
    description: 'Bootstrap a new Kappan project from a template.',
    examples: [
      ['Tech book (Saiun)', 'kappan init --template tech-book my-book'],
      ['Novel (Sumi, M2-A 以降; M2-D では Mono で代用)', 'kappan init --template novel my-novel'],
      [
        'Manual (Hibana, M2-A 以降; M2-D では Mono で代用)',
        'kappan init --template manual my-manual',
      ],
    ],
  });

  /** プロジェクトディレクトリ。省略時はカレント `.`。 */
  target = Option.String({ required: false });

  template = Option.String('--template,-t', 'tech-book', {
    description: `Template (one of: ${TEMPLATES.join(', ')})`,
  });

  title = Option.String('--title', {
    description: 'Book title for metadata.title',
  });

  author = Option.String('--author', {
    description: 'Author name for metadata.creator',
  });

  force = Option.Boolean('--force,-f', false, {
    description: 'Overwrite target directory if it is non-empty',
  });

  async execute(): Promise<number> {
    if (!isInitTemplate(this.template)) {
      this.context.stderr.write(
        `✗ Unknown template "${this.template}". Choose one of: ${TEMPLATES.join(', ')}\n`,
      );
      return 2;
    }

    const target = path.resolve(this.target ?? '.');
    if (existsSync(target)) {
      const entries = await readdir(target);
      const nonHidden = entries.filter((e) => !e.startsWith('.'));
      if (nonHidden.length > 0 && !this.force) {
        this.context.stderr.write(
          `✗ Target directory is not empty: ${target}\n  Use --force to overwrite.\n`,
        );
        return 1;
      }
    }

    const title = this.title ?? defaultTitle(this.template);
    const author = this.author ?? 'Anonymous';
    const files = buildTemplate(this.template, { title, author });

    await mkdir(target, { recursive: true });
    for (const [relPath, content] of files) {
      const abs = path.join(target, relPath);
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, content, 'utf-8');
    }

    this.context.stdout.write(`✓ Created Kappan project at ${target}\n`);
    this.context.stdout.write(`  Template: ${this.template}\n`);
    this.context.stdout.write(`  Files: ${files.length}\n`);
    this.context.stdout.write(`\nNext steps:\n`);
    this.context.stdout.write(`  cd ${path.relative(process.cwd(), target) || '.'}\n`);
    this.context.stdout.write(`  pnpm kappan build --validate\n`);
    return 0;
  }
}

function isInitTemplate(s: string): s is InitTemplate {
  return (TEMPLATES as readonly string[]).includes(s);
}

function defaultTitle(template: InitTemplate): string {
  switch (template) {
    case 'tech-book':
      return 'My Tech Book';
    case 'novel':
      return 'My Novel';
    case 'manual':
      return 'My Manual';
  }
}

interface TemplateContext {
  readonly title: string;
  readonly author: string;
}

/**
 * テンプレートを生成し、`[relativePath, content]` の配列を返す。
 *
 * 各テンプレートは最低 3 ファイル：
 *   - kappan.config.ts
 *   - src/index.md（先頭章）
 *   - .gitignore
 *
 * tech-book と manual は images/ を空ディレクトリとして、`.gitkeep` も置く。
 */
export function buildTemplate(
  template: InitTemplate,
  ctx: TemplateContext,
): Array<readonly [string, string]> {
  const out: Array<readonly [string, string]> = [];

  out.push(['kappan.config.ts', renderConfig(template, ctx)]);
  out.push(['.gitignore', GITIGNORE]);
  out.push(['README.md', renderReadme(template, ctx)]);
  out.push(['src/index.md', renderIndexChapter(template, ctx)]);
  if (template === 'tech-book') {
    out.push(['src/chap01.md', renderTechBookChapter01(ctx)]);
    out.push(['images/.gitkeep', '']);
  } else if (template === 'novel') {
    out.push(['src/chap01.md', renderNovelChapter01(ctx)]);
  } else {
    out.push(['src/chap01.md', renderManualChapter01(ctx)]);
    out.push(['images/.gitkeep', '']);
  }

  return out;
}

const GITIGNORE = `node_modules/
dist/
*.epub
.DS_Store
`;

function renderConfig(template: InitTemplate, ctx: TemplateContext): string {
  switch (template) {
    case 'tech-book':
      return TECH_BOOK_CONFIG(ctx);
    case 'novel':
      return NOVEL_CONFIG(ctx);
    case 'manual':
      return MANUAL_CONFIG(ctx);
  }
}

const TECH_BOOK_CONFIG = (
  ctx: TemplateContext,
): string => `import { defineConfig } from '@kappan/core';
import { saiun } from '@kappan/themes-saiun';
import { reviewCompat } from '@kappan/plugin-review-compat';
import { figureNumbering } from '@kappan/plugin-figure-numbering';
import { kinsoku } from '@kappan/plugin-kinsoku';
import { ruby, kenten } from '@kappan/remark-jp';
// 索引を使うなら有効化（巻末に <nav epub:type="index"> を追加）：
//   import { jpIndex } from '@kappan/plugin-jp-index';
// 数式を使うなら有効化（\$...\$ / \$\$...\$\$。Kindle 向けは output: 'htmlAndMathml'）：
//   import { katexMath } from '@kappan/remark-tech';

/**
 * tech-book テンプレート（kappan init --template tech-book）。
 *
 * Saiun（青系アクセント、明朝＋サンセリフ）+ 公式プラグイン 5 種で
 * 横組み技術書を組む。Kohaku（M2-A 以降）も使えるようになったら theme を差し替える。
 *
 * 索引・数式・見出し採番は使う書籍だけ追加する：
 *   - 索引: plugins に jpIndex() を足す（docs/howto/build-index.md）
 *   - 数式: plugins に katexMath() を足す。Kindle 向けは katexMath({ output: 'htmlAndMathml' })
 *           （docs/howto/add-katex-math.md）
 *   - 見出し採番: plugins に headingNumber() を足す（第N章 / 1.1 を自動付与。
 *           @kappan/plugin-heading-number を import）
 */
export default defineConfig({
  metadata: {
    title: ${jsonString(ctx.title)},
    creator: [{ name: ${jsonString(ctx.author)}, role: 'aut' }],
    language: 'ja',
  },
  source: { entry: 'src/index.md', baseDir: 'src/' },
  output: { dir: 'dist/', filename: '{title}.epub' },
  theme: saiun(),
  plugins: [
    reviewCompat({ warnOnUnsupported: false }),
    ruby(),
    kenten(),
    figureNumbering(),
    kinsoku(),
    // jpIndex(),   // 索引を使うなら
    // katexMath(), // 数式を使うなら（Kindle: katexMath({ output: 'htmlAndMathml' })）
    // headingNumber(), // 見出し自動採番（第N章 / 1.1）を使うなら
  ],
});
`;

const NOVEL_CONFIG = (ctx: TemplateContext): string => `import { defineConfig } from '@kappan/core';
import { mono } from '@kappan/themes-mono';
import { kinsoku } from '@kappan/plugin-kinsoku';
import { ruby, kenten } from '@kappan/remark-jp';

/**
 * novel テンプレート（kappan init --template novel）。
 *
 * Sumi（縦組み、墨流し）は M2-A で実装予定。M2-D 時点では Mono で代用し、
 * ルビ・圏点・禁則処理だけで小説本文を組む。Sumi が出たら theme を差し替える：
 *
 *   import { sumi } from '@kappan/themes-sumi';
 *   theme: sumi(),
 *   writingMode: 'vertical-rl',
 */
export default defineConfig({
  metadata: {
    title: ${jsonString(ctx.title)},
    creator: [{ name: ${jsonString(ctx.author)}, role: 'aut' }],
    language: 'ja',
  },
  source: { entry: 'src/index.md', baseDir: 'src/' },
  output: { dir: 'dist/', filename: '{title}.epub' },
  theme: mono(),
  plugins: [ruby(), kenten(), kinsoku()],
});
`;

const MANUAL_CONFIG = (
  ctx: TemplateContext,
): string => `import { defineConfig } from '@kappan/core';
import { mono } from '@kappan/themes-mono';
import { figureNumbering } from '@kappan/plugin-figure-numbering';
import { kinsoku } from '@kappan/plugin-kinsoku';
import { ruby } from '@kappan/remark-jp';

/**
 * manual テンプレート（kappan init --template manual）。
 *
 * Hibana（実用書向け、暖色アクセント）は M2-A 以降で実装予定。M2-D 時点では
 * Mono で代用し、図表番号・ルビ・禁則処理を最低限有効化する。
 *
 * 見出し（第N章 / 1.1）を自動採番したいときは headingNumber() を plugins に足す
 * （@kappan/plugin-heading-number を import）。
 */
export default defineConfig({
  metadata: {
    title: ${jsonString(ctx.title)},
    creator: [{ name: ${jsonString(ctx.author)}, role: 'aut' }],
    language: 'ja',
  },
  source: { entry: 'src/index.md', baseDir: 'src/' },
  output: { dir: 'dist/', filename: '{title}.epub' },
  theme: mono(),
  plugins: [ruby(), figureNumbering(), kinsoku()],
});
`;

function renderReadme(template: InitTemplate, ctx: TemplateContext): string {
  return `# ${ctx.title}

Kappan 製の${templateLabelJa(template)}。

## ビルド

\`\`\`bash
pnpm kappan build
pnpm kappan build --validate   # EPUBCheck も実行
\`\`\`

## プレビュー

\`\`\`bash
pnpm kappan preview
\`\`\`

## ライセンス

未設定。
`;
}

function templateLabelJa(t: InitTemplate): string {
  switch (t) {
    case 'tech-book':
      return '技術書（横組み、Saiun テーマ）';
    case 'novel':
      return '小説（Mono 暫定、Sumi/縦組みは M2-A 以降）';
    case 'manual':
      return '実用書（Mono 暫定、Hibana は M2-A 以降）';
  }
}

function renderIndexChapter(template: InitTemplate, ctx: TemplateContext): string {
  return `---
title: ${ctx.title}
id: index
chapterNumber: 1
next: chap01.md
---

# ${ctx.title}

${
  template === 'tech-book'
    ? 'Kappan の `tech-book` テンプレートから生成された技術書のひな型。'
    : template === 'novel'
      ? 'Kappan の `novel` テンプレートから生成された小説のひな型。'
      : 'Kappan の `manual` テンプレートから生成された実用書のひな型。'
}

著者：${ctx.author}
`;
}

function renderTechBookChapter01(_ctx: TemplateContext): string {
  return `---
title: はじめての章
id: chap01
chapterNumber: 2
---

# はじめての章 {#chap01}

これは Kappan の \`tech-book\` テンプレートに含まれる最初の章です。

## コードブロック

\`\`\`typescript
export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
\`\`\`

## 図表番号

\`![図のキャプション](images/diagram.png){#fig:overview}\` のように書くと、
\`[@fig:overview]\` で参照できます（M2-B 完了後）。

## 次は

- \`pnpm kappan preview\` で書きながら確認する
- \`docs/howto/\` の各ガイドを読む
`;
}

function renderNovelChapter01(_ctx: TemplateContext): string {
  return `---
title: 第一章
id: chap01
chapterNumber: 2
---

# 第一章

これは Kappan の \`novel\` テンプレートに含まれる最初の章です。

{活版|かっぱん}印刷の比喩に立ち戻ろう。本文では、ルビは \`{漢字|かんじ}\`、
圏点は \`[語]{.kenten}\` で記述できます。

## 段落の例

会話と地の文を混ぜた段落のサンプルです。「Kappan で書く小説、楽しみだね」と、
彼女は[呟いた]{.kenten}。

## 次は

- M2-A で Sumi テーマ + 縦組みが提供される予定です
`;
}

function renderManualChapter01(_ctx: TemplateContext): string {
  return `---
title: はじめに
id: chap01
chapterNumber: 2
---

# はじめに {#chap01}

これは Kappan の \`manual\` テンプレートに含まれる最初の章です。

## 構成

実用書では「目次が深くなる」傾向があるため、見出し階層を 2〜3 段で揃えると
読みやすくなります。

## 図表

\`![図のキャプション](images/diagram.png){#fig:overview}\` のように書くと、
\`[@fig:overview]\` で参照できます（M2-B 完了後）。

## 次は

- M2-A で Hibana テーマ（暖色アクセント）が提供される予定です
`;
}

function jsonString(s: string): string {
  return JSON.stringify(s);
}
