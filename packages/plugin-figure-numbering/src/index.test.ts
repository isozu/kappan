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
          { type: 'text', value: '{#fig:arch}' },
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
  it('wraps block figures in <figure> with a visible numbered <figcaption>', async () => {
    const plugin = figureNumbering();
    const tree = makeTree();
    await plugin.hooks.onMdast?.(tree, stubCtx);

    // 図1：段落が figure に変換され、img の alt は素の説明、番号は figcaption に出る。
    const fig1 = tree.children[1] as {
      data?: { hName?: string };
      children: Array<{
        type: string;
        alt?: string;
        data?: { hName?: string };
        children?: unknown[];
      }>;
    };
    expect(fig1.data?.hName).toBe('figure');
    const img1 = fig1.children[0]!;
    expect(img1.type).toBe('image');
    expect(img1.alt).toBe('構成図');
    const cap1 = fig1.children[1] as {
      data?: { hName?: string };
      children: Array<{ value: string }>;
    };
    expect(cap1.data?.hName).toBe('figcaption');
    expect(cap1.children[0]?.value).toBe('図1.1: 構成図');

    // 図2：連番が章内で進む。
    const fig2 = tree.children[3] as {
      data?: { hName?: string };
      children: Array<{ data?: { hName?: string }; children?: Array<{ value: string }> }>;
    };
    expect(fig2.data?.hName).toBe('figure');
    expect((fig2.children[1]?.children?.[0] as { value: string }).value).toBe('図1.2: 別の図');
  });

  it('keeps the number in alt for inline images followed by prose (no <figure>)', async () => {
    const plugin = figureNumbering();
    const tree: MdastRoot = {
      type: 'root',
      children: [
        { type: 'heading', depth: 1, children: [{ type: 'text', value: '第1章' }] },
        {
          type: 'paragraph',
          children: [
            { type: 'image', url: 'i.png', alt: 'アイコン', title: null },
            { type: 'text', value: '{#fig:icon} を本文に並べる。' },
          ],
        },
      ],
    };
    await plugin.hooks.onMdast?.(tree, stubCtx);
    const para = tree.children[1] as {
      data?: { hName?: string };
      children: Array<{ type: string; alt?: string; value?: string }>;
    };
    // インライン用法は figure に変換せず、従来どおり alt に番号を載せる。
    expect(para.data?.hName).toBeUndefined();
    expect(para.children[0]?.alt).toBe('図1.1: アイコン');
    expect(para.children[1]?.value).toBe(' を本文に並べる。');
  });

  it('numbers a GFM table with a {#tbl:id} caption paragraph into a <figure>', async () => {
    const plugin = figureNumbering();
    const tree: MdastRoot = {
      type: 'root',
      children: [
        { type: 'heading', depth: 1, children: [{ type: 'text', value: '第2章' }] },
        { type: 'paragraph', children: [{ type: 'text', value: '比較表 {#tbl:cmp}' }] },
        {
          type: 'table',
          align: [null, null],
          children: [
            {
              type: 'tableRow',
              children: [
                { type: 'tableCell', children: [{ type: 'text', value: 'A' }] },
                { type: 'tableCell', children: [{ type: 'text', value: 'B' }] },
              ],
            },
          ],
        },
        { type: 'paragraph', children: [{ type: 'text', value: '[@tbl:cmp] を参照。' }] },
      ],
    };
    await plugin.hooks.onMdast?.(tree, stubCtx);

    // caption 段落は消え、table が figure でラップされる。
    const fig = tree.children[1] as {
      type: string;
      data?: { hName?: string };
      children: Array<{
        type: string;
        data?: { hName?: string };
        children?: Array<{ value: string }>;
      }>;
    };
    expect(fig.data?.hName).toBe('figure');
    expect(fig.children[0]?.data?.hName).toBe('figcaption');
    expect(fig.children[0]?.children?.[0]?.value).toBe('表2.1: 比較表');
    expect(fig.children[1]?.type).toBe('table');

    // [@tbl:cmp] 参照が解決される。
    const ref = tree.children[2] as { children: Array<{ value: string }> };
    expect(ref.children[0]?.value).toBe('表2.1 を参照。');
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

    const fig1 = tree.children[1] as {
      children: Array<{ type: string; alt?: string; children?: Array<{ value: string }> }>;
    };
    expect(fig1.children[0]?.alt).toBe('構成図');
    expect(fig1.children[1]?.children?.[0]?.value).toBe('Fig.1.1: 構成図');

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
    const fig = tree.children[1] as {
      data?: { hName?: string };
      children: Array<{ type: string; alt?: string; children?: Array<{ value: string }> }>;
    };
    expect(fig.data?.hName).toBe('figure');
    expect(fig.children[0]?.alt).toBe('a');
    expect(fig.children[1]?.children?.[0]?.value).toBe('図5.1: a');
  });
});
