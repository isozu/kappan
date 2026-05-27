import { defineConfig } from '@kappan/core';
import { saiun } from '@kappan/themes-saiun';
import { reviewCompat } from '@kappan/plugin-review-compat';
import { ruby, kenten } from '@kappan/remark-jp';
import { shikiHighlight, katexMath } from '@kappan/remark-tech';
import { figureNumbering } from '@kappan/plugin-figure-numbering';
import { kinsoku } from '@kappan/plugin-kinsoku';
import { jpIndex } from '@kappan/plugin-jp-index';

/**
 * showcase-techbook — 横組み技術書ショーケース。
 *
 * Kappan で商業レベルの横組み技術書がどこまで書けるかを示す完成見本。
 * shiki によるコードハイライト、図表番号と章間相互参照、巻末索引、KaTeX 数式、
 * 脚注、ルビ・圏点を、Saiun（彩雲）テーマで一冊にまとめている。
 *
 * プラグイン順序は意味を持つ：
 *   - jpIndex を figureNumbering より前に置く。索引アンカーは見出しの `{#chXX}` を
 *     参照するため、figureNumbering がそれを除去する前に採番する必要がある。
 *   - figureNumbering を katexMath より前に置く。数式番号 `{#eq:id}` は `$$..$$` の
 *     直後段落で拾うため、KaTeX が `$$` を変換する前に採番する必要がある。
 */
export default defineConfig({
  metadata: {
    title: 'Kappan で技術書を書く',
    subtitle: '横組みテクニカルライティングの実践',
    creator: [{ name: '海老原 涼介', fileAs: '海老原 涼介', role: 'aut' }],
    language: 'ja',
    publisher: '活版書房',
    identifier: 'urn:uuid:9a3c1d10-0000-4000-8000-00000000c001',
    date: '2026-05-27',
    accessibility: {
      features: ['structuralNavigation', 'tableOfContents', 'alternativeText', 'MathML'],
      hazards: ['none'],
      summary:
        '本書は構造的ナビゲーション、目次、画像の代替テキスト、MathML 数式を備えた、アクセシブルな横組み技術書である。',
    },
  },
  source: { entry: 'src/index.md', baseDir: 'src/' },
  output: { dir: 'dist/', filename: 'kappan-techbook.epub' },
  theme: saiun({ accent: '#1f3a5f' }),
  plugins: [
    reviewCompat({ warnOnUnsupported: false }),
    ruby(),
    kenten(),
    jpIndex(),
    figureNumbering(),
    katexMath(),
    shikiHighlight({ theme: 'github-light' }),
    kinsoku(),
  ],
});
