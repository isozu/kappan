import { defineConfig } from '@kappan/core';
import { saiun } from '@kappan/themes-saiun';
import { headingNumber } from '@kappan/plugin-heading-number';
import { admonition } from '@kappan/plugin-admonition';
import { column } from '@kappan/plugin-column';
import { jpIndex } from '@kappan/plugin-jp-index';
import { figureNumbering } from '@kappan/plugin-figure-numbering';
import { toc } from '@kappan/plugin-toc';
import { ruby, kenten } from '@kappan/remark-jp';
import { shikiHighlight, katexMath } from '@kappan/remark-tech';
import { kinsoku } from '@kappan/plugin-kinsoku';

/**
 * showcase-all-features — Kappan の「全部入り」ショーケース（横組み・彩雲テーマ）。
 *
 * 1 冊に主要記法をすべて詰め込んだ完成見本。README のヒーロー画像
 * （screenshots/all-features.png）の出どころでもあり、ビルドが通ること自体が
 * 全プラグイン結合の回帰テストになる。縦組み専用の見せ場（縦中横の実描画・会話文の
 * 字下げ）は showcase-novel が担うので、本例は横組みで網羅する。
 *
 * プラグイン順序には意味がある：
 *   - headingNumber を先頭に。章レジストリ（ChapterRegistry）を publish し、
 *     column / toc がそれを参照する。
 *   - column は headingNumber の後（目次掲載・章跨ぎ参照にレジストリが要る）。
 *   - jpIndex を figureNumbering より前に。索引アンカーは見出しの `{#chXX}` を
 *     読むため、figureNumbering がそれを除去する前に採番する。
 *   - figureNumbering を katexMath より前に。数式番号 `{#eq:id}` は `$$..$$` の
 *     直後段落で拾うため、KaTeX が `$$` を変換する前に採番する。
 */
export default defineConfig({
  metadata: {
    title: 'Kappan 全部入りショーケース',
    subtitle: '主要記法を一冊で確かめる',
    creator: [{ name: 'Kappan Team', fileAs: 'Kappan Team', role: 'aut' }],
    language: 'ja',
    publisher: '活版書房',
    identifier: 'urn:uuid:a11fea70-0000-4000-8000-00000000a11f',
    date: '2026-05-31',
    accessibility: {
      features: ['structuralNavigation', 'tableOfContents', 'alternativeText', 'MathML'],
      hazards: ['none'],
      summary:
        '本書は構造的ナビゲーション、目次、画像の代替テキスト、MathML 数式を備えたアクセシブルな横組み見本である。',
    },
  },
  source: { entry: 'src/index.md', baseDir: 'src/' },
  output: { dir: 'dist/', filename: 'kappan-all-features.epub' },
  theme: saiun({ accent: '#1f3a5f' }),
  plugins: [
    headingNumber(),
    admonition(),
    column(),
    jpIndex(),
    figureNumbering(),
    katexMath(),
    shikiHighlight({ theme: 'github-light' }),
    kenten(),
    ruby(),
    kinsoku(),
    toc({ depth: 2 }),
  ],
});
