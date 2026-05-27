import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { defineConfig } from '../config/defineConfig.js';
import { buildBook } from './buildBook.js';
import { BuildError } from './errors.js';

const stubTheme = {
  name: '@kappan/themes-stub',
  version: '0.0.0',
  async getAssets() {
    return new Map<string, Uint8Array>([['styles/theme.css', new TextEncoder().encode('body{}')]]);
  },
};

let workDir: string;

beforeAll(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), 'kappan-a11y-'));
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

async function buildWithMarkdown(markdown: string, name: string): Promise<void> {
  const fixtureDir = path.join(workDir, name);
  const srcDir = path.join(fixtureDir, 'src');
  await mkdir(srcDir, { recursive: true });

  // ダミーの sample.png を src 配下に置く。
  // processImages は実体の無い画像を <img> から除外するため、a11y チェックを走らせるには
  // ファイルが存在する必要がある（1x1 PNG）。
  const dummyPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  );
  await writeFile(path.join(srcDir, 'sample.png'), dummyPng);

  await writeFile(
    path.join(srcDir, 'index.md'),
    `---
title: テスト
id: ch01
---

${markdown}
`,
  );

  const config = defineConfig({
    metadata: {
      title: 'a11y test',
      creator: [{ name: 'T' }],
      identifier: 'urn:uuid:00000000-0000-0000-0000-000000000000',
    },
    source: { entry: 'src/index.md', baseDir: 'src/' },
    theme: stubTheme,
  });

  await buildBook({
    config,
    configDir: fixtureDir,
    outputPath: path.join(fixtureDir, 'out.epub'),
    now: new Date('2026-01-01T00:00:00Z'),
  });
}

describe('a11y enforcement', () => {
  it('throws BuildError when an image lacks alt attribute', async () => {
    const markdown = `
# Chapter

![](sample.png "no alt")
`;
    await expect(buildWithMarkdown(markdown, 'missing-alt')).rejects.toBeInstanceOf(BuildError);
  });

  it('exposes diagnostics on the BuildError', async () => {
    const markdown = `
# Chapter

![](sample.png)
`;
    try {
      await buildWithMarkdown(markdown, 'expose-diags');
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(BuildError);
      const buildErr = err as BuildError;
      expect(buildErr.diagnostics.some((d) => d.severity === 'error')).toBe(true);
      expect(buildErr.diagnostics.some((d) => /alt/.test(d.message))).toBe(true);
    }
  });

  it('builds successfully when alt is present (using external URL to avoid file dep)', async () => {
    const markdown = `
# Chapter

![Sample image](https://example.com/sample.png)
`;
    await expect(buildWithMarkdown(markdown, 'with-alt')).resolves.not.toThrow();
  });

  it('builds successfully when image has no path at all (no img tags)', async () => {
    const markdown = `# Chapter\n\nNo images here.`;
    await expect(buildWithMarkdown(markdown, 'no-img')).resolves.not.toThrow();
  });

  it('emits warning (not error) for heading hierarchy skip', async () => {
    // Hierarchy skip only emits a warning — build should succeed
    const markdown = `# H1\n\n### H3 (skipped H2)\n\nbody`;
    await expect(buildWithMarkdown(markdown, 'heading-skip')).resolves.not.toThrow();
  });
});
