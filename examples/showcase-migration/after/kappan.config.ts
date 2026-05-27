import { defineConfig } from '@kappan/core';
import { mono } from '@kappan/themes-mono';
import { reviewCompat } from '@kappan/plugin-review-compat';
import { figureNumbering } from '@kappan/plugin-figure-numbering';
import { kinsoku } from '@kappan/plugin-kinsoku';

export default defineConfig({
  metadata: {
    title: "Re:VIEW 移行デモ",
    creator: [
    { name: "霜月 あおい", role: "aut" }
    ],
    language: "ja",
    publisher: "活版書房",
    identifier: "urn:isbn:9784000000000",
    date: "2026-05-27",
  },
  source: { entry: 'src/preface.md', baseDir: 'src/' },
  output: { dir: "dist/", filename: "review-migration-demo.epub" },
  theme: mono(),
  plugins: [reviewCompat(), figureNumbering(), kinsoku()],
});
