import { defineConfig } from '@kappan/core';
import { saiun } from '@kappan/themes-saiun';
import { shikiHighlight } from '@kappan/remark-tech';
import { ruby, kenten } from '@kappan/remark-jp';
import { figureNumbering } from '@kappan/plugin-figure-numbering';
import { kinsoku } from '@kappan/plugin-kinsoku';

export default defineConfig({
  plugins: [
    figureNumbering(),
    ruby(),
    kenten(),
    shikiHighlight({ theme: 'github-light' }),
    kinsoku(),
  ],
  metadata: {
    title: 'Kappan ユーザーマニュアル',
    creator: [{ name: 'Kappan プロジェクト', fileAs: 'Kappan プロジェクト' }],
    language: 'ja',
    publisher: '活版書房',
    identifier: 'urn:uuid:6b6e3a2e-1c1d-4f1e-8a1a-000000000001',
    date: '2026-05-26',
    accessibility: {
      features: ['structuralNavigation', 'tableOfContents', 'alternativeText'],
      hazards: ['none'],
      summary:
        '本書は構造的ナビゲーション、目次、画像の代替テキストを備えた、アクセシブルな技術解説書である。',
    },
  },
  source: { entry: 'src/01-introduction.md', baseDir: 'src/' },
  output: { dir: 'dist/', filename: 'kappan-manual.epub' },
  theme: saiun(),
});
