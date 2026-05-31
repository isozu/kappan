import { describe, expect, it } from 'vitest';
import type { Root as MdastRoot, Heading } from 'mdast';
import type {
  ChapterMeta,
  ChapterRegistry,
  Diagnostic,
  KappanConfig,
} from '@kappan/core';
import { CHAPTER_REGISTRY_CACHE_KEY } from '@kappan/core';
import { headingNumber } from './index.js';

const ctx = {
  config: {} as KappanConfig,
  logger: { debug() {}, info() {}, warn() {}, error() {} },
  cache: { get: () => undefined, set: () => {}, delete: () => false },
  chapters: [],
  emit: (_d: Diagnostic) => {},
};

interface RichCtx {
  readonly emitted: Diagnostic[];
  readonly cache: Map<string, unknown>;
  readonly ctx: {
    readonly config: KappanConfig;
    readonly logger: { debug(): void; info(): void; warn(): void; error(): void };
    readonly cache: {
      get<T>(k: string): T | undefined;
      set<T>(k: string, v: T): void;
      delete(k: string): boolean;
    };
    readonly chapters: readonly ChapterMeta[];
    readonly emit: (d: Diagnostic) => void;
  };
}

function makeRichCtx(chapters: readonly ChapterMeta[]): RichCtx {
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
        set<T>(k: string, v: T): void {
          cache.set(k, v);
        },
        delete(k: string): boolean {
          return cache.delete(k);
        },
      },
      chapters,
      emit: (d: Diagnostic) => emitted.push(d),
    },
  };
}

function meta(opts: {
  id: string;
  path: string;
  index: number;
  title?: string;
  chapterNumber?: number;
  kind?: 'chapter' | 'frontmatter' | 'backmatter' | 'appendix';
}): ChapterMeta {
  return {
    id: opts.id,
    relativePath: opts.path,
    spineIndex: opts.index,
    title: opts.title ?? opts.id,
    frontmatter: {
      id: opts.id,
      ...(opts.title !== undefined ? { title: opts.title } : {}),
      ...(opts.chapterNumber !== undefined ? { chapterNumber: opts.chapterNumber } : {}),
      ...(opts.kind !== undefined ? { kind: opts.kind } : {}),
    },
  };
}

function chapter(...headings: Array<[number, string]>): MdastRoot {
  return {
    type: 'root',
    children: headings.map(([depth, value]) => ({
      type: 'heading',
      depth,
      children: [{ type: 'text', value }],
    })) as Heading[],
  };
}

function text(tree: MdastRoot, idx: number): string {
  const h = tree.children[idx] as Heading;
  return (h.children[0] as { value: string }).value;
}

describe('headingNumber plugin', () => {
  it('numbers a bare chapter and its sections', async () => {
    const plugin = headingNumber();
    const tree = chapter([1, 'はじめに'], [2, '背景'], [2, '目的'], [3, '詳細']);
    await plugin.hooks.onMdastAllChapters?.([{ path: 'ch01.md', tree }], ctx);
    expect(text(tree, 0)).toBe('第1章　はじめに');
    expect(text(tree, 1)).toBe('1.1　背景');
    expect(text(tree, 2)).toBe('1.2　目的');
    expect(text(tree, 3)).toBe('1.2.1　詳細');
  });

  it('numbers multiple chapters in spine order', async () => {
    const plugin = headingNumber();
    const ch1 = chapter([1, '導入'], [2, '概要']);
    const ch2 = chapter([1, '本論'], [2, '理論'], [2, '実践']);
    await plugin.hooks.onMdastAllChapters?.(
      [
        { path: 'ch01.md', tree: ch1 },
        { path: 'ch02.md', tree: ch2 },
      ],
      ctx,
    );
    expect(text(ch1, 0)).toBe('第1章　導入');
    expect(text(ch1, 1)).toBe('1.1　概要');
    expect(text(ch2, 0)).toBe('第2章　本論');
    expect(text(ch2, 1)).toBe('2.1　理論');
    expect(text(ch2, 2)).toBe('2.2　実践');
  });

  it('respects an explicit 第N章 and continues numbering from it', async () => {
    const plugin = headingNumber();
    const ch1 = chapter([1, '第3章 応用'], [2, '節']);
    const ch2 = chapter([1, '続き'], [2, '節']);
    await plugin.hooks.onMdastAllChapters?.(
      [
        { path: 'a.md', tree: ch1 },
        { path: 'b.md', tree: ch2 },
      ],
      ctx,
    );
    // 既存の「第3章」はそのまま、節は 3.x。
    expect(text(ch1, 0)).toBe('第3章 応用');
    expect(text(ch1, 1)).toBe('3.1　節');
    // 次章は 4 から自動採番。
    expect(text(ch2, 0)).toBe('第4章　続き');
    expect(text(ch2, 1)).toBe('4.1　節');
  });

  it('skips headings marked with {-} / {.unnumbered}', async () => {
    const plugin = headingNumber();
    const tree = chapter([1, 'まえがき {-}'], [2, '謝辞 {.unnumbered}'], [2, '本節']);
    await plugin.hooks.onMdastAllChapters?.([{ path: 'pre.md', tree }], ctx);
    // 章が除外されると章番号も節番号も振らない。
    expect(text(tree, 0)).toBe('まえがき');
    expect(text(tree, 1)).toBe('謝辞');
    expect(text(tree, 2)).toBe('本節');
  });

  it('does not number the chapter when numberChapter is false (sections only)', async () => {
    const plugin = headingNumber({ numberChapter: false });
    const tree = chapter([1, 'はじめに'], [2, '背景']);
    await plugin.hooks.onMdastAllChapters?.([{ path: 'c.md', tree }], ctx);
    expect(text(tree, 0)).toBe('はじめに');
    expect(text(tree, 1)).toBe('1.1　背景');
  });

  it('supports English label style', async () => {
    const plugin = headingNumber({ labelStyle: 'en' });
    const tree = chapter([1, 'Intro'], [2, 'Background']);
    await plugin.hooks.onMdastAllChapters?.([{ path: 'c.md', tree }], ctx);
    expect(text(tree, 0)).toBe('Chapter 1 Intro');
    expect(text(tree, 1)).toBe('1.1 Background');
  });

  it('limits section depth via maxDepth', async () => {
    const plugin = headingNumber({ maxDepth: 2 });
    const tree = chapter([1, '章'], [2, '節'], [3, '小節']);
    await plugin.hooks.onMdastAllChapters?.([{ path: 'c.md', tree }], ctx);
    expect(text(tree, 1)).toBe('1.1　節');
    // h3 は maxDepth=2 のため採番されない。
    expect(text(tree, 2)).toBe('小節');
  });

  it('prefers front-matter id "ch05" over spine order for chapter number', async () => {
    const plugin = headingNumber();
    const ch1 = chapter([1, 'はじめに'], [2, '節']);
    const ch2 = chapter([1, '本論']);
    const { ctx: rich } = makeRichCtx([
      meta({ id: 'ch05', path: 'a.md', index: 0, title: 'はじめに' }),
      meta({ id: 'ch07', path: 'b.md', index: 1, title: '本論' }),
    ]);
    await plugin.hooks.onMdastAllChapters?.(
      [
        { path: 'a.md', tree: ch1 },
        { path: 'b.md', tree: ch2 },
      ],
      rich,
    );
    expect(text(ch1, 0)).toBe('第5章　はじめに');
    expect(text(ch1, 1)).toBe('5.1　節');
    expect(text(ch2, 0)).toBe('第7章　本論');
  });

  it('respects explicit front-matter chapterNumber override above all other sources', async () => {
    const plugin = headingNumber();
    const ch = chapter([1, 'タイトル {#ch01}']);
    const { ctx: rich } = makeRichCtx([
      meta({ id: 'ch01', path: 'a.md', index: 0, title: 'タイトル', chapterNumber: 42 }),
    ]);
    await plugin.hooks.onMdastAllChapters?.([{ path: 'a.md', tree: ch }], rich);
    expect(text(ch, 0)).toBe('第42章　タイトル');
  });

  it('emits warning diagnostic when front-matter id digit and {#chXX} marker disagree', async () => {
    const plugin = headingNumber();
    const ch = chapter([1, 'タイトル {#ch05}']);
    const { ctx: rich, emitted } = makeRichCtx([
      meta({ id: 'ch07', path: 'a.md', index: 0, title: 'タイトル' }),
    ]);
    await plugin.hooks.onMdastAllChapters?.([{ path: 'a.md', tree: ch }], rich);
    expect(text(ch, 0)).toBe('第7章　タイトル'); // front-matter id wins
    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.severity).toBe('warning');
    expect(emitted[0]?.source).toBe('heading-number');
    expect(emitted[0]?.message).toContain('h1 marker {#chNN}=5');
  });

  it('publishes a ChapterRegistry on ctx.cache with numbered titles and section anchors', async () => {
    const plugin = headingNumber();
    const ch1 = chapter([1, 'はじめに {#ch01}'], [2, '背景'], [2, '目的']);
    const ch2 = chapter([1, '本論 {#ch02}'], [2, '理論']);
    const { ctx: rich, cache } = makeRichCtx([
      meta({ id: 'ch01', path: 'ch01.md', index: 0, title: 'はじめに' }),
      meta({ id: 'ch02', path: 'ch02.md', index: 1, title: '本論' }),
    ]);
    await plugin.hooks.onMdastAllChapters?.(
      [
        { path: 'ch01.md', tree: ch1 },
        { path: 'ch02.md', tree: ch2 },
      ],
      rich,
    );
    const registry = cache.get(CHAPTER_REGISTRY_CACHE_KEY) as ChapterRegistry;
    expect(registry).toBeDefined();
    expect(registry.records).toHaveLength(2);
    const r1 = registry.byId.get('ch01')!;
    expect(r1.chapterNumber).toBe(1);
    expect(r1.displayLabel).toBe('第1章');
    expect(r1.rawTitle).toBe('はじめに');
    expect(r1.numberedTitle).toBe('第1章　はじめに');
    expect(r1.sections).toHaveLength(2);
    expect(r1.sections[0]?.number).toBe('1.1');
    expect(r1.sections[0]?.title).toBe('背景');
    expect(r1.sections[0]?.anchorId).toBe('ch01-s1');
    expect(r1.sections[0]?.numberedTitle).toBe('1.1　背景');
    expect(registry.byId.get('ch02')?.chapterNumber).toBe(2);
  });

  it('strips {#chXX} marker from rendered h1 text', async () => {
    const plugin = headingNumber();
    const ch = chapter([1, 'タイトル {#ch01}']);
    await plugin.hooks.onMdastAllChapters?.([{ path: 'ch01.md', tree: ch }], ctx);
    expect(text(ch, 0)).toBe('第1章　タイトル');
  });

  it('treats kind!==chapter as unnumbered (does not consume auto counter)', async () => {
    const plugin = headingNumber();
    const front = chapter([1, '凡例']);
    const ch1 = chapter([1, '本論']);
    const { ctx: rich } = makeRichCtx([
      meta({ id: 'frontmatter', path: 'fm.md', index: 0, title: '凡例', kind: 'frontmatter' }),
      meta({ id: 'ch01', path: 'ch01.md', index: 1, title: '本論' }),
    ]);
    await plugin.hooks.onMdastAllChapters?.(
      [
        { path: 'fm.md', tree: front },
        { path: 'ch01.md', tree: ch1 },
      ],
      rich,
    );
    expect(text(front, 0)).toBe('凡例'); // 採番されない
    expect(text(ch1, 0)).toBe('第1章　本論'); // auto は 1 のまま
  });
});
