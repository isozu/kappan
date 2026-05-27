import { describe, expect, it } from 'vitest';
import type { Root as MdastRoot, Heading } from 'mdast';
import type { Diagnostic, KappanConfig } from '@kappan/core';
import { headingNumber } from './index.js';

const ctx = {
  config: {} as KappanConfig,
  logger: { debug() {}, info() {}, warn() {}, error() {} },
  cache: { get: () => undefined, set: () => {}, delete: () => false },
  emit: (_d: Diagnostic) => {},
};

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
});
