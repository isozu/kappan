import { defineConfig } from '@kappan/core';
import { saiun } from '@kappan/themes-saiun';
import { reviewCompat } from '@kappan/plugin-review-compat';
import { figureNumbering } from '@kappan/plugin-figure-numbering';
import { kinsoku } from '@kappan/plugin-kinsoku';

// Re:VIEW の stylesheet: から転記したカスタム CSS（M2-B）
const customCss = `/* from custom.css */
/* Re:VIEW プロジェクト由来のカスタム CSS（stylesheet: custom.css）。
   migrate-review が theme: saiun({ additionalCss }) として転記する対象。 */
body {
  font-feature-settings: 'palt';
}

h1 {
  border-bottom: 2px solid #336;
}`;

export default defineConfig({
  metadata: {
    title: "実書籍風サンプル",
    creator: [
    { name: "技術書典執筆者", role: "aut" }
    ],
    language: "ja",
    publisher: "同人出版",
    date: "2026-05-26",
  },
  source: { entry: 'src/preface.md', baseDir: 'src/' },
  output: { dir: "dist/", filename: "real-world-book.epub" },
  theme: saiun({ additionalCss: customCss }),
  plugins: [reviewCompat(), figureNumbering(), kinsoku()],
});
