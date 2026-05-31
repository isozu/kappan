import { definePlugin } from '@kappan/core';
import type { Root as HastRoot, Element, ElementContent, Text } from 'hast';
import { visit } from 'unist-util-visit';

export interface RubyOptions {
  /** 簡易ルビ記法 `{漢字|かんじ}` を有効化（デフォルト true） */
  readonly enablePipeSyntax?: boolean;
  /** 属性ルビ記法 `[漢字]{ruby="かんじ"}` を有効化（デフォルト true） */
  readonly enableAttrSyntax?: boolean;
}

/**
 * ルビ記法プラグイン。
 *
 * 対応する記法（どちらも同じ `<ruby>漢字<rt>かんじ</rt></ruby>` を出力）：
 *   - パイプ形式：`{漢字|かんじ}`
 *   - 属性形式　：`[漢字]{ruby="かんじ"}`（Pandoc / markdown-it-attrs 互換。`kenten` と同系統）
 *
 * 設計：
 *   - hast 段階でテキストノードを走査する（mdast に独自記法ノードを足さない）
 *   - 既存の Markdown パーサと完全に互換（パイプ区切り・`[…]{…}` はCommonMarkで無害）
 *   - コードブロックや code 要素内は変換しない
 *   - 2 形式は出現位置順に 1 パスで処理する（混在しても順序が保たれる）
 *
 * 公式プラグインカタログでは ★★★ ranking。
 */
export const ruby = definePlugin<RubyOptions>({
  name: '@kappan/remark-jp/ruby',
  version: '0.4.0',
  kind: 'typography',
  hooks: (options = {}) => {
    const enablePipeSyntax = options.enablePipeSyntax !== false;
    const enableAttrSyntax = options.enableAttrSyntax !== false;
    return {
      onHast(tree: HastRoot) {
        if (!enablePipeSyntax && !enableAttrSyntax) return;
        visit(tree, 'element', (node, _index, parent) => {
          // コード要素内のテキストはルビ変換しない
          if (isCodeContext(node, parent)) return 'skip' as const;

          const newChildren: ElementContent[] = [];
          let changed = false;
          for (const child of node.children) {
            if (child.type === 'text') {
              const expanded = expandRubyText(child, enablePipeSyntax, enableAttrSyntax);
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

/**
 * ルビ 2 形式をまとめて拾う正規表現。
 *   - パイプ形式 `{漢字|かんじ}` → group 1（base）/ group 2（reading）
 *   - 属性形式 `[漢字]{ruby="かんじ"}` → group 3（base）/ group 4（reading）
 * 交互（`|`）にすることで出現位置順に 1 パスで処理できる。
 */
const RUBY_RE = /\{([^{}|]+)\|([^{}|]+)\}|\[([^\]]+)\]\{ruby="([^"]+)"\}/g;

/**
 * 1つのテキストノードを、ルビパターンで分割した一連のノードに変換する。
 * 有効化された形式のマッチだけを `<ruby>` 化し、無効な形式や非マッチはそのまま残す。
 * 何も変換しなければ元のノードを単独で返す（参照同一）。
 */
function expandRubyText(text: Text, enablePipe: boolean, enableAttr: boolean): ElementContent[] {
  const value = text.value;
  RUBY_RE.lastIndex = 0;

  const out: ElementContent[] = [];
  let cursor = 0;
  let changed = false;
  let match: RegExpExecArray | null;
  while ((match = RUBY_RE.exec(value)) !== null) {
    const isPipe = match[1] !== undefined;
    // 無効化された形式のマッチは変換せず、後続の `before` スライスに含めて残す。
    if ((isPipe && !enablePipe) || (!isPipe && !enableAttr)) continue;

    const base = isPipe ? match[1]! : match[3]!;
    const reading = isPipe ? match[2]! : match[4]!;
    const before = value.slice(cursor, match.index);
    if (before) out.push({ type: 'text', value: before });
    out.push(makeRubyElement(base, reading));
    cursor = match.index + match[0].length;
    changed = true;
  }
  if (!changed) return [text];
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
