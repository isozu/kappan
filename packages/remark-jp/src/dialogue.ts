import { definePlugin } from '@kappan/core';
import type { Root as HastRoot, Element, ElementContent } from 'hast';
import { visit } from 'unist-util-visit';

/**
 * 会話文／地の文判定プラグイン。
 *
 * 段落 `<p>` の先頭テキスト（最初の text 子孫）が開きカギ括弧
 * 「「」または「『」で始まる場合は会話文とみなして `class="dialogue"`、
 * それ以外の本文段落には `class="narrative"` を付与する。
 *
 * これにより Sumi CSS で会話文の天付き（字下げ抑制）と
 * 地の文の 1 字下げを段落クラス起点で出し分けできる。
 * 段落先頭の文字種という CSS 構造セレクタでは表現できない判定なので AST で行う。
 *
 * 設計：
 *   - hast 段階で `<p>` を走査（kenten.ts / kinsoku の走査パターン）
 *   - className は配列マージ（kinsoku の `kinsoku` class と共存）
 *
 * 縦書き小説向けの工芸要素。
 */
export const dialogue = definePlugin({
  name: '@kappan/remark-jp/dialogue',
  version: '0.3.0',
  kind: 'typography',
  hooks: () => ({
    onHast(tree: HastRoot) {
      visit(tree, 'element', (node: Element) => {
        if (node.tagName !== 'p') return;
        const leading = firstLeadingChar(node);
        const className = leading === '「' || leading === '『' ? 'dialogue' : 'narrative';
        ensureClass(node, className);
      });
    },
  }),
});

/**
 * 段落内の最初の非空テキスト文字を取得する。
 * ルビ等の入れ子要素を辿り、先頭の text 子孫の先頭文字を返す。
 * テキストが無ければ undefined。
 */
function firstLeadingChar(node: Element): string | undefined {
  for (const child of node.children as ElementContent[]) {
    if (child.type === 'text') {
      if (child.value.length > 0) return [...child.value][0];
    } else if (child.type === 'element') {
      const nested = firstLeadingChar(child);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
}

function ensureClass(node: Element, className: string): void {
  const props = (node.properties ??= {});
  const existing = props['className'];
  if (Array.isArray(existing)) {
    if (!existing.includes(className)) existing.push(className);
  } else if (typeof existing === 'string') {
    props['className'] = existing === className ? [existing] : [existing, className];
  } else {
    props['className'] = [className];
  }
}
