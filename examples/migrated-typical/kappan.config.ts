import { defineConfig } from '@kappan/core';
import { mono } from '@kappan/themes-mono';
import { reviewCompat } from '@kappan/plugin-review-compat';

export default defineConfig({
  plugins: [reviewCompat()],
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
});
