import {
  definePlugin,
  CHAPTER_REGISTRY_CACHE_KEY,
  type ChapterRegistry,
  type ColumnRecord,
} from '@kappan/core';
import type {
  Root as MdastRoot,
  RootContent,
  Paragraph,
  PhrasingContent,
  Link,
  Text,
  Parent,
} from 'mdast';
import { visit } from 'unist-util-visit';
import { z } from 'zod';

export interface ColumnOptions {
  /**
   * 相互参照（`[@col:id]`）のラベル書式。`{title}` がコラムのタイトルに置換される。
   * 既定 `コラム「{title}」`。英語なら `column({ refLabel: 'the column "{title}"' })`。
   */
  readonly refLabel?: string;
}

const optionsSchema = z
  .object({
    refLabel: z.string().min(1).optional(),
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

function toPlainText(nodes: readonly PhrasingContent[]): string {
  let s = '';
  for (const n of nodes) {
    if (n.type === 'text') s += n.value;
    else if ('children' in n && Array.isArray(n.children))
      s += toPlainText(n.children as PhrasingContent[]);
  }
  return s;
}

/** 先頭の directiveLabel 段落からタイトルを取り出し、children から除く。 */
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

/** `{#col:id}` / `{#id}` の id 値からコラム id を取り出す（`col:` 接頭辞は剥がす）。 */
function normalizeColumnId(rawId: string | null | undefined): string | undefined {
  if (!rawId) return undefined;
  const id = rawId.startsWith('col:') ? rawId.slice(4) : rawId;
  return id.length > 0 ? id : undefined;
}

/** EPUBCheck がコロンを嫌うので `col-<id>` 形式にする（figure-numbering と同方針）。 */
function anchorIdFor(colId: string): string {
  return `col-${colId}`;
}

/** `.column-title` として描画されるタイトル段落（heading ノードは使わない）。 */
function makeTitle(title: string): Paragraph {
  return {
    type: 'paragraph',
    data: { hProperties: { className: ['admonition-title', 'column-title'] } },
    children: [{ type: 'text', value: title }],
  };
}

const REF_RE = /\[@col:([a-zA-Z0-9_/-]+)\]/g;

interface ResolvedRef {
  readonly label: string;
  readonly href?: string;
}

/** text ノードを走査して `[@col:id]` を resolve の結果（リンク or 素テキスト）に置換する。 */
function linkifyRefs(tree: MdastRoot, resolve: (raw: string) => ResolvedRef | undefined): void {
  const visitParent = (parent: Parent): void => {
    if (!Array.isArray(parent.children)) return;
    const out: RootContent[] = [];
    for (const child of parent.children as RootContent[]) {
      if (child.type === 'text') {
        const replaced = transformText(child as Text, resolve);
        if (replaced) {
          out.push(...(replaced as RootContent[]));
          continue;
        }
      }
      out.push(child);
    }
    parent.children = out as Parent['children'];
    for (const child of parent.children as RootContent[]) {
      // inlineCode / code は children を持たない（記法例を壊さない）。
      if (
        child &&
        typeof child === 'object' &&
        'children' in child &&
        Array.isArray((child as Parent).children)
      ) {
        visitParent(child as Parent);
      }
    }
  };
  visitParent(tree as unknown as Parent);
}

function transformText(
  node: Text,
  resolve: (raw: string) => ResolvedRef | undefined,
): PhrasingContent[] | null {
  const value = node.value;
  REF_RE.lastIndex = 0;
  if (!REF_RE.test(value)) return null;
  REF_RE.lastIndex = 0;
  const out: PhrasingContent[] = [];
  let cursor = 0;
  let changed = false;
  let m: RegExpExecArray | null;
  while ((m = REF_RE.exec(value)) !== null) {
    const resolved = resolve(m[1]!);
    if (!resolved) continue; // 未解決：素のテキストに残す（後段で警告）
    if (m.index > cursor) out.push({ type: 'text', value: value.slice(cursor, m.index) });
    if (resolved.href) {
      const link: Link = {
        type: 'link',
        url: resolved.href,
        title: null,
        data: { hProperties: { className: ['kappan-xref', 'kappan-colref'] } },
        children: [{ type: 'text', value: resolved.label }],
      };
      out.push(link);
    } else {
      out.push({ type: 'text', value: resolved.label });
    }
    cursor = m.index + m[0].length;
    changed = true;
  }
  if (!changed) return null;
  if (cursor < value.length) out.push({ type: 'text', value: value.slice(cursor) });
  return out;
}

/** 残った未解決 `[@col:id]` を warning として報告する。 */
function warnUnresolvedRefs(
  tree: MdastRoot,
  path: string,
  emit: (d: { severity: 'warning'; source: string; message: string }) => void,
): void {
  const seen = new Set<string>();
  visit(tree, 'text', (node: Text) => {
    REF_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = REF_RE.exec(node.value)) !== null) {
      const id = m[1]!;
      if (seen.has(id)) continue;
      seen.add(id);
      emit({
        severity: 'warning',
        source: '@kappan/plugin-column',
        message: `未解決のコラム参照 [@col:${id}]（${path}）。:::column[…]{#col:${id}} が定義されているか確認してください。`,
      });
    }
  });
}

/** 1 コラムの定義（onMdast で集めて onMdastAllChapters で参照解決・TOC 追記に使う）。 */
interface ColumnDef {
  readonly id: string;
  readonly title: string;
  readonly anchorId: string;
}

/**
 * コラム（傍流記事）プラグイン。
 *
 * remark-directive の `:::column[タイトル]{#col:id}` を
 * `<aside epub:type="sidebar" class="admonition column">` に変換し、
 *   - 目次（`plugin-toc`）に「コラム」行として載せ、
 *   - 本文中の `[@col:id]` をコラムへのハイパーリンクに解決する。
 *
 * 章をまたぐ参照は `[@col:章ID/id]`（例 `[@col:ch03/why-fast]`）。章 ID は
 * `plugin-heading-number` が publish する `ChapterRegistry` のキー（章ファイルの id）。
 *
 * **プラグイン順**：`plugins` 配列で `headingNumber()` の後・`toc()` の前後どちらでもよいが
 * `headingNumber()` より後に置くこと（ChapterRegistry を前提とするため）。
 */
export const column = definePlugin<ColumnOptions>({
  name: '@kappan/plugin-column',
  version: '0.1.0',
  kind: 'transform',
  schema: optionsSchema as z.ZodType<ColumnOptions>,
  hooks: (options = {}) => {
    const refLabelTemplate = options.refLabel ?? 'コラム「{title}」';
    const refLabel = (title: string): string => refLabelTemplate.replace('{title}', title);

    // onMdast で集めたコラム定義を tree 単位で持ち越す（同じ tree 参照が
    // onMdastAllChapters に渡る）。
    const columnsByTree = new WeakMap<MdastRoot, ColumnDef[]>();

    return {
      onMdast(tree: MdastRoot) {
        const defs: ColumnDef[] = [];
        visit(tree, (node) => {
          if (!isContainerDirective(node)) return;
          if (node.name !== 'column') return;

          const title = extractLabel(node) ?? node.attributes?.title ?? '';
          const colId = normalizeColumnId(node.attributes?.id);
          const anchorId = colId ? anchorIdFor(colId) : undefined;

          node.data = {
            ...node.data,
            hName: 'aside',
            hProperties: {
              ...(node.data?.hProperties ?? {}),
              className: ['admonition', 'column'],
              'epub:type': 'sidebar',
              ...(anchorId ? { id: anchorId } : {}),
            },
          };

          if (title.length > 0) {
            node.children = [makeTitle(title), ...node.children];
          }
          if (colId && anchorId) {
            defs.push({ id: colId, title, anchorId });
          }
        });
        columnsByTree.set(tree, defs);
      },

      onMdastAllChapters(trees, ctx) {
        const registry = ctx.cache.get<ChapterRegistry>(CHAPTER_REGISTRY_CACHE_KEY);

        // 1) 全章のコラムを集め、ChapterRegistry のレコードに追記し、
        //    章 ID → (コラム id → 定義) の lookup を作る。
        const byChapterId = new Map<string, Map<string, ColumnDef>>();
        for (const { tree, path } of trees) {
          const defs = columnsByTree.get(tree) ?? [];
          if (defs.length === 0) continue;
          const record = registry?.byPath.get(path);
          if (record) {
            const columns: ColumnRecord[] = defs.map((d) => ({
              id: d.id,
              anchorId: d.anchorId,
              title: d.title,
            }));
            record.columns = columns;
            byChapterId.set(record.id, new Map(defs.map((d) => [d.id, d])));
          }
        }

        // 2) 参照を解決する。同章 `[@col:id]` は `#col-id`、
        //    他章 `[@col:章ID/id]` は `章ID.xhtml#col-id`。
        for (const { tree, path } of trees) {
          const defs = columnsByTree.get(tree) ?? [];
          const localById = new Map(defs.map((d) => [d.id, d]));

          linkifyRefs(tree, (raw) => {
            if (raw.includes('/')) {
              const slash = raw.indexOf('/');
              const chapterId = raw.slice(0, slash);
              const id = raw.slice(slash + 1);
              const def = byChapterId.get(chapterId)?.get(id);
              if (!def) return undefined;
              return { label: refLabel(def.title), href: `${chapterId}.xhtml#${def.anchorId}` };
            }
            const def = localById.get(raw);
            if (!def) return undefined;
            return { label: refLabel(def.title), href: `#${def.anchorId}` };
          });

          warnUnresolvedRefs(tree, path, ctx.emit);
        }
      },
    };
  },
});
