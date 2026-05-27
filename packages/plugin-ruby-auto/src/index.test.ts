import { describe, expect, it } from 'vitest';
import type { Root as MdastRoot } from 'mdast';
import type { Diagnostic, KappanConfig } from '@kappan/core';
import { rubyAuto } from './index.js';

const ctx = {
  config: {} as KappanConfig,
  logger: { debug() {}, info() {}, warn() {}, error() {} },
  cache: { get: () => undefined, set: () => {}, delete: () => false },
  emit: (_d: Diagnostic) => {},
};

function para(text: string): MdastRoot {
  return {
    type: 'root',
    children: [{ type: 'paragraph', children: [{ type: 'text', value: text }] }],
  };
}

describe('rubyAuto plugin', () => {
  it('wraps dictionary terms in <ruby>', async () => {
    const tree = para('薔薇の花。');
    await rubyAuto({ dictionary: { 薔薇: 'ばら' } }).hooks.onMdast?.(tree, ctx);
    const p = tree.children[0] as {
      children: Array<{ type: string; data?: { hName?: string } }>;
    };
    const ruby = p.children.find((c) => c.type === 'emphasis' && c.data?.hName === 'ruby');
    expect(ruby).toBeDefined();
  });

  it('does nothing without a dictionary', async () => {
    const tree = para('薔薇の花。');
    await rubyAuto().hooks.onMdast?.(tree, ctx);
    const p = tree.children[0] as { children: Array<{ type: string }> };
    expect(p.children).toHaveLength(1);
    expect(p.children[0]!.type).toBe('text');
  });
});
