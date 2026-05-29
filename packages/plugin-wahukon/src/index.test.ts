import { describe, expect, it } from 'vitest';
import type { Root as MdastRoot } from 'mdast';
import type { Diagnostic, KappanConfig } from '@kappan/core';
import { wahukon } from './index.js';

const ctx = {
  config: {} as KappanConfig,
  logger: { debug() {}, info() {}, warn() {}, error() {} },
  cache: { get: () => undefined, set: () => {}, delete: () => false },
  chapters: [],
  emit: (_d: Diagnostic) => {},
};

function para(text: string): MdastRoot {
  return {
    type: 'root',
    children: [{ type: 'paragraph', children: [{ type: 'text', value: text }] }],
  };
}

describe('wahukon plugin', () => {
  it('inserts a span at JA↔Latin boundaries', async () => {
    const tree = para('ECMAScriptの仕様');
    await wahukon().hooks.onMdast?.(tree, ctx);
    const p = tree.children[0] as { children: Array<{ type: string; data?: { hName?: string } }> };
    const span = p.children.find((c) => c.type === 'emphasis' && c.data?.hName === 'span');
    expect(span).toBeDefined();
  });

  it('does nothing for pure Japanese text', async () => {
    const tree = para('純粋な日本語の文章');
    await wahukon().hooks.onMdast?.(tree, ctx);
    const p = tree.children[0] as { children: Array<{ type: string }> };
    expect(p.children).toHaveLength(1);
    expect(p.children[0]!.type).toBe('text');
  });

  it('respects a custom className', async () => {
    const tree = para('A日本');
    await wahukon({ className: 'wk' }).hooks.onMdast?.(tree, ctx);
    const p = tree.children[0] as {
      children: Array<{ data?: { hProperties?: { className?: string[] } } }>;
    };
    const span = p.children.find((c) => c.data?.hProperties?.className?.includes('wk'));
    expect(span).toBeDefined();
  });
});
