import { definePlugin } from '@kappan/core';
import type { Root as MdastRoot, Image, Text, Paragraph, RootContent, Heading, Code } from 'mdast';
import { visit } from 'unist-util-visit';

export interface FigureNumberingOptions {
  /** 図番号のラベル形式。デフォルト 'jp'（図1.1）。'en' は Fig. 1.1 */
  readonly labelStyle?: 'jp' | 'en';
  /** 章ごとに連番をリセットする（デフォルト true） */
  readonly resetPerChapter?: boolean;
}

interface Labels {
  fig: string;
  tbl: string;
  lst: string;
  eq: string;
  sec: string;
  chap: string;
}

const JP_LABELS: Labels = {
  fig: '図',
  tbl: '表',
  lst: 'リスト',
  eq: '式',
  sec: '節',
  chap: '第',
};
const EN_LABELS: Labels = {
  fig: 'Fig.',
  tbl: 'Table',
  lst: 'Listing',
  eq: 'Eq.',
  sec: 'Sec.',
  chap: 'Chap.',
};

type RefKind = 'fig' | 'tbl' | 'lst' | 'eq' | 'sec' | 'chap';

/**
 * 1 章分の定義テーブル。`onMdast` 後の状態でキャッシュに保存し、
 * `onMdastAllChapters` フェーズで章をまたぐ参照を解決する。
 */
interface ChapterDefs {
  readonly chapterNumber: number;
  /** chapter ID（front-matter id か h1 から推定） */
  readonly chapterId: string | undefined;
  /** 章タイトル（h1 のテキスト、参照テキスト生成に使う） */
  readonly chapterTitle: string | undefined;
  /** 種別ごとの id → 番号文字列（"1.1" 等） */
  readonly idToNumber: Record<RefKind, Map<string, string>>;
}

const CACHE_KEY_DEFS = 'figure-numbering:all-defs';
const CACHE_KEY_CHAP = 'figure-numbering:chapter-defs';

interface ChapterDefsRecord {
  readonly chapterNumber: number;
  readonly defs: ChapterDefs;
}

/**
 * 図表番号・章節相互参照の自動採番プラグイン。
 *
 * 基本：fig / tbl / lst の章内連番 + `[@kind:id]` 解決（同章のみ）。
 * 拡張：
 *   - 種別を sec / eq / chap に拡張
 *   - 章をまたぐ参照を `onMdastAllChapters` で解決
 *   - 章番号は front-matter `id`（ch01）→ 1、h1 内の数字 → fallback、最後に出現順
 *
 * 参照記法（Pandoc-crossref 互換）：
 *   `![alt](path){#fig:id}` → `図1.1`（image alt が numbered caption に）
 *   `## タイトル {#sec:foo}` → `1.1`（heading に id 属性が付き、後で参照可）
 *   `$$..$$ {#eq:bar}` → `(1.1)`（コードブロック直後の `{#eq:id}` テキスト）
 *   `[@fig:foo]` / `[@sec:bar]` / `[@chap:baz]` → 「図1.1」「節1.1」「第3章」
 */
export const figureNumbering = definePlugin<FigureNumberingOptions>({
  name: '@kappan/plugin-figure-numbering',
  version: '0.3.0',
  kind: 'transform',
  hooks: (options = {}) => {
    const labels: Labels = options.labelStyle === 'en' ? EN_LABELS : JP_LABELS;
    return {
      onMdast(tree: MdastRoot, ctx) {
        // フェーズ 1：1 章分の定義を集めて番号を割り振る。同章内の参照は解決する。
        const chapterNumber = inferChapterNumber(tree);
        const chapterId = inferChapterId(tree);
        const chapterTitle = extractFirstHeadingText(tree);

        // h1 から章 ID マーカー `{#chXX}` を取り除く（見出しに残さない）。
        stripChapterIdMarker(tree);

        const defs = collectAndNumber(tree, chapterNumber, labels);
        const record: ChapterDefs = {
          chapterNumber,
          chapterId,
          chapterTitle,
          idToNumber: defs,
        };

        // 同章の参照を解決する（chap は別関数で章間用に置換するため別パス）。
        resolveSameChapterRefs(tree, record, labels);

        // キャッシュに章定義を蓄積（onMdastAllChapters で集めて参照解決）。
        const existing = ctx.cache.get<readonly ChapterDefsRecord[]>(CACHE_KEY_CHAP) ?? [];
        ctx.cache.set(CACHE_KEY_CHAP, [...existing, { chapterNumber, defs: record }]);
      },
      onMdastAllChapters(trees, ctx) {
        // フェーズ 2：全章の定義を統合して、章をまたぐ参照を解決する。
        const records = ctx.cache.get<readonly ChapterDefsRecord[]>(CACHE_KEY_CHAP) ?? [];
        const byChapterId = new Map<string, ChapterDefs>();
        for (const r of records) {
          if (r.defs.chapterId) byChapterId.set(r.defs.chapterId, r.defs);
        }
        ctx.cache.set(CACHE_KEY_DEFS, byChapterId);

        // 各章を巡回して、未解決のままだった `[@kind:id]` を解決する。
        for (const { tree } of trees) {
          resolveCrossChapterRefs(tree, byChapterId, labels);
        }
      },
    };
  },
});

/**
 * tree から章番号を推定する。
 *
 * 優先順：
 *   1. front-matter の chapterNumber は collectChapters で frontmatter から拾えないため
 *      ここでは h1 の数字（"第3章 タイトル" の "3"）を見る
 *   2. h1 のテキスト先頭の "第N章" / "Chapter N"
 *   3. 章 ID の先頭数字（ch01 → 1）
 *   4. fallback 1
 */
function inferChapterNumber(tree: MdastRoot): number {
  // h1 を探す
  for (const child of tree.children) {
    if (child.type === 'heading' && child.depth === 1) {
      const text = collectText(child.children);
      // "第3章" / "Chapter 3" の数字を最優先
      const ch = text.match(/第\s*(\d+)\s*章|Chapter\s*(\d+)/i);
      if (ch) {
        return Number.parseInt(ch[1] ?? ch[2]!, 10);
      }
      const any = text.match(/(\d+)/);
      if (any) return Number.parseInt(any[1]!, 10);
    }
  }
  return 1;
}

/**
 * 章 ID を推定する。最初の h1 の `{#id}` 接尾辞を見る。
 *
 * Kappan の collectChapters は front-matter `id` を別経路で扱うが、
 * プラグインは frontmatter を直接受け取らないため h1 の id 属性で代用する。
 * `# 第1章 {#ch01}` の形式を期待する。なければ undefined。
 */
function inferChapterId(tree: MdastRoot): string | undefined {
  for (const child of tree.children) {
    if (child.type === 'heading' && child.depth === 1) {
      const text = collectText(child.children);
      const m = text.match(/\{#([a-zA-Z0-9_-]+)\}/);
      if (m) return m[1];
    }
  }
  return undefined;
}

/**
 * h1 の末尾にある章 ID マーカー `{#id}` をテキストから取り除く。
 * `inferChapterId` で読み取った後に呼び、見出しに ID 文字列が残らないようにする。
 */
function stripChapterIdMarker(tree: MdastRoot): void {
  for (const child of tree.children) {
    if (child.type === 'heading' && child.depth === 1) {
      const last = child.children[child.children.length - 1];
      if (last && last.type === 'text') {
        last.value = last.value.replace(/\s*\{#[a-zA-Z0-9_-]+\}\s*$/, '');
      }
      return;
    }
  }
}

function extractFirstHeadingText(tree: MdastRoot): string | undefined {
  for (const child of tree.children) {
    if (child.type === 'heading' && child.depth === 1) {
      return collectText(child.children)
        .replace(/\s*\{#[a-zA-Z0-9_-]+\}\s*$/, '')
        .trim();
    }
  }
  return undefined;
}

function collectText(
  nodes:
    | readonly RootContent[]
    | readonly {
        type: string;
        value?: string;
        children?: readonly { type: string; value?: string }[];
      }[],
): string {
  let s = '';
  for (const n of nodes as Array<{
    type: string;
    value?: string;
    children?: unknown[];
  }>) {
    if (n.type === 'text') s += n.value ?? '';
    else if (Array.isArray(n.children))
      s += collectText(n.children as Array<{ type: string; value?: string }>);
  }
  return s;
}

/**
 * mdast を 1 章分走査して、各種定義に番号を割り当てる。
 *
 * 対応する記法：
 *   - 画像 `![alt](path){#fig:id}` / `{#tbl:id}` / `{#lst:id}`
 *   - 見出し `## title {#sec:id}`（h2 / h3 / h4 を section とみなす）
 *   - コード `code` ノードの直後 text `{#lst:id}`
 *   - 数式 — Markdown では math 拡張がないため、`$$..$$` をそのまま代用とし、
 *     その直後の段落先頭 `{#eq:id}` を拾う
 */
function collectAndNumber(
  tree: MdastRoot,
  chapterNum: number,
  labels: Labels,
): Record<RefKind, Map<string, string>> {
  const idMap: Record<RefKind, Map<string, string>> = {
    fig: new Map(),
    tbl: new Map(),
    lst: new Map(),
    eq: new Map(),
    sec: new Map(),
    chap: new Map(),
  };
  let figCounter = 0;
  let tblCounter = 0;
  let lstCounter = 0;
  let eqCounter = 0;
  let secCounter = 0;

  visit(tree, 'paragraph', (paragraph: Paragraph) => {
    for (let i = 0; i < paragraph.children.length; i++) {
      const node = paragraph.children[i];
      // 画像ノードは fig/tbl/lst を直後 text で識別
      if (node?.type === 'image') {
        const imageNode = node as Image;
        const next = paragraph.children[i + 1];
        let id: string | undefined;
        let kind: 'fig' | 'tbl' | 'lst' = 'fig';
        if (next && next.type === 'text') {
          const m = next.value.match(/^\{#(fig|tbl|lst):([a-zA-Z0-9_-]+)\}/);
          if (m) {
            kind = m[1] as 'fig' | 'tbl' | 'lst';
            id = m[2];
            next.value = next.value.slice(m[0].length);
          }
        }
        let number: string;
        if (kind === 'fig') {
          figCounter += 1;
          number = `${chapterNum}.${figCounter}`;
        } else if (kind === 'tbl') {
          tblCounter += 1;
          number = `${chapterNum}.${tblCounter}`;
        } else {
          lstCounter += 1;
          number = `${chapterNum}.${lstCounter}`;
        }
        if (id) idMap[kind].set(id, number);
        const label = labels[kind];
        const numberedAlt = `${label}${number}: ${imageNode.alt ?? ''}`.replace(/: $/, '');
        imageNode.alt = numberedAlt;
      }
    }
  });

  // 見出し（h2 / h3 / h4）の `{#sec:id}` を section とみなす
  visit(tree, 'heading', (heading: Heading) => {
    if (heading.depth < 2 || heading.depth > 4) return;
    // 最後の text の末尾に `{#sec:id}` が含まれていれば抽出
    const last = heading.children[heading.children.length - 1];
    if (last && last.type === 'text') {
      const m = last.value.match(/\s*\{#sec:([a-zA-Z0-9_-]+)\}\s*$/);
      if (m) {
        secCounter += 1;
        const number = `${chapterNum}.${secCounter}`;
        idMap.sec.set(m[1]!, number);
        last.value = last.value.slice(0, m.index!).replace(/\s+$/, '');
      }
    }
  });

  // コードブロック `code` の直後の段落先頭 `{#lst:id}` をリストとして認識
  visit(tree, 'code', (code: Code, index, parent) => {
    if (!parent || typeof index !== 'number') return;
    const next = parent.children[index + 1];
    if (!next || next.type !== 'paragraph') return;
    const first = next.children[0];
    if (!first || first.type !== 'text') return;
    const m = first.value.match(/^\{#lst:([a-zA-Z0-9_-]+)\}\s*/);
    if (m) {
      lstCounter += 1;
      const number = `${chapterNum}.${lstCounter}`;
      idMap.lst.set(m[1]!, number);
      first.value = first.value.slice(m[0].length);
      // alt 相当の caption は code には無いので、ここでは抽出のみで本文書き換えはしない
      void code;
    }
  });

  // 数式 `$$..$$` を Markdown としては math 拡張無しで扱えないため、
  // パターンとしては「段落の中身が `$$...$$` のみのテキスト」を eq として扱い、
  // 直後の段落先頭 `{#eq:id}` を割り当てる
  visit(tree, 'paragraph', (paragraph: Paragraph, index, parent) => {
    if (!parent || typeof index !== 'number') return;
    if (paragraph.children.length !== 1) return;
    const only = paragraph.children[0];
    if (!only || only.type !== 'text') return;
    if (!/^\s*\$\$[\s\S]+\$\$\s*$/.test(only.value)) return;
    // 直後段落の先頭 `{#eq:id}` を引き取る
    const next = parent.children[index + 1];
    if (!next || next.type !== 'paragraph') return;
    const first = next.children[0];
    if (!first || first.type !== 'text') return;
    const m = first.value.match(/^\{#eq:([a-zA-Z0-9_-]+)\}\s*/);
    if (m) {
      eqCounter += 1;
      const number = `${chapterNum}.${eqCounter}`;
      idMap.eq.set(m[1]!, number);
      first.value = first.value.slice(m[0].length);
    }
  });

  return idMap;
}

/**
 * 同一章内の `[@fig:id]` `[@tbl:id]` `[@lst:id]` `[@sec:id]` `[@eq:id]` を解決する。
 * `[@chap:id]` は他章を指す前提で `onMdastAllChapters` で解決する。
 */
function resolveSameChapterRefs(tree: MdastRoot, record: ChapterDefs, labels: Labels): void {
  const refRe = /\[@(fig|tbl|lst|sec|eq):([a-zA-Z0-9_-]+)\]/g;
  visit(tree, 'text', (node: Text) => {
    refRe.lastIndex = 0;
    if (!refRe.test(node.value)) return;
    refRe.lastIndex = 0;
    node.value = node.value.replace(refRe, (match, kind: string, id: string) => {
      const map = record.idToNumber[kind as RefKind];
      const num = map?.get(id);
      if (num === undefined) return match;
      const label = labels[kind as keyof Labels];
      return `${label}${num}`;
    });
  });
}

/**
 * 章をまたぐ参照を解決する。
 *
 * - `[@chap:ch03]` → 「第3章」（chapterId から番号引き）
 * - `[@sec:ch03-intro]` 等で「他章の sec id」を指す記法は **章 ID で名前空間を切る**：
 *   `[@sec:ch03/intro]` のように `chapterId/refId` で他章参照を明示する。
 *   `[@sec:foo]` 単体（章 ID なし）はその章でのローカル定義扱い（同章解決済）。
 */
function resolveCrossChapterRefs(
  tree: MdastRoot,
  byChapterId: Map<string, ChapterDefs>,
  labels: Labels,
): void {
  const refRe = /\[@(chap|fig|tbl|lst|sec|eq):([a-zA-Z0-9_/-]+)\]/g;
  visit(tree, 'text', (node: Text) => {
    refRe.lastIndex = 0;
    if (!refRe.test(node.value)) return;
    refRe.lastIndex = 0;
    node.value = node.value.replace(refRe, (match, kind: string, raw: string) => {
      const k = kind as RefKind;
      if (k === 'chap') {
        const defs = byChapterId.get(raw);
        if (!defs) return match;
        return `${labels.chap}${defs.chapterNumber}章`;
      }
      // 他章名前空間付き参照: ch03/intro → chapterId="ch03", refId="intro"
      const slashIdx = raw.indexOf('/');
      if (slashIdx !== -1) {
        const chapterId = raw.slice(0, slashIdx);
        const refId = raw.slice(slashIdx + 1);
        const defs = byChapterId.get(chapterId);
        if (!defs) return match;
        const num = defs.idToNumber[k].get(refId);
        if (num === undefined) return match;
        const label = labels[k as keyof Labels];
        return `${label}${num}`;
      }
      // 名前空間なしは同章解決の対象。ここまで残っているなら未解決なので元のまま。
      return match;
    });
  });
}
