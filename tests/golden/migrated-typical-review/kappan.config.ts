import { defineConfig } from '@kappan/core';
import { mono } from '@kappan/themes-mono';
import { reviewCompat } from '@kappan/plugin-review-compat';
import { figureNumbering } from '@kappan/plugin-figure-numbering';
import { kinsoku } from '@kappan/plugin-kinsoku';

export default defineConfig({
  metadata: {
    title: "典型サンプル書籍",
    creator: [
    { name: "著者A", role: "aut" },
    { name: "著者B", role: "aut" }
    ],
    language: "ja",
    publisher: "活版書房",
    identifier: "urn:isbn:9784123456789",
    date: "2026-05-26",
  },
  source: { entry: 'src/preface.md', baseDir: 'src/' },
  output: { dir: "dist/", filename: "typical-book.epub" },
  theme: mono(),
  plugins: [reviewCompat(), figureNumbering(), kinsoku()],
});
