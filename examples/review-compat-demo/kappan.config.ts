import { defineConfig } from '@kappan/core';
import { saiun } from '@kappan/themes-saiun';
import { reviewCompat } from '@kappan/plugin-review-compat';
import { shikiHighlight } from '@kappan/remark-tech';
import { ruby, kenten } from '@kappan/remark-jp';

/**
 * Re:VIEW 互換レイヤーのデモ。
 * 既存の Re:VIEW 原稿を最小修正で Kappan に持ち込めることを示す。
 *
 * プラグイン順序が重要：
 *   1. reviewCompat (syntax) で Re:VIEW 記法を Markdown に前処理
 *   2. ruby / kenten (typography) で日本語拡張記法を解決
 *   3. shikiHighlight (typography) でコードハイライト
 */
export default defineConfig({
  plugins: [reviewCompat(), ruby(), kenten(), shikiHighlight({ theme: 'github-light' })],
  metadata: {
    title: 'Re:VIEW 互換レイヤーデモ',
    creator: [{ name: 'Kappan プロジェクト', fileAs: 'Kappan プロジェクト' }],
    language: 'ja',
    publisher: '活版書房',
    identifier: 'urn:uuid:e5b9a3c2-1d2e-4f3a-8b4c-000000000010',
    date: '2026-05-26',
  },
  source: { entry: 'src/01-intro.md', baseDir: 'src/' },
  output: { dir: 'dist/', filename: 'review-compat-demo.epub' },
  theme: saiun(),
});
