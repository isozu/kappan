import { describe, expect, it } from 'vitest';
import type { Root as MdastRoot } from 'mdast';
import type { Diagnostic, KappanConfig } from '@kappan/core';
import { tcySmart } from './index.js';

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

describe('tcySmart plugin', () => {
  it('wraps 2-digit numbers in a .tcy span', async () => {
    const tree = para('第12版について');
    await tcySmart().hooks.onMdast?.(tree, ctx);
    const p = tree.children[0] as {
      children: Array<{ type: string; data?: { hProperties?: { className?: string[] } } }>;
    };
    const span = p.children.find((c) => c.data?.hProperties?.className?.includes('tcy'));
    expect(span).toBeDefined();
  });

  it('does not wrap 4-digit years (exceeds maxDigits)', async () => {
    const tree = para('2026年の話');
    await tcySmart().hooks.onMdast?.(tree, ctx);
    const p = tree.children[0] as { children: Array<{ type: string }> };
    // 2026 は 4 桁なので対象外。text のまま
    expect(p.children).toHaveLength(1);
    expect(p.children[0]!.type).toBe('text');
  });
});
