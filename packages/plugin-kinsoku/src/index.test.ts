import { describe, expect, it } from 'vitest';
import type { Root as HastRoot } from 'hast';
import type { Diagnostic, KappanConfig } from '@kappan/core';
import { kinsoku } from './index.js';

const stubCtx = {
  config: {} as KappanConfig,
  logger: { debug() {}, info() {}, warn() {}, error() {} },
  cache: { get: () => undefined, set: () => {}, delete: () => false },
  emit: (_d: Diagnostic) => {},
};

function makePara(text: string): HastRoot {
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

describe('kinsoku plugin', () => {
  it('adds kinsoku class to paragraphs', async () => {
    const plugin = kinsoku();
    const tree = makePara('本文。');
    await plugin.hooks.onHast?.(tree, stubCtx);

    const p = tree.children[0] as { properties?: { className?: string[] } };
    expect(p.properties?.className).toContain('kinsoku');
  });

  it('wraps text around 「 to prevent line break after opening bracket', async () => {
    const plugin = kinsoku();
    const tree = makePara('ここで「重要」と言う。');
    await plugin.hooks.onHast?.(tree, stubCtx);

    const p = tree.children[0] as { children: Array<{ type: string; tagName?: string }> };
    const hasNoBreak = p.children.some((c) => c.tagName === 'span');
    expect(hasNoBreak).toBe(true);
  });

  it('wraps text around 。 to prevent line start with punctuation', async () => {
    const plugin = kinsoku();
    const tree = makePara('終わり。');
    await plugin.hooks.onHast?.(tree, stubCtx);

    const p = tree.children[0] as {
      children: Array<{ type: string; tagName?: string; properties?: { className?: string[] } }>;
    };
    const spans = p.children.filter((c) => c.tagName === 'span');
    expect(spans.length).toBeGreaterThan(0);
    expect(spans[0]?.properties?.className).toContain('kinsoku-no-break');
  });

  it('leaves text without kinsoku characters unchanged in structure', async () => {
    const plugin = kinsoku();
    const tree = makePara('abc def');
    await plugin.hooks.onHast?.(tree, stubCtx);

    const p = tree.children[0] as { children: Array<{ type: string }> };
    // span ラップが発生しないはず
    expect(p.children.every((c) => c.type === 'text')).toBe(true);
  });

  it('supports custom className', async () => {
    const plugin = kinsoku({ className: 'jp-text' });
    const tree = makePara('本文');
    await plugin.hooks.onHast?.(tree, stubCtx);

    const p = tree.children[0] as { properties?: { className?: string[] } };
    expect(p.properties?.className).toContain('jp-text');
  });

  it('processes list items as block text', async () => {
    const plugin = kinsoku();
    const tree: HastRoot = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'ul',
          properties: {},
          children: [
            {
              type: 'element',
              tagName: 'li',
              properties: {},
              children: [{ type: 'text', value: 'リスト項目。' }],
            },
          ],
        },
      ],
    };
    await plugin.hooks.onHast?.(tree, stubCtx);
    const ul = tree.children[0] as { children: Array<{ properties?: { className?: string[] } }> };
    const li = ul.children[0]!;
    expect(li.properties?.className).toContain('kinsoku');
  });
});
