import { definePlugin } from '@kappan/core';
import type { Root as HastRoot, Element, ElementContent, Text } from 'hast';
import { visit } from 'unist-util-visit';

/**
 * 連続約物処理プラグイン。
 *
 * 縦組み（および横組み）で、連続するダーシ・三点リーダを 1 つの span に
 * まとめ、途中での改行や字間挿入を CSS（`.renzoku-*`）側で抑止できるようにする：
 *   - 三点リーダ `……`（U+2026 ×2 以上）→ `<span class="renzoku-leader">……</span>`
 *   - ダーシ `――`（U+2015 ×2 以上、3 連も）→ `<span class="renzoku-dash">――</span>`
 *
 * 単独の `…` `―` は連続ではないため対象外（字形・位置は CSS と縦書きエンジン任せ）。
 *
 * 設計：
 *   - hast 段階でテキストノードを走査（kenten.ts / ruby.ts と同じパターン）
 *   - コードブロックや code 要素内は変換しない
 *   - class 名（renzoku-leader / renzoku-dash）はテーマ CSS が受ける契約
 *
 * 縦書き小説向けの工芸要素。
 */
export const punctuation = definePlugin({
  name: '@kappan/remark-jp/punctuation',
  version: '0.3.0',
  kind: 'typography',
  hooks: () => ({
    onHast(tree: HastRoot) {
      visit(tree, 'element', (node, _index, parent) => {
        if (isCodeContext(node, parent)) return 'skip' as const;
        // 自身が生成した renzoku span は再走査しない（無限ネスト防止）
        if (isRenzokuSpan(node)) return 'skip' as const;

        const newChildren: ElementContent[] = [];
        let changed = false;
        for (const child of node.children) {
          if (child.type === 'text') {
            const expanded = expandPunctuationText(child);
            if (expanded.length !== 1 || expanded[0] !== child) {
              newChildren.push(...expanded);
              changed = true;
              continue;
            }
          }
          newChildren.push(child);
        }
        if (changed) {
          node.children = newChildren;
        }
        return undefined;
      });
    },
  }),
});

function isCodeContext(node: Element, parent: unknown): boolean {
  if (node.tagName === 'code' || node.tagName === 'pre') return true;
  const p = parent as Element | undefined;
  if (p && (p.tagName === 'code' || p.tagName === 'pre')) return true;
  return false;
}

function isRenzokuSpan(node: Element): boolean {
  if (node.tagName !== 'span') return false;
  const className = node.properties?.['className'];
  if (!Array.isArray(className)) return false;
  return className.includes('renzoku-leader') || className.includes('renzoku-dash');
}

/**
 * 連続約物パターン。
 *   - 三点リーダ U+2026（…）2 つ以上の連続
 *   - ダーシ U+2015（―）2 つ以上の連続
 */
const RENZOKU_RE = /(…{2,})|(―{2,})/g;

function expandPunctuationText(text: Text): ElementContent[] {
  const value = text.value;
  RENZOKU_RE.lastIndex = 0;
  if (!RENZOKU_RE.test(value)) return [text];
  RENZOKU_RE.lastIndex = 0;

  const out: ElementContent[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = RENZOKU_RE.exec(value)) !== null) {
    const before = value.slice(cursor, match.index);
    if (before) out.push({ type: 'text', value: before });
    const className = match[1] !== undefined ? 'renzoku-leader' : 'renzoku-dash';
    out.push({
      type: 'element',
      tagName: 'span',
      properties: { className: [className] },
      children: [{ type: 'text', value: match[0] }],
    });
    cursor = match.index + match[0].length;
  }
  const after = value.slice(cursor);
  if (after) out.push({ type: 'text', value: after });
  return out;
}
