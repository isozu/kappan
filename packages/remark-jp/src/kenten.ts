import { definePlugin } from '@kappan/core';
import type { Root as HastRoot, Element, ElementContent, Text } from 'hast';
import { visit } from 'unist-util-visit';

/**
 * 圏点（傍点）記法プラグイン。
 *
 * 対応する記法：
 *   `[重要]{.kenten}` → `<em class="kenten">重要</em>`
 *
 * markdown-it-attrs と Pandoc Markdown の attribute syntax に揃えた。
 * 縦組み時は CSS で `text-emphasis-style: sesame` 等のスタイルを当てる。
 *
 * 属性記法ベースの圏点として定義。
 *
 * 設計（兄弟ノード跨ぎ）：
 *   圏点 span の中にルビ（`{灯|ともしび}`）などの別記法が入る場合、ruby プラグインが
 *   先に走ると `[消えゆく{灯|ともしび}]{.kenten}` が
 *   text(`[消えゆく`) / `<ruby>` / text(`]{.kenten}`) に分断され、単一テキストノードの
 *   正規表現だけでは span 全体を捕捉できない。そこで 2 段で処理する：
 *     Pass 1: 1 テキストノードに閉じた `[…]{.kenten}` を従来どおり変換（挙動温存）。
 *     Pass 2: `[` と `]{.kenten}` が兄弟ノードを跨ぐケースを縫い合わせる。
 *   これによりプラグインの実行順（ruby 先行 / kenten 先行）に依存せず正しく組める。
 */
export const kenten = definePlugin({
  name: '@kappan/remark-jp/kenten',
  version: '0.3.0',
  kind: 'typography',
  hooks: () => ({
    onHast(tree: HastRoot) {
      visit(tree, 'element', (node, _index, parent) => {
        if (isCodeContext(node, parent)) return 'skip' as const;

        const result = transformChildren(node.children);
        if (result.changed) {
          node.children = result.children;
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

/** `[テキスト]{.kenten}` パターン（1 テキストノード内で閉じる場合）。 */
const KENTEN_RE = /\[([^\]]+)\]\{\.kenten\}/g;

/** 圏点 span の閉じトークン。Pass 2 で兄弟ノードを跨いで探す。 */
const KENTEN_CLOSE = ']{.kenten}';

/**
 * ある要素の children を圏点記法で変換し、変更後の配列と変更有無を返す。
 *
 * Pass 1（単一ノード）と Pass 2（兄弟跨ぎ）を順に適用する。
 */
function transformChildren(children: ElementContent[]): {
  children: ElementContent[];
  changed: boolean;
} {
  let changed = false;

  // Pass 1: 1 テキストノードに閉じた `[…]{.kenten}` を変換（従来挙動）。
  const pass1: ElementContent[] = [];
  for (const child of children) {
    if (child.type === 'text') {
      const expanded = expandKentenText(child);
      if (expanded.length !== 1 || expanded[0] !== child) {
        pass1.push(...expanded);
        changed = true;
        continue;
      }
    }
    pass1.push(child);
  }

  // Pass 2: `[` … `]{.kenten}` が兄弟ノードを跨ぐケースを縫い合わせる。
  const out: ElementContent[] = [];
  let i = 0;
  while (i < pass1.length) {
    const child = pass1[i]!;
    if (child.type === 'text') {
      const openIdx = child.value.lastIndexOf('[');
      // このノード内に `[` があり、かつ同ノード内に閉じトークンが無い＝跨ぎの開始候補。
      if (openIdx !== -1 && !child.value.slice(openIdx).includes(KENTEN_CLOSE)) {
        const closeIndex = findCloserIndex(pass1, i + 1);
        if (closeIndex !== -1) {
          const closerNode = pass1[closeIndex] as Text;
          const closeAt = closerNode.value.indexOf(KENTEN_CLOSE);

          const before = child.value.slice(0, openIdx);
          const openTail = child.value.slice(openIdx + 1); // `[` の直後〜ノード末尾
          const closeHead = closerNode.value.slice(0, closeAt); // 閉じトークンの直前まで
          const closeTail = closerNode.value.slice(closeAt + KENTEN_CLOSE.length);

          const emChildren: ElementContent[] = [];
          if (openTail) emChildren.push({ type: 'text', value: openTail });
          for (let k = i + 1; k < closeIndex; k++) emChildren.push(pass1[k]!);
          if (closeHead) emChildren.push({ type: 'text', value: closeHead });

          if (before) out.push({ type: 'text', value: before });
          out.push({
            type: 'element',
            tagName: 'em',
            properties: { className: ['kenten'] },
            children: emChildren,
          });
          changed = true;

          // 閉じノードの残り（閉じトークン以降）に別の圏点が続く可能性があるため再走査する。
          if (closeTail) {
            pass1[closeIndex] = { type: 'text', value: closeTail };
            i = closeIndex;
          } else {
            i = closeIndex + 1;
          }
          continue;
        }
      }
    }
    out.push(child);
    i++;
  }

  return { children: out, changed };
}

/** `start` 以降で最初に閉じトークンを含むテキストノードの index を返す（無ければ -1）。 */
function findCloserIndex(children: readonly ElementContent[], start: number): number {
  for (let k = start; k < children.length; k++) {
    const c = children[k]!;
    if (c.type === 'text' && c.value.includes(KENTEN_CLOSE)) return k;
  }
  return -1;
}

function expandKentenText(text: Text): ElementContent[] {
  const value = text.value;
  KENTEN_RE.lastIndex = 0;
  if (!KENTEN_RE.test(value)) return [text];
  KENTEN_RE.lastIndex = 0;

  const out: ElementContent[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = KENTEN_RE.exec(value)) !== null) {
    const before = value.slice(cursor, match.index);
    if (before) out.push({ type: 'text', value: before });
    out.push({
      type: 'element',
      tagName: 'em',
      properties: { className: ['kenten'] },
      children: [{ type: 'text', value: match[1]! }],
    });
    cursor = match.index + match[0].length;
  }
  const after = value.slice(cursor);
  if (after) out.push({ type: 'text', value: after });
  return out;
}
