import { defineConfig } from '@kappan/core';
import { mono } from '@kappan/themes-mono';

export default defineConfig({
  metadata: {
    title: 'Minimal CommonMark',
    creator: [{ name: 'Kappan Team', fileAs: 'Kappan Team' }],
    language: 'ja',
    identifier: 'urn:uuid:00000000-0000-0000-0000-000000000000',
  },
  source: { entry: 'src/01-headings.md', baseDir: 'src/' },
  output: { dir: 'dist/', filename: '{title}.epub' },
  theme: mono(),
});
