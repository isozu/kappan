import { describe, expect, it } from 'vitest';
import type { Root as MdastRoot } from 'mdast';
import type { Diagnostic, KappanConfig, GeneratedDocument } from '@kappan/core';
import { jpIndex } from './index.js';

function makeCtx() {
  const cache = new Map<string, unknown>();
  return {
    config: { metadata: { language: 'ja' } } as KappanConfig,
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
    emit: (_d: Diagnostic) => {},
  };
}

function chapterTree(headingText: string, bodyText: string): MdastRoot {
  return {
    type: 'root',
    children: [
      { type: 'heading', depth: 1, children: [{ type: 'text', value: headingText }] },
      { type: 'paragraph', children: [{ type: 'text', value: bodyText }] },
    ],
  };
}

describe('jpIndex plugin', () => {
  it('extracts {!語!} markers and records index entries', () => {
    const plugin = jpIndex();
    const ctx = makeCtx();
    const tree = chapterTree('第1章 {#ch01}', 'これは {!索引語!} を含む文です。');
    plugin.hooks.onInit?.(ctx);
    plugin.hooks.onMdast?.(tree, ctx);
    const para = tree.children[1] as {
      children: Array<{ type: string; value?: string; data?: unknown }>;
    };
    // text → [text, span(emphasis with data.hName), text]
    const span = para.children.find(
      (c) => c.type === 'emphasis' && (c.data as { hName?: string })?.hName === 'span',
    );
    expect(span).toBeDefined();
  });

  it('extracts {!語|よみ!} with reading', () => {
    const plugin = jpIndex();
    const ctx = makeCtx();
    const tree = chapterTree('第1章 {#ch01}', '{!活版|かっぱん!}の話。');
    plugin.hooks.onInit?.(ctx);
    plugin.hooks.onMdast?.(tree, ctx);
    const docs = (plugin.hooks.onGenerate?.(ctx) ?? []) as GeneratedDocument[];
    expect(docs).toHaveLength(1);
    expect(docs[0]!.xhtml).toContain('活版');
    expect(docs[0]!.xhtml).toContain('epub:type="index"');
  });

  it('extracts [語]{.index reading="よみ"} attribute form', () => {
    const plugin = jpIndex();
    const ctx = makeCtx();
    const tree = chapterTree('第1章 {#ch01}', '[抽象化]{.index reading="ちゅうしょうか"}が鍵だ。');
    plugin.hooks.onInit?.(ctx);
    plugin.hooks.onMdast?.(tree, ctx);
    const docs = (plugin.hooks.onGenerate?.(ctx) ?? []) as GeneratedDocument[];
    expect(docs).toHaveLength(1);
    expect(docs[0]!.xhtml).toContain('抽象化');
  });

  it('returns no document when no index terms exist', () => {
    const plugin = jpIndex();
    const ctx = makeCtx();
    const tree = chapterTree('第1章 {#ch01}', '索引語のない普通の文。');
    plugin.hooks.onInit?.(ctx);
    plugin.hooks.onMdast?.(tree, ctx);
    const docs = (plugin.hooks.onGenerate?.(ctx) ?? []) as GeneratedDocument[];
    expect(docs).toHaveLength(0);
  });

  it('sorts entries あ→英数→記号', () => {
    const plugin = jpIndex();
    const ctx = makeCtx();
    const ch = chapterTree(
      '第1章 {#ch01}',
      '{!ABC|ABC!} と {!あいう|あいう!} と {!#記号|#記号!} を含む。',
    );
    plugin.hooks.onInit?.(ctx);
    plugin.hooks.onMdast?.(ch, ctx);
    const docs = (plugin.hooks.onGenerate?.(ctx) ?? []) as GeneratedDocument[];
    const xhtml = docs[0]!.xhtml;
    const posJa = xhtml.indexOf('あいう');
    const posEn = xhtml.indexOf('ABC');
    const posSym = xhtml.indexOf('#記号');
    expect(posJa).toBeGreaterThan(-1);
    expect(posJa).toBeLessThan(posEn);
    expect(posEn).toBeLessThan(posSym);
  });

  it('aggregates the same term across multiple occurrences', () => {
    const plugin = jpIndex();
    const ctx = makeCtx();
    const ch1 = chapterTree('第1章 {#ch01}', '{!API!} の説明。');
    const ch2 = chapterTree('第2章 {#ch02}', 'さらに {!API!} を使う。');
    plugin.hooks.onInit?.(ctx);
    plugin.hooks.onMdast?.(ch1, ctx);
    plugin.hooks.onMdast?.(ch2, ctx);
    const docs = (plugin.hooks.onGenerate?.(ctx) ?? []) as GeneratedDocument[];
    const xhtml = docs[0]!.xhtml;
    // API は 1 エントリにまとまり、2 つのリンク（1、2）を持つ
    const liMatch = xhtml.match(/<li>API[\s\S]*?<\/li>/);
    expect(liMatch).not.toBeNull();
    expect(liMatch![0]).toContain('ch01.xhtml');
    expect(liMatch![0]).toContain('ch02.xhtml');
  });
});
