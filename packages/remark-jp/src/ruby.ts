import { definePlugin } from '@kappan/core';
import type { Root as HastRoot, Element, ElementContent, Text } from 'hast';
import { visit } from 'unist-util-visit';

export interface RubyOptions {
  /** 簡易ルビ記法 `{漢字|かんじ}` を有効化（デフォルト true） */
  readonly enablePipeSyntax?: boolean;
}

/**
 * ルビ記法プラグイン。
 *
 * 対応する記法：
 *   - 簡易形式：`{漢字|かんじ}` → `<ruby>漢字<rt>かんじ</rt></ruby>`
 *
 * 設計：
 *   - hast 段階でテキストノードを走査する（mdast に独自記法ノードを足さない）
 *   - 既存の Markdown パーサと完全に互換（パイプ区切りはCommonMarkで無害）
 *   - コードブロックや code 要素内は変換しない
 *
 * 公式プラグインカタログでは ★★★ ranking。
 */
export const ruby = definePlugin<RubyOptions>({
  name: '@kappan/remark-jp/ruby',
  version: '0.3.0',
  kind: 'typography',
  hooks: (options = {}) => {
    const enablePipeSyntax = options.enablePipeSyntax !== false;
    return {
      onHast(tree: HastRoot) {
        visit(tree, 'element', (node, _index, parent) => {
          // コード要素内のテキストはルビ変換しない
          if (isCodeContext(node, parent)) return 'skip' as const;

          const newChildren: ElementContent[] = [];
          let changed = false;
          for (const child of node.children) {
            if (child.type === 'text' && enablePipeSyntax) {
              const expanded = expandRubyText(child);
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
    };
  },
});

function isCodeContext(node: Element, parent: unknown): boolean {
  if (node.tagName === 'code' || node.tagName === 'pre') return true;
  const p = parent as Element | undefined;
  if (p && (p.tagName === 'code' || p.tagName === 'pre')) return true;
  return false;
}

/** `{漢字|かんじ}` パターン。'|' 以降が読み仮名 */
const RUBY_RE = /\{([^{}|]+)\|([^{}|]+)\}/g;

/**
 * 1つのテキストノードを、ルビパターンで分割した一連のノードに変換する。
 * パターンが見つからなければ元のノードを単独で返す（参照同一）。
 */
function expandRubyText(text: Text): ElementContent[] {
  const value = text.value;
  RUBY_RE.lastIndex = 0;
  if (!RUBY_RE.test(value)) return [text];
  RUBY_RE.lastIndex = 0;

  const out: ElementContent[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = RUBY_RE.exec(value)) !== null) {
    const before = value.slice(cursor, match.index);
    if (before) out.push({ type: 'text', value: before });
    out.push(makeRubyElement(match[1]!, match[2]!));
    cursor = match.index + match[0].length;
  }
  const after = value.slice(cursor);
  if (after) out.push({ type: 'text', value: after });
  return out;
}

function makeRubyElement(base: string, reading: string): Element {
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
