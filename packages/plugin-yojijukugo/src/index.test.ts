import { describe, expect, it } from 'vitest';
import type { Root as MdastRoot } from 'mdast';
import type { Diagnostic, KappanConfig } from '@kappan/core';
import { yojijukugo } from './index.js';

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

describe('yojijukugo plugin', () => {
  it('normalizes a built-in misspelling', async () => {
    const tree = para('まさに危機一発の状況だ。');
    await yojijukugo().hooks.onMdast?.(tree, ctx);
    const p = tree.children[0] as { children: Array<{ value: string }> };
    expect(p.children[0]!.value).toContain('危機一髪');
    expect(p.children[0]!.value).not.toContain('危機一発');
  });

  it('applies a user dictionary', async () => {
    const tree = para('Re:VIEW から移行する。');
    await yojijukugo({ dictionary: { 'Re:VIEW': 'Re:VIEW™' }, useBuiltin: false }).hooks.onMdast?.(
      tree,
      ctx,
    );
    const p = tree.children[0] as { children: Array<{ value: string }> };
    expect(p.children[0]!.value).toContain('Re:VIEW™');
  });

  it('leaves text unchanged when nothing matches', async () => {
    const tree = para('普通の文章です。');
    await yojijukugo().hooks.onMdast?.(tree, ctx);
    const p = tree.children[0] as { children: Array<{ value: string }> };
    expect(p.children[0]!.value).toBe('普通の文章です。');
  });
});
