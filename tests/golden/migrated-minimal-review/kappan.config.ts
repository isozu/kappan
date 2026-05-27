import { defineConfig } from '@kappan/core';
import { mono } from '@kappan/themes-mono';
import { reviewCompat } from '@kappan/plugin-review-compat';
import { figureNumbering } from '@kappan/plugin-figure-numbering';
import { kinsoku } from '@kappan/plugin-kinsoku';

export default defineConfig({
  metadata: {
    title: "最小サンプル",
    creator: [
    { name: "山田太郎", role: "aut" }
    ],
    language: "ja",
  },
  source: { entry: 'src/preface.md', baseDir: 'src/' },
  output: { dir: "dist/", filename: "minimal-book.epub" },
  theme: mono(),
  plugins: [reviewCompat(), figureNumbering(), kinsoku()],
});
