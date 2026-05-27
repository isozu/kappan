import { defineConfig } from '@kappan/core';
import { mono } from '@kappan/themes-mono';

export default defineConfig({
  metadata: {
    title: 'Footnotes And Html',
    creator: [{ name: 'Kappan Team', fileAs: 'Kappan Team' }],
    language: 'ja',
    identifier: 'urn:uuid:00000000-0000-0000-0000-00000000000b',
  },
  source: { entry: 'src/index.md', baseDir: 'src/' },
  output: { dir: 'dist/', filename: '{title}.epub' },
  theme: mono(),
  // M1-B: HTML 埋め込みを sanitized モードで許可する。
  // <div class="note"> 等の安全な要素は通り、<script> 等は除去される。
  unsafeHtml: 'sanitized',
});
