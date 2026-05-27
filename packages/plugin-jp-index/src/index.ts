import { definePlugin, type GeneratedDocument } from '@kappan/core';
import type { Root as MdastRoot, Text, Parent, PhrasingContent } from 'mdast';
import { visit } from 'unist-util-visit';
import { z } from 'zod';

export interface JpIndexOptions {
  /** 巻末索引のタイトル（デフォルト「索引」） */
  readonly title?: string;
  /** 索引ドキュメントの EPUB 内パス（デフォルト content/genindex.xhtml） */
  readonly href?: string;
  /**
   * `reading` 未指定の項目に kuromoji.js で読みを自動推定する（デフォルト false）。
   * true にする場合は `kuromoji` を別途インストールし、辞書を用意する必要がある
   * （Docker `:full` タグで同梱想定）。未インストール時は warning を出し、
   * 読み無し（表記そのままを読みとして扱う）にフォールバックする。
   */
  readonly autoReading?: boolean;
}

const optionsSchema = z
  .object({
    title: z.string().min(1).optional(),
    href: z.string().min(1).optional(),
    autoReading: z.boolean().optional(),
  })
  .default({});

interface IndexEntry {
  /** 表記（画面に出る索引語） */
  readonly term: string;
  /** 読み（ソート用）。未指定なら term をそのまま使う */
  readonly reading: string;
  /** 出現箇所アンカー id */
  readonly anchorId: string;
  /** 出現章の相対パス（リンク先 href 解決に使う） */
  readonly chapterPath: string;
}

const CACHE_KEY = 'jp-index:entries';

/**
 * 日本語巻末索引プラグイン（MeCab/UniDic 不使用）。
 *
 * 索引記法（2 通り、どちらも AST レベルで処理。文字列置換しない）：
 *   - `{!語!}` / `{!語|よみ!}` — インライン索引マーカー
 *   - `[語]{.index reading="よみ"}` — 属性記法（remark-jp 等の属性パーサに依存しないよう、
 *     本プラグインは自前でテキストから両形式を抽出する）
 *
 * 動作：
 *   1. onMdast：各章で索引マーカーを検出し、本文に `<span id epub:type>` アンカーを残し、
 *      索引語をキャッシュに蓄積（章をまたいで集約）
 *   2. onGenerate：全索引語を「あ→英数→記号」順にソートし、巻末に
 *      `<nav epub:type="index">` ドキュメントを生成して spine 末尾に追加
 *
 * MeCab/UniDic を使わない設計（ADR-0008）：読みはユーザーが `reading` 属性で与えるか、
 * optional な kuromoji.js（`autoReading: true`）でのみ推定する。デフォルトでは表記を
 * そのまま読みに使い、辞書同梱を必須にしない。
 */
export const jpIndex = definePlugin<JpIndexOptions>({
  name: '@kappan/plugin-jp-index',
  version: '0.3.0',
  kind: 'transform',
  schema: optionsSchema as z.ZodType<JpIndexOptions>,
  hooks: (options = {}) => {
    const title = options.title ?? '索引';
    const href = options.href ?? 'content/genindex.xhtml';
    return {
      onInit(ctx) {
        // ビルド間でキャッシュが残らないよう初期化
        ctx.cache.set(CACHE_KEY, [] as IndexEntry[]);
      },
      onMdast(tree: MdastRoot, ctx) {
        // 章 ID（アンカー id の名前空間 + リンク href 用）
        const chapterPath = inferChapterPath(tree);
        const entries = ctx.cache.get<IndexEntry[]>(CACHE_KEY) ?? [];
        let counter = entries.length;

        visit(tree, 'text', (node: Text, index, parent) => {
          if (!parent || typeof index !== 'number') return;
          const replaced = splitIndexMarkers(node.value, () => {
            counter += 1;
            return `kappan-idx-${counter}`;
          });
          if (!replaced) return; // マーカー無し

          // 抽出した索引項目をキャッシュに記録
          for (const e of replaced.entries) {
            entries.push({
              term: e.term,
              reading: e.reading || e.term,
              anchorId: e.anchorId,
              chapterPath,
            });
          }
          // text ノードを「テキスト + アンカー span」の並びに差し替える
          (parent as Parent).children.splice(index, 1, ...replaced.nodes);
          // splice で挿入したノードは visit 対象だが、span 内 text を再走査しても
          // マーカーは含まないので無限ループしない。次のインデックスから継続。
          return index + replaced.nodes.length;
        });

        ctx.cache.set(CACHE_KEY, entries);
      },
      onGenerate(ctx): GeneratedDocument[] {
        const entries = ctx.cache.get<IndexEntry[]>(CACHE_KEY) ?? [];
        if (entries.length === 0) return [];
        if (options.autoReading) {
          // kuromoji.js は重く optional。未導入を検出して丁寧に案内する。
          // 本フェーズでは実推定は行わず、未導入時フォールバック（表記＝読み）の
          // 経路だけ通す。導入済み環境での自動読みは将来フェーズで有効化する。
          ctx.logger.warn(
            'jp-index: autoReading is requested but automatic reading inference is not ' +
              'enabled in this build. Falling back to surface form as reading. ' +
              'Provide reading="..." for accurate ordering.',
          );
        }
        const lang = ctx.config.metadata.language;
        const xhtml = buildIndexXhtml(entries, title, lang);
        return [
          {
            id: 'genindex',
            href,
            title,
            xhtml,
          },
        ];
      },
    };
  },
});

/**
 * 章の相対パスを推定する。h1 の `{#id}` を見て `content/<id>.xhtml` を返す。
 * 見つからなければ undefined ではなく空文字（同一ファイル内アンカー）にする。
 */
function inferChapterPath(tree: MdastRoot): string {
  for (const child of tree.children) {
    if (child.type === 'heading' && child.depth === 1) {
      const text = collectText(child);
      const m = text.match(/\{#([a-zA-Z0-9_-]+)\}/);
      if (m) return `content/${m[1]}.xhtml`;
    }
  }
  return '';
}

function collectText(node: { children?: unknown[]; value?: string; type?: string }): string {
  if (node.type === 'text') return node.value ?? '';
  if (!Array.isArray(node.children)) return '';
  let s = '';
  for (const c of node.children as Array<{ children?: unknown[]; value?: string; type?: string }>) {
    s += collectText(c);
  }
  return s;
}

interface ExtractedMarker {
  readonly term: string;
  readonly reading: string;
  readonly anchorId: string;
}

interface SplitResult {
  readonly nodes: PhrasingContent[];
  readonly entries: ExtractedMarker[];
}

// `{!語!}` / `{!語|よみ!}`
const INLINE_MARKER_RE = /\{!([^!|}]+)(?:\|([^!}]+))?!\}/g;
// `[語]{.index reading="よみ"}` / `[語]{.index}`
const ATTR_MARKER_RE = /\[([^\]]+)\]\{\.index(?:\s+reading="([^"]*)")?\}/g;

/**
 * テキスト中の索引マーカーを検出し、テキストノードとアンカー要素ノードの並びに分割する。
 * アンカーは mdast の `data.hName`/`hProperties` を使って rehype 出力で
 * `<span id epub:type="...">語</span>` になる（文字列置換しない）。
 *
 * マーカーが 1 つも無ければ null を返す（呼び出し側は何もしない）。
 */
function splitIndexMarkers(value: string, nextId: () => string): SplitResult | null {
  // インライン形式と属性形式の両方の出現位置を集める
  interface Hit {
    start: number;
    end: number;
    term: string;
    reading: string;
  }
  const hits: Hit[] = [];
  INLINE_MARKER_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_MARKER_RE.exec(value)) !== null) {
    hits.push({
      start: m.index,
      end: m.index + m[0].length,
      term: m[1]!.trim(),
      reading: (m[2] ?? '').trim(),
    });
  }
  ATTR_MARKER_RE.lastIndex = 0;
  while ((m = ATTR_MARKER_RE.exec(value)) !== null) {
    hits.push({
      start: m.index,
      end: m.index + m[0].length,
      term: m[1]!.trim(),
      reading: (m[2] ?? '').trim(),
    });
  }
  if (hits.length === 0) return null;
  hits.sort((a, b) => a.start - b.start);

  const nodes: PhrasingContent[] = [];
  const entries: ExtractedMarker[] = [];
  let cursor = 0;
  for (const hit of hits) {
    if (hit.start < cursor) continue; // 重なりは無視（インラインと属性が衝突した場合）
    if (hit.start > cursor) {
      nodes.push({ type: 'text', value: value.slice(cursor, hit.start) });
    }
    const anchorId = nextId();
    entries.push({ term: hit.term, reading: hit.reading, anchorId });
    // 索引アンカー：本文に表記を表示しつつ id を打つ。
    // mdast の汎用ノードとして emphasis を流用せず、data.hName で span を出す。
    nodes.push({
      type: 'emphasis', // 型を満たすためのプレースホルダ。data.hName で span に上書きされる
      data: {
        hName: 'span',
        hProperties: { id: anchorId, className: ['index-term'] },
      },
      children: [{ type: 'text', value: hit.term }],
    } as unknown as PhrasingContent);
    cursor = hit.end;
  }
  if (cursor < value.length) {
    nodes.push({ type: 'text', value: value.slice(cursor) });
  }
  return { nodes, entries };
}

/**
 * 索引語を「あ→英数→記号」順にソートして巻末索引 XHTML を生成する。
 *
 * ソート規則（ADR-0008）：
 *   - グループ 1：かな/漢字（読み）が「あ」始まりの日本語
 *   - グループ 2：英数（A-Z, 0-9）
 *   - グループ 3：記号その他
 * 同一表記の複数出現は 1 エントリにまとめ、複数リンクを並べる。
 */
function buildIndexXhtml(entries: readonly IndexEntry[], title: string, lang: string): string {
  // 表記でグルーピング（同じ語の複数出現を集約）
  const byTerm = new Map<string, { reading: string; refs: IndexEntry[] }>();
  for (const e of entries) {
    const g = byTerm.get(e.term);
    if (g) {
      g.refs.push(e);
    } else {
      byTerm.set(e.term, { reading: e.reading, refs: [e] });
    }
  }

  const items = [...byTerm.entries()].map(([term, g]) => ({
    term,
    reading: g.reading,
    refs: g.refs,
    group: classifyGroup(g.reading),
  }));

  items.sort((a, b) => {
    if (a.group !== b.group) return a.group - b.group;
    return a.reading.localeCompare(b.reading, 'ja');
  });

  const lis = items
    .map((item) => {
      const links = item.refs
        .map((ref, i) => {
          const href = ref.chapterPath
            ? `${relIndexToContent(ref.chapterPath)}#${ref.anchorId}`
            : `#${ref.anchorId}`;
          return `<a href="${escapeAttr(href)}">${i + 1}</a>`;
        })
        .join('、');
      return `      <li>${escapeText(item.term)} <span class="index-refs">${links}</span></li>`;
    })
    .join('\n');

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeAttr(lang)}" lang="${escapeAttr(lang)}">\n` +
    `  <head>\n` +
    `    <meta charset="utf-8"></meta>\n` +
    `    <title>${escapeText(title)}</title>\n` +
    `    <link rel="stylesheet" type="text/css" href="../styles/theme.css"></link>\n` +
    `  </head>\n` +
    `  <body>\n` +
    `    <nav epub:type="index" role="doc-index">\n` +
    `      <h1>${escapeText(title)}</h1>\n` +
    `      <ul class="index-list">\n` +
    `${lis}\n` +
    `      </ul>\n` +
    `    </nav>\n` +
    `  </body>\n` +
    `</html>\n`
  );
}

/**
 * ソートグループ判定：0=日本語かな/漢字、1=英数、2=記号その他。
 */
function classifyGroup(reading: string): number {
  const first = reading.charCodeAt(0);
  // ひらがな(3040-309F)・カタカナ(30A0-30FF)・漢字(4E00-9FFF)
  if ((first >= 0x3040 && first <= 0x30ff) || (first >= 0x4e00 && first <= 0x9fff)) {
    return 0;
  }
  // 英数
  if (/[A-Za-z0-9]/.test(reading[0] ?? '')) return 1;
  return 2;
}

/**
 * 索引ドキュメント（content/genindex.xhtml）から章ドキュメント（content/chN.xhtml）への
 * 相対パスを返す。同じ content/ 配下なのでファイル名のみで良い。
 */
function relIndexToContent(chapterPath: string): string {
  // chapterPath は "content/chN.xhtml"。索引も content/ 配下なのでファイル名だけ。
  const idx = chapterPath.lastIndexOf('/');
  return idx === -1 ? chapterPath : chapterPath.slice(idx + 1);
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, '&quot;');
}
