import { describe, expect, it } from 'vitest';
import type { Root as HastRoot, Element, ElementContent } from 'hast';
import { kenten } from './kenten.js';
import { ruby } from './ruby.js';
import type { Diagnostic, KappanConfig } from '@kappan/core';

const stubCtx = {
  config: {} as KappanConfig,
  logger: { debug() {}, info() {}, warn() {}, error() {} },
  cache: { get: () => undefined, set: () => {}, delete: () => false },
  chapters: [],
  emit: (_d: Diagnostic) => {},
};

function makeParagraph(...children: ElementContent[]): HastRoot {
  return {
    type: 'root',
    children: [{ type: 'element', tagName: 'p', properties: {}, children }],
  };
}

function text(value: string): ElementContent {
  return { type: 'text', value };
}

function rubyEl(base: string, reading: string): Element {
  return {
    type: 'element',
    tagName: 'ruby',
    properties: {},
    children: [
      { type: 'text', value: base },
      {
        type: 'element',
        tagName: 'rt',
        properties: {},
        children: [{ type: 'text', value: reading }],
      },
    ],
  };
}

function paragraphChildren(tree: HastRoot): ElementContent[] {
  return (tree.children[0] as Element).children;
}

/** em.kenten 要素の中身を、テキストと ruby のベース文字を連結して可視化する。 */
function emKenten(children: ElementContent[]): Element | undefined {
  return children.find(
    (c): c is Element =>
      c.type === 'element' &&
      c.tagName === 'em' &&
      Array.isArray((c.properties?.className as unknown[]) ?? undefined) &&
      ((c.properties?.className as string[]) ?? []).includes('kenten'),
  );
}

describe('kenten plugin', () => {
  it('expands [重要]{.kenten} within a single text node', async () => {
    const tree = makeParagraph(text('ここが[重要]{.kenten}な点だ。'));
    await kenten().hooks.onHast?.(tree, stubCtx);

    const children = paragraphChildren(tree);
    expect(
      children.map((c) => (c.type === 'text' ? c.value : `<${(c as Element).tagName}>`)),
    ).toEqual(['ここが', '<em>', 'な点だ。']);
    const em = emKenten(children)!;
    expect((em.children[0] as { value: string }).value).toBe('重要');
  });

  it('expands multiple kenten spans in one text node', async () => {
    const tree = makeParagraph(text('[一]{.kenten}と[二]{.kenten}'));
    await kenten().hooks.onHast?.(tree, stubCtx);

    const ems = paragraphChildren(tree).filter(
      (c) => c.type === 'element' && (c as Element).tagName === 'em',
    );
    expect(ems).toHaveLength(2);
  });

  it('leaves text without kenten pattern unchanged', async () => {
    const tree = makeParagraph(text('普通の本文だけ。'));
    await kenten().hooks.onHast?.(tree, stubCtx);
    const children = paragraphChildren(tree);
    expect(children).toHaveLength(1);
    expect(children[0]!.type).toBe('text');
  });

  it('does not touch code elements', async () => {
    const tree: HastRoot = {
      type: 'root',
      children: [
        {
          type: 'element',
          tagName: 'code',
          properties: {},
          children: [text('[重要]{.kenten}')],
        },
      ],
    };
    await kenten().hooks.onHast?.(tree, stubCtx);
    const code = tree.children[0] as Element;
    expect(code.children).toHaveLength(1);
    expect(code.children[0]!.type).toBe('text');
  });

  // --- 兄弟ノード跨ぎ（圏点内にルビ） -------------------------------------

  it('stitches a kenten span split across siblings (ruby ran first)', async () => {
    // ruby が先に走って `{灯|ともしび}` を <ruby> 化し、テキストが分断された状態を模す。
    const tree = makeParagraph(
      text('いまや[消えゆく'),
      rubyEl('灯', 'ともしび'),
      text(']{.kenten}になろうとしていた。'),
    );
    await kenten().hooks.onHast?.(tree, stubCtx);

    const children = paragraphChildren(tree);
    expect(
      children.map((c) => (c.type === 'text' ? c.value : `<${(c as Element).tagName}>`)),
    ).toEqual(['いまや', '<em>', 'になろうとしていた。']);
    const em = emKenten(children)!;
    expect(
      em.children.map((c) => (c.type === 'text' ? c.value : `<${(c as Element).tagName}>`)),
    ).toEqual(['消えゆく', '<ruby>']);
  });

  it('produces the same result whichever order kenten/ruby run (kenten first)', async () => {
    // kenten 先行: 生テキスト `[消えゆく{灯|ともしび}]{.kenten}` を kenten→ruby の順に処理。
    const tree = makeParagraph(text('いまや[消えゆく{灯|ともしび}]{.kenten}になろうとしていた。'));
    await kenten().hooks.onHast?.(tree, stubCtx);
    await ruby().hooks.onHast?.(tree, stubCtx);

    const children = paragraphChildren(tree);
    const em = emKenten(children)!;
    expect(
      em.children.map((c) => (c.type === 'text' ? c.value : `<${(c as Element).tagName}>`)),
    ).toEqual(['消えゆく', '<ruby>']);
    const rt = ((em.children[1] as Element).children[1] as Element).children[0] as {
      value: string;
    };
    expect(rt.value).toBe('ともしび');
  });

  it('leaves an unmatched opening bracket alone when there is no closer', async () => {
    const tree = makeParagraph(text('配列は arr[0] で参照する。'));
    await kenten().hooks.onHast?.(tree, stubCtx);
    const children = paragraphChildren(tree);
    expect(children).toHaveLength(1);
    expect((children[0] as { value: string }).value).toBe('配列は arr[0] で参照する。');
  });
});
