import { describe, expect, it } from 'vitest';
import type { Root as MdastRoot } from 'mdast';
import {
  parseMarkdownToMdast,
  renderMdastToXhtml,
  buildChapterRegistry,
  CHAPTER_REGISTRY_CACHE_KEY,
  type ChapterRecord,
  type ChapterRegistry,
  type Diagnostic,
  type KappanConfig,
} from '@kappan/core';
import { column } from './index.js';

function makeSharedCtx() {
  const cache = new Map<string, unknown>();
  const emitted: Diagnostic[] = [];
  return {
    emitted,
    cache,
    ctx: {
      config: {} as KappanConfig,
      logger: { debug() {}, info() {}, warn() {}, error() {} },
      cache: {
        get<T>(k: string): T | undefined {
          return cache.get(k) as T | undefined;
        },
        set<T>(k: string, v: T) {
          cache.set(k, v);
        },
        delete(k: string) {
          return cache.delete(k);
        },
      },
      chapters: [],
      emit: (d: Diagnostic) => emitted.push(d),
    },
  };
}

function chapterRecord(id: string, path: string, spineIndex: number): ChapterRecord {
  return {
    id,
    path,
    spineIndex,
    kind: 'chapter',
    displayLabel: `第${spineIndex + 1}章`,
    rawTitle: id,
    numberedTitle: `第${spineIndex + 1}章　${id}`,
    sections: [],
  };
}

async function render(tree: MdastRoot): Promise<string> {
  return renderMdastToXhtml(tree, {
    title: 'T',
    language: 'ja',
    stylesheetHref: '../styles/theme.css',
    unsafeHtml: false,
  });
}

describe('column plugin', () => {
  it('renders :::column[title]{#col:id} as <aside epub:type="sidebar" class="admonition column">', async () => {
    const plugin = column();
    const tree = parseMarkdownToMdast(':::column[なぜ速いのか]{#col:why}\nコラム本文。\n:::\n');
    await plugin.hooks.onMdast?.(tree, makeSharedCtx().ctx);
    const xhtml = await render(tree);
    expect(xhtml).toContain('epub:type="sidebar"');
    expect(xhtml).toContain('class="admonition column"');
    expect(xhtml).toContain('id="col-why"');
    expect(xhtml).toContain('なぜ速いのか');
    expect(xhtml).toContain('コラム本文。');
  });

  it('resolves a same-chapter [@col:id] into a link to #col-id', async () => {
    const plugin = column();
    const { ctx } = makeSharedCtx();
    const tree = parseMarkdownToMdast(
      ':::column[なぜ速いのか]{#col:why}\n本文。\n:::\n\n詳しくは [@col:why] を参照。\n',
    );
    await plugin.hooks.onMdast?.(tree, ctx);
    await plugin.hooks.onMdastAllChapters?.([{ tree, path: 'ch01.md' }], ctx);
    const xhtml = await render(tree);
    expect(xhtml).toContain('href="#col-why"');
    expect(xhtml).toContain('コラム「なぜ速いのか」');
  });

  it('resolves a cross-chapter [@col:chapterId/id] into chapterId.xhtml#col-id', async () => {
    const plugin = column();
    const { ctx, cache } = makeSharedCtx();
    const t1 = parseMarkdownToMdast(':::column[専門用語]{#col:term}\n用語の説明。\n:::\n');
    const t2 = parseMarkdownToMdast('前章の [@col:ch01/term] を思い出そう。\n');
    await plugin.hooks.onMdast?.(t1, ctx);
    await plugin.hooks.onMdast?.(t2, ctx);

    const registry: ChapterRegistry = buildChapterRegistry([
      chapterRecord('ch01', 'ch01.md', 0),
      chapterRecord('ch02', 'ch02.md', 1),
    ]);
    cache.set(CHAPTER_REGISTRY_CACHE_KEY, registry);

    await plugin.hooks.onMdastAllChapters?.(
      [
        { tree: t1, path: 'ch01.md' },
        { tree: t2, path: 'ch02.md' },
      ],
      ctx,
    );
    const xhtml2 = await render(t2);
    expect(xhtml2).toContain('href="ch01.xhtml#col-term"');
    expect(xhtml2).toContain('コラム「専門用語」');
  });

  it('attaches columns to the ChapterRecord for the TOC', async () => {
    const plugin = column();
    const { ctx, cache } = makeSharedCtx();
    const tree = parseMarkdownToMdast(':::column[コラムA]{#col:a}\n本文。\n:::\n');
    await plugin.hooks.onMdast?.(tree, ctx);

    const record = chapterRecord('ch01', 'ch01.md', 0);
    cache.set(CHAPTER_REGISTRY_CACHE_KEY, buildChapterRegistry([record]));
    await plugin.hooks.onMdastAllChapters?.([{ tree, path: 'ch01.md' }], ctx);

    expect(record.columns).toBeDefined();
    expect(record.columns?.[0]).toMatchObject({ id: 'a', anchorId: 'col-a', title: 'コラムA' });
  });

  it('warns on an unresolved [@col:id]', async () => {
    const plugin = column();
    const { ctx, emitted } = makeSharedCtx();
    const tree = parseMarkdownToMdast('未定義の [@col:ghost] を参照。\n');
    await plugin.hooks.onMdast?.(tree, ctx);
    await plugin.hooks.onMdastAllChapters?.([{ tree, path: 'ch01.md' }], ctx);
    expect(
      emitted.some((d) => d.severity === 'warning' && d.message.includes('[@col:ghost]')),
    ).toBe(true);
  });
});
