import { describe, expect, it } from 'vitest';
import type { Root as MdastRoot } from 'mdast';
import {
  parseMarkdownToMdast,
  renderMdastToXhtml,
  type Diagnostic,
  type KappanConfig,
} from '@kappan/core';
import { admonition, ADMONITION_KINDS } from './index.js';

const stubCtx = {
  config: {} as KappanConfig,
  logger: { debug() {}, info() {}, warn() {}, error() {} },
  cache: { get: () => undefined, set: () => {}, delete: () => false },
  chapters: [],
  emit: (_d: Diagnostic) => {},
};

async function transform(markdown: string, plugin = admonition()): Promise<MdastRoot> {
  const tree = parseMarkdownToMdast(markdown);
  await plugin.hooks.onMdast?.(tree, stubCtx);
  return tree;
}

async function render(markdown: string, plugin = admonition()): Promise<string> {
  const tree = await transform(markdown, plugin);
  return renderMdastToXhtml(tree, {
    title: 'T',
    language: 'ja',
    stylesheetHref: '../styles/theme.css',
    unsafeHtml: false,
  });
}

describe('admonition plugin', () => {
  it('parses :::note into an <aside class="admonition note"> with a default title', async () => {
    const xhtml = await render(':::note\n本文だよ。\n:::\n');
    expect(xhtml).toContain('<aside class="admonition note">');
    expect(xhtml).toContain('<p class="admonition-title">注記</p>');
    expect(xhtml).toContain('本文だよ。');
  });

  it('uses the explicit label when given (:::warning[タイトル])', async () => {
    const xhtml = await render(':::warning[互換性の注意]\n古いリーダーでは表示できない。\n:::\n');
    expect(xhtml).toContain('<aside class="admonition warning">');
    expect(xhtml).toContain('<p class="admonition-title">互換性の注意</p>');
  });

  it('emits the correct variant class for every supported kind', async () => {
    for (const kind of ADMONITION_KINDS) {
      const xhtml = await render(`:::${kind}\n本文。\n:::\n`);
      expect(xhtml).toContain(`<aside class="admonition ${kind}">`);
    }
  });

  it('keeps block content (paragraphs, code) inside the admonition', async () => {
    const md = ':::tip\n段落1。\n\n```ts\nconst x = 1;\n```\n:::\n';
    const xhtml = await render(md);
    expect(xhtml).toContain('<aside class="admonition tip">');
    expect(xhtml).toContain('段落1。');
    expect(xhtml).toContain('const x = 1;');
  });

  it('renders English default titles when labelStyle is en', async () => {
    const xhtml = await render(':::note\nbody\n:::\n', admonition({ labelStyle: 'en' }));
    expect(xhtml).toContain('<p class="admonition-title">Note</p>');
  });

  it('omits the title when showTitle=false and no explicit label', async () => {
    const xhtml = await render(':::memo\n本文。\n:::\n', admonition({ showTitle: false }));
    expect(xhtml).toContain('<aside class="admonition memo">');
    expect(xhtml).not.toContain('admonition-title');
  });

  it('ignores unrelated directive names', async () => {
    const tree = await transform(':::column[X]\n本文。\n:::\n');
    const node = tree.children[0] as { type: string; data?: { hName?: string } };
    // column は admonition の管轄外。hName は付かない（plugin-column が処理する）。
    expect(node.data?.hName).toBeUndefined();
  });
});
