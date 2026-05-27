import { definePlugin } from '@kappan/core';
import type { Root as MdastRoot, Text, Parent, PhrasingContent } from 'mdast';
import { visit } from 'unist-util-visit';

export interface TcySmartOptions {
  /** 縦中横にする最大桁数（デフォルト 2）。3 以上は縦中横にしない */
  readonly maxDigits?: number;
  /** 縦中横 span の class（デフォルト 'tcy'） */
  readonly className?: string;
}

/**
 * 縦中横（tate-chu-yoko）の文脈判定プラグイン。
 *
 * 縦組みで「半角 2 桁数字」を正立させる `.tcy` を自動付与する。
 * 桁数が `maxDigits` を超える数字や、年号（4 桁）は対象外とする
 * （4 桁年は縦組みでは縦に流すのが一般的）。
 *
 * 注意：本プラグインは記法付与のみで、
 * `writing-mode: horizontal-tb` のビルドでも害なく `.tcy` class が付くだけ。
 *
 * AST レベルで text を分割し、文字列置換しない。
 */
export const tcySmart = definePlugin<TcySmartOptions>({
  name: '@kappan/plugin-tcy-smart',
  version: '0.3.0',
  kind: 'typography',
  hooks: (options = {}) => {
    const maxDigits = options.maxDigits ?? 2;
    const className = options.className ?? 'tcy';
    // 前後が数字でない 1〜maxDigits 桁の半角数字
    const re = new RegExp(`(?<![0-9])([0-9]{1,${maxDigits}})(?![0-9])`, 'g');
    return {
      onMdast(tree: MdastRoot) {
        visit(tree, 'text', (node: Text, index, parent) => {
          if (!parent || typeof index !== 'number') return;
          re.lastIndex = 0;
          if (!re.test(node.value)) return;
          re.lastIndex = 0;
          const nodes: PhrasingContent[] = [];
          let cursor = 0;
          let m: RegExpExecArray | null;
          while ((m = re.exec(node.value)) !== null) {
            if (m.index > cursor) {
              nodes.push({ type: 'text', value: node.value.slice(cursor, m.index) });
            }
            nodes.push({
              type: 'emphasis',
              data: { hName: 'span', hProperties: { className: [className] } },
              children: [{ type: 'text', value: m[1]! }],
            } as unknown as PhrasingContent);
            cursor = m.index + m[0].length;
          }
          if (cursor < node.value.length) {
            nodes.push({ type: 'text', value: node.value.slice(cursor) });
          }
          (parent as Parent).children.splice(index, 1, ...nodes);
          return index + nodes.length;
        });
      },
    };
  },
});
