import { describe, expect, it } from 'vitest';
import type { Root as HastRoot } from 'hast';
import { ruby } from './ruby.js';
import { kenten } from './kenten.js';
import type { Diagnostic, KappanConfig } from '@kappan/core';

const stubCtx = {
  config: {} as KappanConfig,
  logger: { debug() {}, info() {}, warn() {}, error() {} },
  cache: { get: () => undefined, set: () => {}, delete: () => false },
  emit: (_d: Diagnostic) => {},
};

function makeParagraph(text: string): HastRoot {
  return {
    type: 'root',
    children: [
      {
        type: 'element',
        tagName: 'p',
        properties: {},
        children: [{ type: 'text', value: text }],
      },
    ],
  };
}

describe('ruby plugin', () => {
  it('expands {漢字|かんじ} to <ruby><rt>かんじ</rt></ruby>', async () => {
    const plugin = ruby();
    const tree = makeParagraph('これは{活版|かっぱん}印刷の本。');
    await plugin.hooks.onHast?.(tree, stubCtx);

    const p = tree.children[0] as { children: unknown[] };
    expect(p.children).toHaveLength(3);

    const children = p.children as Array<{
      type: string;
      value?: string;
      tagName?: string;
      children?: unknown[];
    }>;
    const before = children[0]!;
    const rubyEl = children[1]!;
    const after = children[2]!;
    expect(before.type).toBe('text');
    expect(before.value).toBe('これは');
    expect(rubyEl.type).toBe('element');
    expect(rubyEl.tagName).toBe('ruby');
    const rubyChildren = rubyEl.children as Array<{
      type: string;
      value?: string;
      tagName?: string;
    }>;
    expect(rubyChildren.map((c) => c.value ?? c.tagName)).toEqual(['活版', 'rt']);
    expect(after.value).toBe('印刷の本。');
  });

  it('expands multiple ruby occurrences in one text', async () => {
    const plugin = ruby();
    const tree = makeParagraph('{活版|かっぱん}と{文選|ぶんせん}');
    await plugin.hooks.onHast?.(tree, stubCtx);

    const p = tree.children[0] as { children: { type: string; tagName?: string }[] };
    const rubyCount = p.children.filter((c) => c.tagName === 'ruby').length;
    expect(rubyCount).toBe(2);
  });

  it('leaves text without ruby pattern unchanged', async () => {
    const plugin = ruby();
    const tree = makeParagraph('普通の本文だけ。');
    await plugin.hooks.onHast?.(tree, stubCtx);

    const p = tree.children[0] as { children: Array<{ type: string }> };
    expect(p.children).toHaveLength(1);
    expect(p.children[0]?.type).toBe('text');
  });

  it('does not touch code elements', async () => {
    const plugin = ruby();
    const tree: HastRoot = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'code',
          properties: {},
          children: [{ type: 'text', value: '{value|key}' }],
        },
      ],
    };
    await plugin.hooks.onHast?.(tree, stubCtx);
    const code = tree.children[0] as { children: Array<{ type: string }> };
    expect(code.children).toHaveLength(1);
    expect(code.children[0]?.type).toBe('text');
  });

  it('handles two ruby patterns sandwiching plain text', async () => {
    const plugin = ruby();
    const tree = makeParagraph('{活版|かっぱん}印刷と{書籍|しょせき}制作');
    await plugin.hooks.onHast?.(tree, stubCtx);

    const p = tree.children[0] as { children: unknown[] };
    expect(p.children.length).toBe(4);
  });
});

describe('kenten plugin', () => {
  it('expands [重要]{.kenten} to <em class="kenten">重要</em>', async () => {
    const plugin = kenten();
    const tree = makeParagraph('ここが[重要]{.kenten}な点だ。');
    await plugin.hooks.onHast?.(tree, stubCtx);

    const p = tree.children[0] as {
      children: Array<{ type: string; tagName?: string; properties?: { className?: string[] } }>;
    };
    const em = p.children.find((c) => c.tagName === 'em');
    expect(em).toBeDefined();
    expect(em?.properties?.className).toContain('kenten');
  });
});
