import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as unzipper from 'unzipper';
import { packageEpub } from './packageEpub.js';
import { buildNavXhtml } from './buildNavXhtml.js';
import type { EpubPackage } from './types.js';

const fixture: EpubPackage = {
  metadata: {
    title: 'Test EPUB',
    creators: [{ name: 'Tester', role: 'aut' }],
    language: 'ja',
    identifier: 'urn:uuid:00000000-0000-0000-0000-000000000000',
    date: '2026-01-01',
    modified: '2026-01-01T00:00:00Z',
    accessibility: {
      features: ['tableOfContents'],
      accessModes: ['textual'],
      hazards: ['none'],
      summary: 'Test summary.',
    },
  },
  manifest: [
    { id: 'nav', href: 'nav.xhtml', mediaType: 'application/xhtml+xml', properties: ['nav'] },
    { id: 'ch01', href: 'content/ch01.xhtml', mediaType: 'application/xhtml+xml' },
  ],
  spine: [{ idref: 'ch01', linear: true }],
  resources: new Map<string, string>([
    ['nav.xhtml', buildNavXhtml([{ href: 'content/ch01.xhtml', title: 'Chapter 1' }], 'ja')],
    [
      'content/ch01.xhtml',
      `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="ja">
<head><meta charset="utf-8"/><title>Chapter 1</title></head>
<body><h1>Chapter 1</h1><p>Hello, EPUB.</p></body>
</html>`,
    ],
  ]),
};

let workDir: string;
let epubPath: string;

beforeAll(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), 'kappan-epub-test-'));
  epubPath = path.join(workDir, 'test.epub');
  await packageEpub({ pkg: fixture, outputPath: epubPath });
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

async function readEntries(
  epubPath: string,
): Promise<Map<string, { content: string; method: string }>> {
  const buffer = await readFile(epubPath);
  const directory = await unzipper.Open.buffer(buffer);
  const entries = new Map<string, { content: string; method: string }>();
  for (const file of directory.files) {
    const content = await file.buffer();
    // compressionMethod: 0 = store (uncompressed), 8 = deflate
    const method = file.compressionMethod === 0 ? 'store' : 'deflate';
    entries.set(file.path, { content: content.toString('utf-8'), method });
  }
  return entries;
}

describe('packageEpub', () => {
  it('produces a ZIP file at the requested path', async () => {
    const buffer = await readFile(epubPath);
    expect(buffer.byteLength).toBeGreaterThan(0);
    // ZIP magic number: PK\x03\x04
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
    expect(buffer[2]).toBe(0x03);
    expect(buffer[3]).toBe(0x04);
  });

  it('places mimetype as the first entry, uncompressed', async () => {
    const buffer = await readFile(epubPath);
    // mimetype must start at byte 30 (local file header is 30 bytes + filename)
    // Easier: parse and check it's first and stored
    const directory = await unzipper.Open.buffer(buffer);
    const first = directory.files[0];
    expect(first?.path).toBe('mimetype');
    expect(first?.compressionMethod).toBe(0); // STORE
    const content = await first!.buffer();
    expect(content.toString('utf-8')).toBe('application/epub+zip');
  });

  it('contains required EPUB structure', async () => {
    const entries = await readEntries(epubPath);
    expect(entries.has('mimetype')).toBe(true);
    expect(entries.has('META-INF/container.xml')).toBe(true);
    expect(entries.has('EPUB/package.opf')).toBe(true);
    expect(entries.has('EPUB/nav.xhtml')).toBe(true);
    expect(entries.has('EPUB/content/ch01.xhtml')).toBe(true);
  });

  it('container.xml points at EPUB/package.opf', async () => {
    const entries = await readEntries(epubPath);
    const container = entries.get('META-INF/container.xml');
    expect(container?.content).toContain('full-path="EPUB/package.opf"');
  });

  it('package.opf contains required metadata', async () => {
    const entries = await readEntries(epubPath);
    const opf = entries.get('EPUB/package.opf')!.content;
    expect(opf).toContain('<dc:title>Test EPUB</dc:title>');
    expect(opf).toContain('<dc:identifier id="pub-id">');
    expect(opf).toContain('property="dcterms:modified"');
    expect(opf).toContain('property="schema:accessibilityFeature"');
  });
});
