import { describe, expect, it } from 'vitest';
import type {
  ChapterRegistry,
  Diagnostic,
  GeneratedDocument,
  KappanConfig,
} from '@kappan/core';
import { CHAPTER_REGISTRY_CACHE_KEY, buildChapterRegistry } from '@kappan/core';
import { toc } from './index.js';

function makeCtx(registry?: ChapterRegistry): {
  ctx: Parameters<NonNullable<ReturnType<typeof toc>['hooks']['onGenerate']>>[0];
  emitted: Diagnostic[];
} {
  const cache = new Map<string, unknown>();
  if (registry) cache.set(CHAPTER_REGISTRY_CACHE_KEY, registry);
  const emitted: Diagnostic[] = [];
  return {
    emitted,
    ctx: {
      config: { metadata: { language: 'ja' } } as KappanConfig,
      logger: { debug() {}, info() {}, warn() {}, error() {} },
      cache: {
        get<T>(k: string): T | undefined {
          return cache.get(k) as T | undefined;
        },
        set<T>(k: string, v: T): void {
          cache.set(k, v);
        },
        delete(k: string): boolean {
          return cache.delete(k);
        },
      },
      chapters: [],
      emit: (d: Diagnostic) => emitted.push(d),
    },
  };
}

describe('toc plugin', () => {
  it('emits a generated TOC document with before-bodymatter position by default', async () => {
    const plugin = toc();
    const registry = buildChapterRegistry([
      {
        id: 'ch01',
        path: 'ch01.md',
        spineIndex: 0,
        kind: 'chapter',
        chapterNumber: 1,
        displayLabel: '第1章',
        rawTitle: 'はじめに',
        numberedTitle: '第1章　はじめに',
        sections: [],
      },
      {
        id: 'ch02',
        path: 'ch02.md',
        spineIndex: 1,
        kind: 'chapter',
        chapterNumber: 2,
        displayLabel: '第2章',
        rawTitle: '本論',
        numberedTitle: '第2章　本論',
        sections: [],
      },
    ]);
    const { ctx } = makeCtx(registry);
    const docs = (await plugin.hooks.onGenerate?.(ctx)) as readonly GeneratedDocument[];
    expect(docs).toHaveLength(1);
    const doc = docs[0]!;
    expect(doc.id).toBe('gentoc');
    expect(doc.href).toBe('content/toc.xhtml');
    expect(doc.title).toBe('目次');
    expect(doc.position).toBe('before-bodymatter');
    expect(doc.xhtml).toContain('<a href="ch01.xhtml">第1章　はじめに</a>');
    expect(doc.xhtml).toContain('<a href="ch02.xhtml">第2章　本論</a>');
  });

  it('warns and emits no document when ChapterRegistry is missing', async () => {
    const plugin = toc();
    const { ctx, emitted } = makeCtx(undefined);
    const docs = (await plugin.hooks.onGenerate?.(ctx)) as readonly GeneratedDocument[];
    expect(docs).toHaveLength(0);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.severity).toBe('warning');
    expect(emitted[0]?.source).toBe('plugin-toc');
    expect(emitted[0]?.message).toContain('headingNumber');
  });

  it('respects custom title, depth, position, id and href options', async () => {
    const plugin = toc({
      title: 'Contents',
      depth: 2,
      position: 'after-bodymatter',
      id: 'mytoc',
      href: 'content/mytoc.xhtml',
    });
    const registry = buildChapterRegistry([
      {
        id: 'ch01',
        path: 'ch01.md',
        spineIndex: 0,
        kind: 'chapter',
        chapterNumber: 1,
        displayLabel: 'Chapter 1',
        rawTitle: 'Intro',
        numberedTitle: 'Chapter 1 Intro',
        sections: [
          {
            anchorId: 'ch01-s1',
            level: 2,
            number: '1.1',
            title: 'Background',
            numberedTitle: '1.1 Background',
          },
        ],
      },
    ]);
    const { ctx } = makeCtx(registry);
    const docs = (await plugin.hooks.onGenerate?.(ctx)) as readonly GeneratedDocument[];
    const doc = docs[0]!;
    expect(doc.id).toBe('mytoc');
    expect(doc.href).toBe('content/mytoc.xhtml');
    expect(doc.title).toBe('Contents');
    expect(doc.position).toBe('after-bodymatter');
    expect(doc.xhtml).toContain('<title>Contents</title>');
    expect(doc.xhtml).toContain('<a href="ch01.xhtml#ch01-s1">1.1 Background</a>');
  });

  it('does not include itself in the chapter list', async () => {
    const plugin = toc();
    const registry = buildChapterRegistry([
      {
        id: 'gentoc',
        path: 'gentoc.md',
        spineIndex: 0,
        kind: 'frontmatter',
        displayLabel: '',
        rawTitle: '目次',
        numberedTitle: '目次',
        sections: [],
      },
      {
        id: 'ch01',
        path: 'ch01.md',
        spineIndex: 1,
        kind: 'chapter',
        chapterNumber: 1,
        displayLabel: '第1章',
        rawTitle: 'はじめに',
        numberedTitle: '第1章　はじめに',
        sections: [],
      },
    ]);
    const { ctx } = makeCtx(registry);
    const docs = (await plugin.hooks.onGenerate?.(ctx)) as readonly GeneratedDocument[];
    const doc = docs[0]!;
    expect(doc.xhtml).not.toContain('<a href="gentoc.xhtml">');
    expect(doc.xhtml).toContain('<a href="ch01.xhtml">');
  });
});
