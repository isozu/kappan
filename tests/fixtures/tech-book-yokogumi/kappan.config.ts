import { defineConfig } from '@kappan/core';
import { saiun } from '@kappan/themes-saiun';
import { reviewCompat } from '@kappan/plugin-review-compat';
import { figureNumbering } from '@kappan/plugin-figure-numbering';
import { kinsoku } from '@kappan/plugin-kinsoku';
import { jpIndex } from '@kappan/plugin-jp-index';
import { ruby, kenten } from '@kappan/remark-jp';
import { katexMath } from '@kappan/remark-tech';

/**
 * tech-book-yokogumi — M1-D / M2-B 完了基準用の架空技術書フィクスチャ（横組み）。
 *
 * 6 章構成・図表・コードブロック・脚注・ルビ・圏点・図表番号を含むほか、M2-B で
 * 章節相互参照（sec/eq/chap）、巻末索引（jp-index）、KaTeX 数式を追加し、
 * 「Saiun テーマで商業技術書として通用するか」を判定するための基準フィクスチャ。
 */
export default defineConfig({
  metadata: {
    title: 'Tech Book Yokogumi',
    subtitle: 'Saiun テーマで作る横組み技術書サンプル',
    creator: [{ name: 'Kappan Team', fileAs: 'Kappan Team', role: 'aut' }],
    language: 'ja',
    publisher: 'Kappan Sample Press',
    identifier: 'urn:uuid:00000000-0000-0000-0000-00000000d000',
    coverImage: 'assets/images/cover.png',
  },
  source: { entry: 'src/index.md', baseDir: 'src/' },
  output: { dir: 'dist/', filename: '{title}.epub' },
  theme: saiun({ accent: '#1f3a5f' }),
  plugins: [
    reviewCompat({ warnOnUnsupported: false }),
    ruby(),
    kenten(),
    // jpIndex を figureNumbering より前に置く：索引アンカーのリンク先解決に h1 の
    // `{#chXX}` を読む必要があり、figureNumbering がそれを除去する前に走らせる。
    jpIndex(),
    // figureNumbering を katexMath より前に置く：数式番号 {#eq:id} は $$..$$ の
    // 直後段落で拾うため、KaTeX が $$ を div に変換する前に採番する必要がある。
    figureNumbering(),
    katexMath(),
    kinsoku(),
  ],
});
