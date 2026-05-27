import { defineConfig } from '@kappan/core';
import { sumi } from '@kappan/themes-sumi';
import { kinsoku } from '@kappan/plugin-kinsoku';
import { tcySmart } from '@kappan/plugin-tcy-smart';
import { readerShim } from '@kappan/plugin-reader-shim';
import { ruby, kenten, punctuation, dialogue } from '@kappan/remark-jp';

/**
 * showcase-novel — Kappan で縦書き小説を商業品質に組む完成見本。
 *
 * Sumi（墨）テーマ + 縦組みプラグインセットで、オリジナル短編「灯台守の最後の夜」を
 * vertical-rl に組む。ルビ・圏点・縦中横・連続約物・会話文／地の文を自然な本文の中に
 * 織り込み、`pnpm kappan build --validate` で EPUBCheck エラーゼロを満たすことを示す。
 *
 * プラグインの順序：
 *   - kenten を ruby より前に置く。圏点 span の中にルビ（`[消えゆく{灯|ともしび}]{.kenten}`）が
 *     入る場合、ruby が先だとテキストが分断され span を捕捉できないため。
 *     （kenten 側も兄弟跨ぎに堅牢化済みで順序非依存だが、意図を明示するため前に置く。）
 *   - punctuation を kinsoku より前に置き、連続約物（―― / ……）を先に 1 span にまとめてから
 *     禁則の改行禁止 span を付与する（renzoku span 内を分割しない）。
 */
export default defineConfig({
  metadata: {
    title: '灯台守の最後の夜',
    subtitle: 'Kappan 縦書き小説ショーケース',
    creator: [{ name: '霜月 灯', fileAs: 'シモツキ アカリ', role: 'aut' }],
    language: 'ja',
    publisher: 'Kappan Sample Press',
    identifier: 'urn:uuid:00000000-0000-0000-0000-0000000000b1',
    accessibility: {
      features: ['structuralNavigation', 'tableOfContents', 'readingOrder'],
      hazards: ['none'],
      summary:
        '本作は構造的ナビゲーションと目次を備え、縦組み（vertical-rl）で組まれたアクセシブルな短編小説である。',
    },
  },
  source: { entry: 'src/index.md', baseDir: 'src/' },
  output: { dir: 'dist/', filename: '{title}.epub' },
  writingMode: 'vertical-rl',
  theme: sumi(),
  plugins: [
    kenten(),
    ruby(),
    punctuation(),
    dialogue(),
    tcySmart(),
    kinsoku(),
    readerShim(),
  ],
});
