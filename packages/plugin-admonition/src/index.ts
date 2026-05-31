import { definePlugin } from '@kappan/core';
import type { Root as MdastRoot, RootContent, Paragraph, PhrasingContent } from 'mdast';
import { visit } from 'unist-util-visit';
import { z } from 'zod';

/**
 * 対応する囲み記事の種別。Re:VIEW の `//note //tip //warning //caution //important
 * //info //memo` に対応する。
 */
export const ADMONITION_KINDS = [
  'note',
  'tip',
  'warning',
  'caution',
  'important',
  'info',
  'memo',
] as const;

export type AdmonitionKind = (typeof ADMONITION_KINDS)[number];

const DEFAULT_TITLES_JP: Record<AdmonitionKind, string> = {
  note: '注記',
  tip: 'ヒント',
  warning: '警告',
  caution: '注意',
  important: '重要',
  info: '情報',
  memo: 'メモ',
};

const DEFAULT_TITLES_EN: Record<AdmonitionKind, string> = {
  note: 'Note',
  tip: 'Tip',
  warning: 'Warning',
  caution: 'Caution',
  important: 'Important',
  info: 'Info',
  memo: 'Memo',
};

export interface AdmonitionOptions {
  /** 既定タイトルの言語（既定 'jp'）。`labels` で個別上書きもできる。 */
  readonly labelStyle?: 'jp' | 'en';
  /** 種別ごとの既定タイトル上書き（例 `{ warning: '注意事項' }`）。 */
  readonly labels?: Partial<Record<AdmonitionKind, string>>;
  /**
   * タイトル行（`.admonition-title`）を常に出すか（既定 true）。
   * `false` にすると、明示ラベル（`:::warning[タイトル]`）が無いときタイトルを省く。
   */
  readonly showTitle?: boolean;
}

const optionsSchema = z
  .object({
    labelStyle: z.enum(['jp', 'en']).optional(),
    labels: z.record(z.string()).optional(),
    showTitle: z.boolean().optional(),
  })
  .default({});

/** remark-directive の containerDirective ノード（最小形）。 */
interface ContainerDirectiveNode {
  type: 'containerDirective';
  name: string;
  attributes?: Record<string, string | null | undefined> | null;
  children: RootContent[];
  data?: { hName?: string; hProperties?: Record<string, unknown>; directiveLabel?: boolean };
}

function isContainerDirective(node: { type: string }): node is ContainerDirectiveNode {
  return node.type === 'containerDirective';
}

/** phrasing ノード列からプレーンテキストを取り出す（タイトル抽出用）。 */
function toPlainText(nodes: readonly PhrasingContent[]): string {
  let s = '';
  for (const n of nodes) {
    if (n.type === 'text') s += n.value;
    else if ('children' in n && Array.isArray(n.children))
      s += toPlainText(n.children as PhrasingContent[]);
  }
  return s;
}

/**
 * 先頭の directiveLabel 段落（`:::name[ラベル]` の `[...]`）からタイトルを取り出し、
 * その段落を children から除く。ラベルが無ければ undefined を返す。
 */
function extractLabel(node: ContainerDirectiveNode): string | undefined {
  const first = node.children[0];
  if (
    first &&
    first.type === 'paragraph' &&
    (first.data as { directiveLabel?: boolean } | undefined)?.directiveLabel
  ) {
    const text = toPlainText((first as Paragraph).children).trim();
    node.children = node.children.slice(1);
    return text.length > 0 ? text : undefined;
  }
  return undefined;
}

/** `.admonition-title` として描画されるタイトル段落を作る（heading ノードは使わない）。 */
function makeTitle(title: string): Paragraph {
  return {
    type: 'paragraph',
    data: { hProperties: { className: ['admonition-title'] } },
    children: [{ type: 'text', value: title }],
  };
}

/**
 * 囲み記事（admonition）プラグイン。
 *
 * remark-directive の `:::note` 〜 `:::memo` を `<aside class="admonition <種別>">` に変換する。
 * テーマ CSS の `.admonition` / `.admonition.warning` / `.admonition.tip` / `.admonition-title`
 * がそのまま装飾する。
 *
 * 記法：
 *   ```markdown
 *   :::note
 *   本文。
 *   :::
 *
 *   :::warning[タイトル]
 *   タイトル付きの警告。
 *   :::
 *   ```
 *
 * 出力（`<aside class="admonition note"><p class="admonition-title">注記</p>…</aside>`）は
 * unsafeHtml の全モード（false / sanitized / trusted）で安定する（`data.hName` で生成するため）。
 */
export const admonition = definePlugin<AdmonitionOptions>({
  name: '@kappan/plugin-admonition',
  version: '0.1.0',
  kind: 'transform',
  schema: optionsSchema as z.ZodType<AdmonitionOptions>,
  hooks: (options = {}) => {
    const base = options.labelStyle === 'en' ? DEFAULT_TITLES_EN : DEFAULT_TITLES_JP;
    const titles: Record<AdmonitionKind, string> = { ...base, ...(options.labels ?? {}) };
    const showTitle = options.showTitle !== false;
    const kinds = new Set<string>(ADMONITION_KINDS);

    return {
      onMdast(tree: MdastRoot) {
        visit(tree, (node) => {
          if (!isContainerDirective(node)) return;
          if (!kinds.has(node.name)) return;
          const kind = node.name as AdmonitionKind;

          const explicitTitle = extractLabel(node);
          node.data = {
            ...node.data,
            hName: 'aside',
            hProperties: {
              ...(node.data?.hProperties ?? {}),
              className: ['admonition', kind],
            },
          };

          const title = explicitTitle ?? (showTitle ? titles[kind] : undefined);
          if (title !== undefined) {
            node.children = [makeTitle(title), ...node.children];
          }
        });
      },
    };
  },
});
