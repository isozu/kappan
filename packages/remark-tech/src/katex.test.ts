import { describe, expect, it } from 'vitest';
import type { Root as MdastRoot } from 'mdast';
import type { Root as HastRoot } from 'hast';
import type { Diagnostic, KappanConfig } from '@kappan/core';
import { katexMath } from './katex.js';

const ctx = {
  config: {} as KappanConfig,
  logger: { debug() {}, info() {}, warn() {}, error() {} },
  cache: { get: () => undefined, set: () => {}, delete: () => false },
  chapters: [],
  emit: (_d: Diagnostic) => {},
};

describe('katexMath plugin', () => {
  it('marks inline $...$ math in mdast and renders MathML in hast', async () => {
    const tree: MdastRoot = {
      type: 'root',
      children: [
        { type: 'paragraph', children: [{ type: 'text', value: '式 $E = mc^2$ は有名。' }] },
      ],
    };
    const plugin = katexMath();
    await plugin.hooks.onMdast?.(tree, ctx);
    const para = tree.children[0] as {
      children: Array<{ type: string; data?: { hProperties?: Record<string, unknown> } }>;
    };
    const mathSpan = para.children.find(
      (c) => c.type === 'emphasis' && c.data?.hProperties?.['className'],
    );
    expect(mathSpan).toBeDefined();

    // hast 段で実レンダリング
    const hast: HastRoot = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'span',
          properties: {
            className: ['math', 'math-inline'],
            dataKatexTex: 'E = mc^2',
            dataKatexDisplay: 'false',
          },
          children: [],
        },
      ],
    };
    await plugin.hooks.onHast?.(hast, ctx);
    const span = hast.children[0] as { children: unknown[]; properties?: Record<string, unknown> };
    expect(span.children.length).toBeGreaterThan(0);
    // data 属性は除去される
    expect(span.properties?.['dataKatexTex']).toBeUndefined();
  });

  it('renders block $$...$$ as display math', async () => {
    const tree: MdastRoot = {
      type: 'root',
      children: [
        { type: 'paragraph', children: [{ type: 'text', value: '$$\\int_0^1 x\\,dx$$' }] },
      ],
    };
    const plugin = katexMath();
    await plugin.hooks.onMdast?.(tree, ctx);
    const para = tree.children[0] as {
      data?: { hName?: string; hProperties?: Record<string, unknown> };
    };
    expect(para.data?.hName).toBe('div');
    expect(para.data?.hProperties?.['dataKatexDisplay']).toBe('true');
  });

  it('outputs MathML by default', async () => {
    const hast: HastRoot = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'span',
          properties: { dataKatexTex: 'a+b', dataKatexDisplay: 'false' },
          children: [],
        },
      ],
    };
    await katexMath().hooks.onHast?.(hast, ctx);
    // MathML 要素（math タグ）が子孫に出るはず
    const json = JSON.stringify(hast);
    expect(json).toContain('math');
  });

  it('leaves text without $ unchanged', async () => {
    const tree: MdastRoot = {
      type: 'root',
      children: [{ type: 'paragraph', children: [{ type: 'text', value: '値段は 100 円。' }] }],
    };
    await katexMath().hooks.onMdast?.(tree, ctx);
    const para = tree.children[0] as { children: Array<{ type: string; value?: string }> };
    expect(para.children).toHaveLength(1);
    expect(para.children[0]!.value).toBe('値段は 100 円。');
  });
});
