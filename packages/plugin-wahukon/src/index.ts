import { definePlugin } from '@kappan/core';
import type { Root as MdastRoot, Text, Parent, PhrasingContent } from 'mdast';
import { visit } from 'unist-util-visit';

export interface WahukonOptions {
  /** 和欧間に挿入する span の class 名（デフォルト 'wahukon'） */
  readonly className?: string;
}

// 日本語（ひらがな・カタカナ・漢字・全角約物の一部）
const JA = '\\u3040-\\u30ff\\u3400-\\u9fff\\uff00-\\uffef';
// 欧文・数字
const LATIN = 'A-Za-z0-9';

/**
 * 和欧境界（日本語↔ラテン/数字）に細い空き class を自動付与する。
 *
 * 例：「ECMAScript の仕様」→ 「ECMAScript」と「の」の間に `<span class="wahukon"></span>`。
 * CSS 側で `.wahukon { margin: 0 0.0625em; }` 等を当てて四分アキ相当を表現する。
 *
 * AST レベル（text ノード分割）で処理し、文字列置換しない。
 */
export const wahukon = definePlugin<WahukonOptions>({
  name: '@kappan/plugin-wahukon',
  version: '0.3.0',
  kind: 'typography',
  hooks: (options = {}) => {
    const className = options.className ?? 'wahukon';
    const boundaryRe = new RegExp(`(?<=[${JA}])(?=[${LATIN}])|(?<=[${LATIN}])(?=[${JA}])`, 'g');
    return {
      onMdast(tree: MdastRoot) {
        visit(tree, 'text', (node: Text, index, parent) => {
          if (!parent || typeof index !== 'number') return;
          if (!boundaryRe.test(node.value)) return;
          boundaryRe.lastIndex = 0;
          const segments = node.value.split(boundaryRe);
          if (segments.length < 2) return;
          const nodes: PhrasingContent[] = [];
          segments.forEach((seg, i) => {
            if (seg.length > 0) nodes.push({ type: 'text', value: seg });
            if (i < segments.length - 1) {
              nodes.push({
                type: 'emphasis',
                data: { hName: 'span', hProperties: { className: [className] } },
                children: [],
              } as unknown as PhrasingContent);
            }
          });
          (parent as Parent).children.splice(index, 1, ...nodes);
          return index + nodes.length;
        });
      },
    };
  },
});
