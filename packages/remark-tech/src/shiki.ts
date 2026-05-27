import { codeToHast, type BundledLanguage, type BundledTheme } from 'shiki';
import { definePlugin } from '@kappan/core';
import type { Root as HastRoot, Element, ElementContent, Parents } from 'hast';
import { visit } from 'unist-util-visit';

export interface ShikiOptions {
  /** ハイライトに使うテーマ。デフォルト 'github-light' */
  readonly theme?: BundledTheme;
}

interface PreTarget {
  readonly parent: Parents;
  readonly index: number;
  readonly source: string;
  readonly lang: string;
}

/**
 * shiki によるコードハイライトプラグイン。
 *
 * 動作：
 *   - rehype が生成する `<pre><code class="language-xxx">...</code></pre>` を見つける
 *   - shiki の `codeToHast` で hast に変換し、元の pre を置き換える
 *   - 言語指定がない or shiki が対応していない言語はスキップ
 *
 * EPUB に shiki の inline スタイルがそのまま埋め込まれるため、Reading System の
 * CSS 制限を受けず、どのリーダーでも同じ見た目になる。
 *
 * 公式プラグインカタログでは ★★ ranking。
 */
export const shikiHighlight = definePlugin<ShikiOptions>({
  name: '@kappan/remark-tech/shiki',
  version: '0.3.0',
  kind: 'typography',
  hooks: (options = {}) => {
    const theme = options.theme ?? 'github-light';
    return {
      async onHast(tree: HastRoot, ctx) {
        // 第1パス：対象 <pre><code class="language-*"> を集める
        const targets: PreTarget[] = [];
        visit(tree, 'element', (node, index, parent) => {
          if (node.tagName !== 'pre') return;
          if (!parent || typeof index !== 'number') return;
          const code = node.children.find(
            (c): c is Element => c.type === 'element' && c.tagName === 'code',
          );
          if (!code) return;
          const lang = extractLanguage(code);
          if (!lang) return;
          targets.push({ parent, index, source: extractText(code), lang });
        });

        // 第2パス：各対象を shiki で変換して差し替える
        await Promise.all(
          targets.map(async (t) => {
            try {
              const highlighted = (await codeToHast(t.source, {
                lang: t.lang as BundledLanguage,
                theme,
              })) as HastRoot;
              const newPre = highlighted.children.find(
                (c): c is Element => c.type === 'element' && c.tagName === 'pre',
              );
              if (newPre) {
                t.parent.children[t.index] = newPre as ElementContent;
              }
            } catch (err) {
              ctx.logger.warn(
                `shiki: cannot highlight language "${t.lang}" (${(err as Error).message})`,
              );
            }
          }),
        );
      },
    };
  },
});

function extractLanguage(code: Element): string | null {
  const classes = code.properties?.['className'];
  if (!Array.isArray(classes)) return null;
  for (const c of classes) {
    if (typeof c === 'string' && c.startsWith('language-')) {
      return c.slice('language-'.length);
    }
  }
  return null;
}

function extractText(element: Element): string {
  const parts: string[] = [];
  for (const child of element.children) {
    if (child.type === 'text') {
      parts.push(child.value);
    } else if (child.type === 'element') {
      parts.push(extractText(child));
    }
  }
  return parts.join('');
}
