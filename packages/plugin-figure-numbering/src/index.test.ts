import { describe, expect, it } from 'vitest';
import type { Root as MdastRoot } from 'mdast';
import type { Diagnostic, KappanConfig } from '@kappan/core';
import { figureNumbering } from './index.js';

const stubCtx = {
  config: {} as KappanConfig,
  logger: { debug() {}, info() {}, warn() {}, error() {} },
  cache: { get: () => undefined, set: () => {}, delete: () => false },
  emit: (_d: Diagnostic) => {},
};

function makeTree(): MdastRoot {
  return {
    type: 'root',
    children: [
      {
        type: 'heading',
        depth: 1,
        children: [{ type: 'text', value: '第1章 はじめに' }],
      },
      {
        type: 'paragraph',
        children: [
          { type: 'image', url: 'img/a.png', alt: '構成図', title: null },
          { type: 'text', value: '{#fig:arch} を参照。' },
        ],
      },
      {
        type: 'paragraph',
        children: [{ type: 'text', value: '[@fig:arch] のとおりだ。' }],
      },
      {
        type: 'paragraph',
        children: [
          { type: 'image', url: 'img/b.png', alt: '別の図', title: null },
          { type: 'text', value: '{#fig:other}' },
        ],
      },
    ],
  };
}

describe('figureNumbering plugin', () => {
  it('numbers figures by chapter and assigns the chapter number from h1', async () => {
    const plugin = figureNumbering();
    const tree = makeTree();
    await plugin.hooks.onMdast?.(tree, stubCtx);

    const para1 = tree.children[1] as { children: Array<{ type: string; alt?: string }> };
    const img1 = para1.children[0]!;
    expect(img1.alt).toBe('図1.1: 構成図');

    const para3 = tree.children[3] as { children: Array<{ type: string; alt?: string }> };
    const img2 = para3.children[0]!;
    expect(img2.alt).toBe('図1.2: 別の図');
  });

  it('removes the {#fig:id} marker text from the paragraph', async () => {
    const plugin = figureNumbering();
    const tree = makeTree();
    await plugin.hooks.onMdast?.(tree, stubCtx);

    const para1 = tree.children[1] as { children: Array<{ type: string; value?: string }> };
    const markerText = para1.children[1]!;
    expect(markerText.value).not.toContain('{#fig:arch}');
    expect(markerText.value).toContain('を参照');
  });

  it('resolves [@fig:id] references to numbered labels', async () => {
    const plugin = figureNumbering();
    const tree = makeTree();
    await plugin.hooks.onMdast?.(tree, stubCtx);

    const para2 = tree.children[2] as { children: Array<{ type: string; value?: string }> };
    expect(para2.children[0]?.value).toBe('図1.1 のとおりだ。');
  });

  it('supports English label style', async () => {
    const plugin = figureNumbering({ labelStyle: 'en' });
    const tree = makeTree();
    await plugin.hooks.onMdast?.(tree, stubCtx);

    const para1 = tree.children[1] as { children: Array<{ type: string; alt?: string }> };
    expect(para1.children[0]?.alt).toBe('Fig.1.1: 構成図');

    const para2 = tree.children[2] as { children: Array<{ type: string; value?: string }> };
    expect(para2.children[0]?.value).toBe('Fig.1.1 のとおりだ。');
  });

  it('leaves unresolved references unchanged', async () => {
    const plugin = figureNumbering();
    const tree: MdastRoot = {
      type: 'root',
      children: [
        {
          type: 'heading',
          depth: 1,
          children: [{ type: 'text', value: '第2章' }],
        },
        {
          type: 'paragraph',
          children: [{ type: 'text', value: '[@fig:nonexistent] は未定義。' }],
        },
      ],
    };
    await plugin.hooks.onMdast?.(tree, stubCtx);
    const p = tree.children[1] as { children: Array<{ value: string }> };
    expect(p.children[0]?.value).toContain('[@fig:nonexistent]');
  });

  it('resolves [@chap:id] across chapters via onMdastAllChapters', async () => {
    const plugin = figureNumbering();
    // 章 1: id=ch01, ch1 と sec を定義
    const ch1: MdastRoot = {
      type: 'root',
      children: [
        {
          type: 'heading',
          depth: 1,
          children: [{ type: 'text', value: '第1章 イントロ {#ch01}' }],
        },
        {
          type: 'heading',
          depth: 2,
          children: [{ type: 'text', value: '概要 {#sec:overview}' }],
        },
        {
          type: 'paragraph',
          children: [{ type: 'text', value: '[@sec:overview] を参照。' }],
        },
      ],
    };
    // 章 2: 章 1 への cross-chapter 参照
    const ch2: MdastRoot = {
      type: 'root',
      children: [
        {
          type: 'heading',
          depth: 1,
          children: [{ type: 'text', value: '第3章 応用 {#ch03}' }],
        },
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              value: '[@chap:ch01] と [@sec:ch01/overview] を参照。',
            },
          ],
        },
      ],
    };
    // Mutable ctx with shared cache
    const cache = new Map<string, unknown>();
    const sharedCtx = {
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
      emit: (_d: Diagnostic) => {},
    };
    await plugin.hooks.onMdast?.(ch1, sharedCtx);
    await plugin.hooks.onMdast?.(ch2, sharedCtx);
    await plugin.hooks.onMdastAllChapters?.(
      [
        { path: 'ch01.md', tree: ch1 },
        { path: 'ch02.md', tree: ch2 },
      ],
      sharedCtx,
    );
    // 章1の同章 sec 参照は onMdast 中に解決済
    const p1 = ch1.children[2] as { children: Array<{ value: string }> };
    expect(p1.children[0]?.value).toContain('節1.1');
    // 章2の chap 参照は onMdastAllChapters で解決
    const p2 = ch2.children[1] as { children: Array<{ value: string }> };
    expect(p2.children[0]?.value).toContain('第1章');
    // 章2の sec ch01/overview も onMdastAllChapters で解決
    expect(p2.children[0]?.value).toContain('節1.1');
  });

  it('uses chapter number from h1 text', async () => {
    const plugin = figureNumbering();
    const tree: MdastRoot = {
      type: 'root',
      children: [
        {
          type: 'heading',
          depth: 1,
          children: [{ type: 'text', value: '第5章 タイトル' }],
        },
        {
          type: 'paragraph',
          children: [
            { type: 'image', url: 'x.png', alt: 'a', title: null },
            { type: 'text', value: '{#fig:x}' },
          ],
        },
      ],
    };
    await plugin.hooks.onMdast?.(tree, stubCtx);
    const para = tree.children[1] as { children: Array<{ type: string; alt?: string }> };
    expect(para.children[0]?.alt).toBe('図5.1: a');
  });
});
