import { describe, expect, it } from 'vitest';
import type { Root as MdastRoot } from 'mdast';
import type { Diagnostic, KappanConfig } from '@kappan/core';
import { figureNumbering } from './index.js';

const stubCtx = {
  config: {} as KappanConfig,
  logger: { debug() {}, info() {}, warn() {}, error() {} },
  cache: { get: () => undefined, set: () => {}, delete: () => false },
  chapters: [],
  emit: (_d: Diagnostic) => {},
};

/** 共有キャッシュ + emit スパイ付きの ctx を作る（章間テスト・警告テスト用）。 */
function makeSharedCtx() {
  const cache = new Map<string, unknown>();
  const emitted: Diagnostic[] = [];
  return {
    emitted,
    ctx: {
      config: {} as KappanConfig,
      logger: { debug() {}, info() {}, warn() {}, error() {} },
      cache: {
        get<T>(k: string): T | undefined {
          return cache.get(k) as T | undefined;
        },
        set<T>(k: string, v: T) {
          cache.set(k, v);
        },
        delete(k: string) {
          return cache.delete(k);
        },
      },
      chapters: [],
      emit: (d: Diagnostic) => emitted.push(d),
    },
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

function makeTree(): MdastRoot {
  return {
    type: 'root',
    children: [
      {
        type: 'heading',
        depth: 1,
        children: [{ type: 'text', value: '第1章 はじめに' }],
      },
      {
        type: 'paragraph',
        children: [
          { type: 'image', url: 'img/a.png', alt: '構成図', title: null },
          { type: 'text', value: '{#fig:arch}' },
        ],
      },
      {
        type: 'paragraph',
        children: [{ type: 'text', value: '[@fig:arch] のとおりだ。' }],
      },
      {
        type: 'paragraph',
        children: [
          { type: 'image', url: 'img/b.png', alt: '別の図', title: null },
          { type: 'text', value: '{#fig:other}' },
        ],
      },
    ],
  };
}

describe('figureNumbering plugin', () => {
  it('wraps block figures in <figure> with a visible numbered <figcaption> and an anchor id', async () => {
    const plugin = figureNumbering();
    const tree = makeTree();
    await plugin.hooks.onMdast?.(tree, stubCtx);

    // 図1：段落が figure に変換され、img の alt は素の説明、番号は figcaption に出る。
    const fig1 = tree.children[1] as Loose;
    expect(fig1.data?.hName).toBe('figure');
    expect(fig1.data?.hProperties?.id).toBe('fig-arch');
    const img1 = fig1.children[0];
    expect(img1.type).toBe('image');
    expect(img1.alt).toBe('構成図');
    const cap1 = fig1.children[1];
    expect(cap1.data?.hName).toBe('figcaption');
    expect(cap1.children[0]?.value).toBe('図1.1: 構成図');

    // 図2：連番が章内で進む。
    const fig2 = tree.children[3] as Loose;
    expect(fig2.data?.hName).toBe('figure');
    expect(fig2.data?.hProperties?.id).toBe('fig-other');
    expect(fig2.children[1]?.children?.[0]?.value).toBe('図1.2: 別の図');
  });

  it('keeps the number in alt for inline images followed by prose (no <figure>) and anchors the img', async () => {
    const plugin = figureNumbering();
    const tree: MdastRoot = {
      type: 'root',
      children: [
        { type: 'heading', depth: 1, children: [{ type: 'text', value: '第1章' }] },
        {
          type: 'paragraph',
          children: [
            { type: 'image', url: 'i.png', alt: 'アイコン', title: null },
            { type: 'text', value: '{#fig:icon} を本文に並べる。' },
          ],
        },
      ],
    };
    await plugin.hooks.onMdast?.(tree, stubCtx);
    const para = tree.children[1] as Loose;
    // インライン用法は figure に変換せず、従来どおり alt に番号を載せる。
    expect(para.data?.hName).toBeUndefined();
    expect(para.children[0]?.alt).toBe('図1.1: アイコン');
    expect(para.children[0]?.data?.hProperties?.id).toBe('fig-icon');
    expect(para.children[1]?.value).toBe(' を本文に並べる。');
  });

  it('numbers a GFM table with a {#tbl:id} caption paragraph into an anchored <figure>', async () => {
    const plugin = figureNumbering();
    const tree: MdastRoot = {
      type: 'root',
      children: [
        { type: 'heading', depth: 1, children: [{ type: 'text', value: '第2章' }] },
        { type: 'paragraph', children: [{ type: 'text', value: '比較表 {#tbl:cmp}' }] },
        {
          type: 'table',
          align: [null, null],
          children: [
            {
              type: 'tableRow',
              children: [
                { type: 'tableCell', children: [{ type: 'text', value: 'A' }] },
                { type: 'tableCell', children: [{ type: 'text', value: 'B' }] },
              ],
            },
          ],
        },
        { type: 'paragraph', children: [{ type: 'text', value: '[@tbl:cmp] を参照。' }] },
      ],
    };
    await plugin.hooks.onMdast?.(tree, stubCtx);

    // caption 段落は消え、table が figure でラップされる。
    const fig = tree.children[1] as Loose;
    expect(fig.data?.hName).toBe('figure');
    expect(fig.data?.hProperties?.id).toBe('tbl-cmp');
    expect(fig.children[0]?.data?.hName).toBe('figcaption');
    expect(fig.children[0]?.children?.[0]?.value).toBe('表2.1: 比較表');
    expect(fig.children[1]?.type).toBe('table');

    // [@tbl:cmp] 参照がアンカーへのリンクに解決される。
    const ref = tree.children[2] as Loose;
    expect(ref.children[0]?.type).toBe('link');
    expect(ref.children[0]?.url).toBe('#tbl-cmp');
    expect(ref.children[0]?.data?.hProperties?.className).toEqual(['kappan-xref']);
    expect(ref.children[0]?.children?.[0]?.value).toBe('表2.1');
    expect(ref.children[1]?.value).toBe(' を参照。');
  });

  it('numbers a code listing with a {#lst:id} caption paragraph into an anchored <figure>', async () => {
    const plugin = figureNumbering();
    const tree: MdastRoot = {
      type: 'root',
      children: [
        { type: 'heading', depth: 1, children: [{ type: 'text', value: '第3章' }] },
        { type: 'paragraph', children: [{ type: 'text', value: '最小実装 {#lst:demo}' }] },
        { type: 'code', lang: 'ts', meta: null, value: 'const x = 1;' },
        { type: 'paragraph', children: [{ type: 'text', value: '[@lst:demo] を見よ。' }] },
      ],
    };
    await plugin.hooks.onMdast?.(tree, stubCtx);

    // caption 段落は消え、code が <figure class="code-figure"> でラップされる。
    const fig = tree.children[1] as Loose;
    expect(fig.data?.hName).toBe('figure');
    expect(fig.data?.hProperties?.className).toEqual(['code-figure']);
    expect(fig.data?.hProperties?.id).toBe('lst-demo');
    expect(fig.children[0]?.data?.hName).toBe('figcaption');
    expect(fig.children[0]?.children?.[0]?.value).toBe('リスト3.1: 最小実装');
    expect(fig.children[1]?.type).toBe('code');

    const ref = tree.children[2] as Loose;
    expect(ref.children[0]?.type).toBe('link');
    expect(ref.children[0]?.url).toBe('#lst-demo');
    expect(ref.children[0]?.children?.[0]?.value).toBe('リスト3.1');
  });

  it('still numbers a legacy code listing whose following paragraph starts with {#lst:id}', async () => {
    const plugin = figureNumbering();
    const tree: MdastRoot = {
      type: 'root',
      children: [
        { type: 'heading', depth: 1, children: [{ type: 'text', value: '第1章' }] },
        { type: 'code', lang: 'ts', meta: null, value: 'const y = 2;' },
        {
          type: 'paragraph',
          children: [{ type: 'text', value: '{#lst:legacy}本文が続く。[@lst:legacy] を参照。' }],
        },
      ],
    };
    await plugin.hooks.onMdast?.(tree, stubCtx);

    // 後方互換：figure には包まないが、番号・アンカーは付き、参照はリンクになる。
    const code = tree.children[1] as Loose;
    expect(code.type).toBe('code');
    expect(code.data?.hProperties?.id).toBe('lst-legacy');
    const para = tree.children[2] as Loose;
    expect(para.children[0]?.value).toBe('本文が続く。');
    const link = para.children[1];
    expect(link.type).toBe('link');
    expect(link.url).toBe('#lst-legacy');
    expect(link.children[0]?.value).toBe('リスト1.1');
  });

  it('resolves [@fig:id] references to numbered hyperlinks', async () => {
    const plugin = figureNumbering();
    const tree = makeTree();
    await plugin.hooks.onMdast?.(tree, stubCtx);

    const para2 = tree.children[2] as Loose;
    const link = para2.children[0];
    expect(link.type).toBe('link');
    expect(link.url).toBe('#fig-arch');
    expect(link.data?.hProperties?.className).toEqual(['kappan-xref']);
    expect(link.children[0]?.value).toBe('図1.1');
    expect(para2.children[1]?.value).toBe(' のとおりだ。');
  });

  it('numbers and anchors a heading section {#sec:id}', async () => {
    const plugin = figureNumbering();
    const tree: MdastRoot = {
      type: 'root',
      children: [
        { type: 'heading', depth: 1, children: [{ type: 'text', value: '第1章' }] },
        { type: 'heading', depth: 2, children: [{ type: 'text', value: '概要 {#sec:intro}' }] },
        { type: 'paragraph', children: [{ type: 'text', value: '[@sec:intro] を見よ。' }] },
      ],
    };
    await plugin.hooks.onMdast?.(tree, stubCtx);
    const h2 = tree.children[1] as Loose;
    expect(h2.data?.hProperties?.id).toBe('sec-intro');
    expect(h2.children[0]?.value).toBe('概要');
    const link = (tree.children[2] as Loose).children[0];
    expect(link.type).toBe('link');
    expect(link.url).toBe('#sec-intro');
    expect(link.children[0]?.value).toBe('節1.1');
  });

  it('supports English label style', async () => {
    const plugin = figureNumbering({ labelStyle: 'en' });
    const tree = makeTree();
    await plugin.hooks.onMdast?.(tree, stubCtx);

    const fig1 = tree.children[1] as Loose;
    expect(fig1.children[0]?.alt).toBe('構成図');
    expect(fig1.children[1]?.children?.[0]?.value).toBe('Fig.1.1: 構成図');

    const para2 = tree.children[2] as Loose;
    expect(para2.children[0]?.type).toBe('link');
    expect(para2.children[0]?.children?.[0]?.value).toBe('Fig.1.1');
  });

  it('leaves unresolved references unchanged (raw text)', async () => {
    const plugin = figureNumbering();
    const tree: MdastRoot = {
      type: 'root',
      children: [
        {
          type: 'heading',
          depth: 1,
          children: [{ type: 'text', value: '第2章' }],
        },
        {
          type: 'paragraph',
          children: [{ type: 'text', value: '[@fig:nonexistent] は未定義。' }],
        },
      ],
    };
    await plugin.hooks.onMdast?.(tree, stubCtx);
    const p = tree.children[1] as Loose;
    expect(p.children[0]?.value).toContain('[@fig:nonexistent]');
  });

  it('warns about unresolved references during onMdastAllChapters', async () => {
    const plugin = figureNumbering();
    const { ctx, emitted } = makeSharedCtx();
    const tree: MdastRoot = {
      type: 'root',
      children: [
        { type: 'heading', depth: 1, children: [{ type: 'text', value: '第1章 {#ch01}' }] },
        { type: 'paragraph', children: [{ type: 'text', value: '[@fig:ghost] は無い。' }] },
      ],
    };
    await plugin.hooks.onMdast?.(tree, ctx);
    await plugin.hooks.onMdastAllChapters?.([{ path: 'src/ch01.md', tree }], ctx);
    const warn = emitted.find((d) => d.severity === 'warning' && d.message.includes('fig:ghost'));
    expect(warn).toBeTruthy();
    expect(warn?.message).toContain('src/ch01.md');
  });

  it('resolves [@chap:id] and namespaced refs to cross-chapter links via onMdastAllChapters', async () => {
    const plugin = figureNumbering();
    // 章 1: id=ch01, ch1 と sec を定義
    const ch1: MdastRoot = {
      type: 'root',
      children: [
        {
          type: 'heading',
          depth: 1,
          children: [{ type: 'text', value: '第1章 イントロ {#ch01}' }],
        },
        {
          type: 'heading',
          depth: 2,
          children: [{ type: 'text', value: '概要 {#sec:overview}' }],
        },
        {
          type: 'paragraph',
          children: [{ type: 'text', value: '[@sec:overview] を参照。' }],
        },
      ],
    };
    // 章 2: 章 1 への cross-chapter 参照
    const ch2: MdastRoot = {
      type: 'root',
      children: [
        {
          type: 'heading',
          depth: 1,
          children: [{ type: 'text', value: '第3章 応用 {#ch03}' }],
        },
        {
          type: 'paragraph',
          children: [
            {
              type: 'text',
              value: '[@chap:ch01] と [@sec:ch01/overview] を参照。',
            },
          ],
        },
      ],
    };
    const { ctx } = makeSharedCtx();
    await plugin.hooks.onMdast?.(ch1, ctx);
    await plugin.hooks.onMdast?.(ch2, ctx);
    await plugin.hooks.onMdastAllChapters?.(
      [
        { path: 'ch01.md', tree: ch1 },
        { path: 'ch02.md', tree: ch2 },
      ],
      ctx,
    );

    // 章1の同章 sec 参照は onMdast 中にリンク解決済（同一ファイル内アンカー）。
    const p1link = (ch1.children[2] as Loose).children[0];
    expect(p1link.type).toBe('link');
    expect(p1link.url).toBe('#sec-overview');
    expect(p1link.children[0]?.value).toBe('節1.1');

    // 章2の chap 参照は章ファイルへのリンク。
    const p2 = ch2.children[1] as Loose;
    expect(p2.children[0]?.type).toBe('link');
    expect(p2.children[0]?.url).toBe('ch01.xhtml');
    expect(p2.children[0]?.children?.[0]?.value).toBe('第1章');

    // 章2の名前空間付き sec 参照は他章ファイル + アンカーへのリンク。
    const secLink = (p2.children as Loose[]).find(
      (c) => c.type === 'link' && typeof c.url === 'string' && c.url.includes('#sec-overview'),
    );
    expect(secLink).toBeTruthy();
    expect(secLink.url).toBe('ch01.xhtml#sec-overview');
    expect(secLink.children[0]?.value).toBe('節1.1');
  });

  it('uses chapter number from h1 text', async () => {
    const plugin = figureNumbering();
    const tree: MdastRoot = {
      type: 'root',
      children: [
        {
          type: 'heading',
          depth: 1,
          children: [{ type: 'text', value: '第5章 タイトル' }],
        },
        {
          type: 'paragraph',
          children: [
            { type: 'image', url: 'x.png', alt: 'a', title: null },
            { type: 'text', value: '{#fig:x}' },
          ],
        },
      ],
    };
    await plugin.hooks.onMdast?.(tree, stubCtx);
    const fig = tree.children[1] as Loose;
    expect(fig.data?.hName).toBe('figure');
    expect(fig.data?.hProperties?.id).toBe('fig-x');
    expect(fig.children[0]?.alt).toBe('a');
    expect(fig.children[1]?.children?.[0]?.value).toBe('図5.1: a');
  });

  it('derives chapter number from {#chXX} when the title has no "第N章"', async () => {
    // `# はじめに {#ch00}` のような序章で章番号 0 を使う運用を支える。
    const plugin = figureNumbering();
    const tree: MdastRoot = {
      type: 'root',
      children: [
        { type: 'heading', depth: 1, children: [{ type: 'text', value: 'はじめに {#ch00}' }] },
        {
          type: 'paragraph',
          children: [
            { type: 'image', url: 'p.png', alt: '序章図', title: null },
            { type: 'text', value: '{#fig:prelude}' },
          ],
        },
      ],
    };
    await plugin.hooks.onMdast?.(tree, stubCtx);
    const h1 = tree.children[0] as Loose;
    expect(h1.children[0]?.value).toBe('はじめに');
    const fig = tree.children[1] as Loose;
    expect(fig.children[1]?.children?.[0]?.value).toBe('図0.1: 序章図');
  });

  it('prefers {#chXX} over an incidental digit in the title', async () => {
    // タイトル中の偶発的な数字（"5つの理由"）に引っ張られて章番号 5 にならないこと。
    const plugin = figureNumbering();
    const tree: MdastRoot = {
      type: 'root',
      children: [
        { type: 'heading', depth: 1, children: [{ type: 'text', value: '5つの理由 {#ch01}' }] },
        {
          type: 'paragraph',
          children: [
            { type: 'image', url: 'r.png', alt: '根拠', title: null },
            { type: 'text', value: '{#fig:reason}' },
          ],
        },
      ],
    };
    await plugin.hooks.onMdast?.(tree, stubCtx);
    const fig = tree.children[1] as Loose;
    expect(fig.children[1]?.children?.[0]?.value).toBe('図1.1: 根拠');
  });

  it('falls back to chapter 1 when {#chXX} marker has no digits', async () => {
    // `{#preface}` 等の英字のみ ID は step 2 をスキップして fallback で 1 になる。
    // 章 ID 命名規約として `ch00` / `ch01` を推奨する根拠（README 参照）。
    const plugin = figureNumbering();
    const tree: MdastRoot = {
      type: 'root',
      children: [
        { type: 'heading', depth: 1, children: [{ type: 'text', value: 'Foreword {#preface}' }] },
        {
          type: 'paragraph',
          children: [
            { type: 'image', url: 'f.png', alt: 'foreword', title: null },
            { type: 'text', value: '{#fig:f}' },
          ],
        },
      ],
    };
    await plugin.hooks.onMdast?.(tree, stubCtx);
    const fig = tree.children[1] as Loose;
    expect(fig.children[1]?.children?.[0]?.value).toBe('図1.1: foreword');
  });

  it('uses front-matter id from ctx.chapters when present (heading-number alignment)', async () => {
    // h1 にマーカーは無いが、front-matter id `ch05` で章番号 5 を解決して図番号 5.1 にする。
    const plugin = figureNumbering();
    const tree: MdastRoot = {
      type: 'root',
      children: [
        { type: 'heading', depth: 1, children: [{ type: 'text', value: 'はじめに {#ch05}' }] },
        {
          type: 'paragraph',
          children: [
            { type: 'image', url: 'img/a.png', alt: '構成図', title: null },
            { type: 'text', value: '{#fig:a}' },
          ],
        },
      ],
    };
    const ctx = {
      ...stubCtx,
      chapters: [
        {
          id: 'ch05',
          relativePath: 'ch05.md',
          spineIndex: 0,
          title: 'はじめに',
          frontmatter: { id: 'ch05', title: 'はじめに' },
        },
      ],
    };
    await plugin.hooks.onMdast?.(tree, ctx);
    const fig = tree.children[1] as Loose;
    expect(fig.children[1]?.children?.[0]?.value).toBe('図5.1: 構成図');
  });

  it('prefers front-matter chapterNumber override over {#chXX} marker', async () => {
    // front-matter chapterNumber=42 が最優先（heading-number と同じ priority）。
    const plugin = figureNumbering();
    const tree: MdastRoot = {
      type: 'root',
      children: [
        { type: 'heading', depth: 1, children: [{ type: 'text', value: 'タイトル {#ch01}' }] },
        {
          type: 'paragraph',
          children: [
            { type: 'image', url: 'img/x.png', alt: '図', title: null },
            { type: 'text', value: '{#fig:x}' },
          ],
        },
      ],
    };
    const ctx = {
      ...stubCtx,
      chapters: [
        {
          id: 'ch01',
          relativePath: 'a.md',
          spineIndex: 0,
          title: 'タイトル',
          frontmatter: { id: 'ch01', title: 'タイトル', chapterNumber: 42 },
        },
      ],
    };
    await plugin.hooks.onMdast?.(tree, ctx);
    const fig = tree.children[1] as Loose;
    expect(fig.children[1]?.children?.[0]?.value).toBe('図42.1: 図');
  });
});
