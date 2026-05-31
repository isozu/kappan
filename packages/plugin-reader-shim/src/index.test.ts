import { describe, expect, it } from 'vitest';
import type { Root as HastRoot } from 'hast';
import type { Diagnostic, KappanConfig } from '@kappan/core';
import { readerShim } from './index.js';

const ctx = {
  config: {} as KappanConfig,
  logger: { debug() {}, info() {}, warn() {}, error() {} },
  cache: { get: () => undefined, set: () => {}, delete: () => false },
  chapters: [],
  emit: (_d: Diagnostic) => {},
};

function htmlTree(): HastRoot {
  return {
    type: 'root',
    children: [
      {
        type: 'element',
        tagName: 'body',
        properties: {},
        children: [],
      },
    ],
  };
}

describe('readerShim plugin', () => {
  it('adds reader-generic class by default', async () => {
    const tree = htmlTree();
    await readerShim().hooks.onHast?.(tree, ctx);
    const body = tree.children[0] as { properties?: { className?: string[] } };
    expect(body.properties?.className).toContain('reader-generic');
  });

  it('adds the requested profile class', async () => {
    const tree = htmlTree();
    await readerShim({ profile: 'kindle' }).hooks.onHast?.(tree, ctx);
    const body = tree.children[0] as { properties?: { className?: string[] } };
    expect(body.properties?.className).toContain('reader-kindle');
  });

  it('does not branch on writing direction: same class for vertical-rl config', async () => {
    const verticalCtx = {
      ...ctx,
      config: { writingMode: 'vertical-rl' } as KappanConfig,
    };
    const tree = htmlTree();
    await readerShim({ profile: 'apple' }).hooks.onHast?.(tree, verticalCtx);
    const body = tree.children[0] as { properties?: { className?: string[] } };
    // 差異吸収は CSS（Sumi/Saiun テーマ）に集約。shim は組み方向で class を変えない。
    expect(body.properties?.className).toEqual(['reader-apple']);
  });
});
