import { describe, expect, it } from 'vitest';
import type { Root as HastRoot, Properties } from 'hast';
import { dialogue } from './dialogue.js';
import type { Diagnostic, KappanConfig } from '@kappan/core';

const stubCtx = {
  config: {} as KappanConfig,
  logger: { debug() {}, info() {}, warn() {}, error() {} },
  cache: { get: () => undefined, set: () => {}, delete: () => false },
  emit: (_d: Diagnostic) => {},
};

function makeParagraph(text: string, properties: Properties = {}): HastRoot {
  return {
    type: 'root',
    children: [
      {
        type: 'element',
        tagName: 'p',
        properties,
        children: [{ type: 'text', value: text }],
      },
    ],
  };
}

type Para = { properties?: { className?: string[] } };

describe('dialogue plugin', () => {
  it('marks a paragraph starting with 「 as dialogue', async () => {
    const plugin = dialogue();
    const tree = makeParagraph('「おはよう」と彼女は言った。');
    await plugin.hooks.onHast?.(tree, stubCtx);

    const p = tree.children[0] as Para;
    expect(p.properties?.className).toContain('dialogue');
    expect(p.properties?.className).not.toContain('narrative');
  });

  it('marks a paragraph starting with 『 as dialogue', async () => {
    const plugin = dialogue();
    const tree = makeParagraph('『古典』を引用する。');
    await plugin.hooks.onHast?.(tree, stubCtx);

    const p = tree.children[0] as Para;
    expect(p.properties?.className).toContain('dialogue');
  });

  it('marks a plain paragraph as narrative', async () => {
    const plugin = dialogue();
    const tree = makeParagraph('朝の光が差し込んでいた。');
    await plugin.hooks.onHast?.(tree, stubCtx);

    const p = tree.children[0] as Para;
    expect(p.properties?.className).toContain('narrative');
    expect(p.properties?.className).not.toContain('dialogue');
  });

  it('looks through nested elements to find the leading character', async () => {
    const plugin = dialogue();
    const tree: HastRoot = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'p',
          properties: {},
          children: [
            {
              type: 'element',
              tagName: 'ruby',
              properties: {},
              children: [
                { type: 'text', value: '彼' },
                {
                  type: 'element',
                  tagName: 'rt',
                  properties: {},
                  children: [{ type: 'text', value: 'かれ' }],
                },
              ],
            },
            { type: 'text', value: 'は歩いた。' },
          ],
        },
      ],
    };
    await plugin.hooks.onHast?.(tree, stubCtx);

    const p = tree.children[0] as Para;
    expect(p.properties?.className).toContain('narrative');
  });

  it('merges with an existing className array (coexists with kinsoku)', async () => {
    const plugin = dialogue();
    const tree = makeParagraph('「やあ」と声がした。', { className: ['kinsoku'] });
    await plugin.hooks.onHast?.(tree, stubCtx);

    const p = tree.children[0] as Para;
    expect(p.properties?.className).toContain('kinsoku');
    expect(p.properties?.className).toContain('dialogue');
  });

  it('merges with an existing className string', async () => {
    const plugin = dialogue();
    const tree = makeParagraph('地の文である。', { className: 'kinsoku' });
    await plugin.hooks.onHast?.(tree, stubCtx);

    const p = tree.children[0] as Para;
    expect(p.properties?.className).toEqual(expect.arrayContaining(['kinsoku', 'narrative']));
  });
});
