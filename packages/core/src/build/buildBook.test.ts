import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as unzipper from 'unzipper';
import { defineConfig } from '../config/defineConfig.js';
import { buildBook } from './buildBook.js';

const stubTheme = {
  name: '@kappan/themes-stub',
  version: '0.0.0',
  async getAssets() {
    return new Map<string, Uint8Array>([
      ['styles/theme.css', new TextEncoder().encode('body { font-family: serif; }')],
    ]);
  },
};

let workDir: string;
let epubPath: string;

beforeAll(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), 'kappan-buildbook-'));
  const srcDir = path.join(workDir, 'src');
  await mkdir(srcDir, { recursive: true });

  await writeFile(
    path.join(srcDir, '01-intro.md'),
    `---
title: 第1章 はじめに
id: ch01
next: 02-design.md
---

# 第1章 はじめに

これは最初の章である。
`,
  );

  await writeFile(
    path.join(srcDir, '02-design.md'),
    `---
title: 第2章 設計
id: ch02
---

# 第2章 設計

これは2つ目の章である。
`,
  );

  const config = defineConfig({
    metadata: {
      title: 'ビルドテスト書籍',
      creator: [{ name: '山田 太郎', fileAs: 'やまだたろう' }],
      identifier: 'urn:uuid:11111111-2222-3333-4444-555555555555',
    },
    source: { entry: 'src/01-intro.md', baseDir: 'src/' },
    theme: stubTheme,
  });

  epubPath = path.join(workDir, 'dist', 'test.epub');
  await buildBook({
    config,
    configDir: workDir,
    outputPath: epubPath,
    now: new Date('2026-01-01T00:00:00Z'),
  });
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

async function readEntry(epubPath: string, name: string): Promise<string> {
  const buffer = await readFile(epubPath);
  const directory = await unzipper.Open.buffer(buffer);
  const file = directory.files.find((f) => f.path === name);
  if (!file) throw new Error(`Entry not found: ${name}`);
  return (await file.buffer()).toString('utf-8');
}

async function listEntries(epubPath: string): Promise<string[]> {
  const buffer = await readFile(epubPath);
  const directory = await unzipper.Open.buffer(buffer);
  return directory.files.map((f) => f.path).sort();
}

describe('buildBook', () => {
  it('produces an EPUB with both chapters in spine order', async () => {
    const entries = await listEntries(epubPath);
    expect(entries).toContain('mimetype');
    expect(entries).toContain('META-INF/container.xml');
    expect(entries).toContain('EPUB/package.opf');
    expect(entries).toContain('EPUB/nav.xhtml');
    expect(entries).toContain('EPUB/content/ch01.xhtml');
    expect(entries).toContain('EPUB/content/ch02.xhtml');
    expect(entries).toContain('EPUB/styles/theme.css');
  });

  it('spine in package.opf reflects front-matter "next" order', async () => {
    const opf = await readEntry(epubPath, 'EPUB/package.opf');
    const ch01Idx = opf.indexOf('idref="ch01"');
    const ch02Idx = opf.indexOf('idref="ch02"');
    expect(ch01Idx).toBeGreaterThan(0);
    expect(ch02Idx).toBeGreaterThan(ch01Idx);
  });

  it('chapter XHTML contains rendered Markdown', async () => {
    const ch01 = await readEntry(epubPath, 'EPUB/content/ch01.xhtml');
    expect(ch01).toContain('<h1>第1章 はじめに</h1>');
    expect(ch01).toContain('これは最初の章である');
    expect(ch01).toContain('xml:lang="ja"');
    expect(ch01).toContain('rel="stylesheet"');
    expect(ch01).toContain('href="../styles/theme.css"');
  });

  it('nav.xhtml lists chapters in toc', async () => {
    const nav = await readEntry(epubPath, 'EPUB/nav.xhtml');
    expect(nav).toContain('epub:type="toc"');
    expect(nav).toContain('第1章 はじめに');
    expect(nav).toContain('第2章 設計');
  });

  it('package.opf contains stable identifier and modified', async () => {
    const opf = await readEntry(epubPath, 'EPUB/package.opf');
    expect(opf).toContain('urn:uuid:11111111-2222-3333-4444-555555555555');
    expect(opf).toContain('2026-01-01T00:00:00Z');
  });

  it('contains default accessibility metadata when not specified', async () => {
    const opf = await readEntry(epubPath, 'EPUB/package.opf');
    expect(opf).toContain('property="schema:accessibilityFeature"');
    expect(opf).toContain('structuralNavigation');
    expect(opf).toContain('tableOfContents');
    expect(opf).toContain('property="schema:accessibilityHazard"');
    expect(opf).toContain('none');
  });
});
