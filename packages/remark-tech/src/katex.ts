import katex from 'katex';
import { fromHtml } from 'hast-util-from-html';
import { definePlugin } from '@kappan/core';
import type { Root as MdastRoot, Text, Paragraph, Parent, PhrasingContent } from 'mdast';
import type { Root as HastRoot, Element, ElementContent } from 'hast';
import { visit } from 'unist-util-visit';

export interface KatexOptions {
  /**
   * 出力形式。
   *   - `'mathml'`（デフォルト）：EPUB 3 ネイティブの MathML。アクセシブルで EPUB 標準。
   *   - `'htmlAndMathml'`：KaTeX の HTML/CSS 描画 + 隠し MathML。見た目互換性が高いが
   *     KaTeX の CSS をテーマに同梱する必要がある。
   *
   * 注意：KaTeX は SVG 出力を持たない（視覚描画は HTML+CSS）。EPUB のセマンティクスと
   * アクセシビリティを優先し、デフォルトは `'mathml'`。
   */
  readonly output?: 'mathml' | 'htmlAndMathml';
  /** パースエラー時にビルドを止めず元の TeX をそのまま残す（デフォルト false=残す） */
  readonly throwOnError?: boolean;
}

// インライン数式 `$...$`（`$$` ブロックと衝突しない）
const INLINE_MATH_RE = /(?<!\$)\$(?!\$)([^$\n]+?)\$(?!\$)/g;
// ブロック数式 `$$...$$`（段落全体が数式）
const BLOCK_MATH_RE = /^\s*\$\$([\s\S]+?)\$\$\s*$/;

const DATA_TEX = 'dataKatexTex';
const DATA_DISPLAY = 'dataKatexDisplay';

/**
 * KaTeX による数式レンダリングプラグイン。
 *
 * 記法：
 *   - インライン `$ ... $`
 *   - ブロック `$$ ... $$`（単独段落、または plugin-review-compat の `//texequation` 由来）
 *
 * 2 パス構成：
 *   - `onMdast`：`$...$` / `$$...$$` を検出し、TeX ソースを data 属性に持つ
 *     プレースホルダ要素（span.math / div.math）に置き換える
 *   - `onHast`：プレースホルダを KaTeX でレンダリングし、出力 HTML を hast に
 *     パースして実要素として埋め込む（raw 文字列を残さないので `unsafeHtml` 設定に
 *     依存せず数式が出力される）
 */
export const katexMath = definePlugin<KatexOptions>({
  name: '@kappan/remark-tech/katex',
  version: '0.3.0',
  kind: 'transform',
  hooks: (options = {}) => {
    const output = options.output ?? 'mathml';
    const throwOnError = options.throwOnError ?? false;

    return {
      onMdast(tree: MdastRoot) {
        // 1) ブロック数式：単独段落が `$$..$$`
        visit(tree, 'paragraph', (para: Paragraph) => {
          if (para.children.length !== 1) return;
          const only = para.children[0];
          if (!only || only.type !== 'text') return;
          const m = only.value.match(BLOCK_MATH_RE);
          if (!m) return;
          para.data = {
            hName: 'div',
            hProperties: {
              className: ['math', 'math-display'],
              [DATA_TEX]: m[1]!.trim(),
              [DATA_DISPLAY]: 'true',
            },
          };
          para.children = [];
        });

        // 2) インライン数式
        visit(tree, 'text', (node: Text, index, parent) => {
          if (!parent || typeof index !== 'number') return;
          INLINE_MATH_RE.lastIndex = 0;
          if (!INLINE_MATH_RE.test(node.value)) return;
          INLINE_MATH_RE.lastIndex = 0;
          const nodes: PhrasingContent[] = [];
          let cursor = 0;
          let m: RegExpExecArray | null;
          while ((m = INLINE_MATH_RE.exec(node.value)) !== null) {
            if (m.index > cursor) {
              nodes.push({ type: 'text', value: node.value.slice(cursor, m.index) });
            }
            nodes.push({
              type: 'emphasis',
              data: {
                hName: 'span',
                hProperties: {
                  className: ['math', 'math-inline'],
                  [DATA_TEX]: m[1]!.trim(),
                  [DATA_DISPLAY]: 'false',
                },
              },
              children: [],
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

      onHast(tree: HastRoot, ctx) {
        visit(tree, 'element', (node: Element) => {
          const props = node.properties ?? {};
          const tex = props[DATA_TEX];
          if (typeof tex !== 'string' || tex.length === 0) return;
          const displayMode = props[DATA_DISPLAY] === 'true';
          let html: string;
          try {
            html = katex.renderToString(tex, { output, displayMode, throwOnError });
          } catch (err) {
            ctx.logger.warn(`katex: render failed for "${tex}": ${(err as Error).message}`);
            node.children = [{ type: 'text', value: tex }];
            return;
          }
          // KaTeX 出力をフラグメントとして hast にパースし、実要素を子に据える。
          const fragment = fromHtml(html, { fragment: true });
          node.children = fragment.children as ElementContent[];
          // data 属性はもう不要なので除去（XHTML を汚さない）
          const cleaned = { ...props };
          delete cleaned[DATA_TEX];
          delete cleaned[DATA_DISPLAY];
          node.properties = cleaned;
        });
      },
    };
  },
});
