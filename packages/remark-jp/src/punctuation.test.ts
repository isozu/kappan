import { describe, expect, it } from 'vitest';
import type { Root as HastRoot } from 'hast';
import { punctuation } from './punctuation.js';
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

type Child = {
  type: string;
  value?: string;
  tagName?: string;
  properties?: { className?: string[] };
  children?: Array<{ type: string; value?: string }>;
};

describe('punctuation plugin', () => {
  it('wraps consecutive leader dots (……) in a single renzoku-leader span', async () => {
    const plugin = punctuation();
    const tree = makeParagraph('そして……彼は去った。');
    await plugin.hooks.onHast?.(tree, stubCtx);

    const p = tree.children[0] as { children: Child[] };
    const spans = p.children.filter((c) => c.tagName === 'span');
    expect(spans).toHaveLength(1);
    expect(spans[0]?.properties?.className).toContain('renzoku-leader');
    expect(spans[0]?.children?.[0]?.value).toBe('……');
  });

  it('wraps consecutive dashes (――) in a single renzoku-dash span', async () => {
    const plugin = punctuation();
    const tree = makeParagraph('沈黙――そして再び。');
    await plugin.hooks.onHast?.(tree, stubCtx);

    const p = tree.children[0] as { children: Child[] };
    const spans = p.children.filter((c) => c.tagName === 'span');
    expect(spans).toHaveLength(1);
    expect(spans[0]?.properties?.className).toContain('renzoku-dash');
    expect(spans[0]?.children?.[0]?.value).toBe('――');
  });

  it('keeps a triple dash run (―――) as one renzoku-dash span', async () => {
    const plugin = punctuation();
    const tree = makeParagraph('果てしない―――道。');
    await plugin.hooks.onHast?.(tree, stubCtx);

    const p = tree.children[0] as { children: Child[] };
    const spans = p.children.filter((c) => c.tagName === 'span');
    expect(spans).toHaveLength(1);
    expect(spans[0]?.children?.[0]?.value).toBe('―――');
  });

  it('leaves a single leader/dash unchanged', async () => {
    const plugin = punctuation();
    const tree = makeParagraph('一字の…と―だけ。');
    await plugin.hooks.onHast?.(tree, stubCtx);

    const p = tree.children[0] as { children: Child[] };
    expect(p.children).toHaveLength(1);
    expect(p.children[0]?.type).toBe('text');
  });

  it('wraps multiple separate runs in the same text', async () => {
    const plugin = punctuation();
    const tree = makeParagraph('ああ……それは――そう。');
    await plugin.hooks.onHast?.(tree, stubCtx);

    const p = tree.children[0] as { children: Child[] };
    const spans = p.children.filter((c) => c.tagName === 'span');
    expect(spans).toHaveLength(2);
    expect(spans[0]?.properties?.className).toContain('renzoku-leader');
    expect(spans[1]?.properties?.className).toContain('renzoku-dash');
  });

  it('does not touch code elements', async () => {
    const plugin = punctuation();
    const tree: HastRoot = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'code',
          properties: {},
          children: [{ type: 'text', value: 'a……b――c' }],
        },
      ],
    };
    await plugin.hooks.onHast?.(tree, stubCtx);
    const code = tree.children[0] as { children: Child[] };
    expect(code.children).toHaveLength(1);
    expect(code.children[0]?.type).toBe('text');
  });
});
