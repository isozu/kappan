import { definePlugin } from '@kappan/core';
import type { PluginContext } from '@kappan/core';
import type {
  Root as MdastRoot,
  Image,
  Text,
  Link,
  Paragraph,
  RootContent,
  PhrasingContent,
  Heading,
  Code,
  Table,
  Parent,
  Blockquote,
} from 'mdast';
import { visit } from 'unist-util-visit';

/**
 * `<figcaption>` として描画される段落ノードを作る。
 *
 * mdast の `Data`（mdast-util-to-hast が `hName` / `hProperties` で拡張済み）を使い、
 * mdast→hast 段階で `<figure>` / `<figcaption>` を生成する。これにより unsafeHtml の
 * 全モード（false / sanitized / trusted）で安定して図表キャプションを出力できる
 * （onHast に置いたデータ属性は sanitized モードで除去されるため使わない）。
 */
function makeFigcaption(text: string): Paragraph {
  return {
    type: 'paragraph',
    data: { hName: 'figcaption' },
    children: [{ type: 'text', value: text }],
  };
}

export interface FigureNumberingOptions {
  /** 番号ラベルの言語。デフォルト 'jp'（図1.1）。'en' は Fig. 1.1。 */
  readonly labelStyle?: 'jp' | 'en';
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
 * 参照のアンカー id。本文の `[@fig:xref]` は `<a href="#fig-xref">` になり、
 * 図表側 `<figure id="fig-xref">` へジャンプする。`<kind>-<id>` の形にすることで
 * EPUBCheck が嫌うコロンを避けつつ、テーマ CSS（`.kappan-xref`）で一括装飾できる。
 */
function anchorId(kind: RefKind, id: string): string {
  return `${kind}-${id}`;
}

/** mdast ノードに `data.hProperties.id` を（既存 data を保ったまま）設定する。 */
function setAnchor(node: { data?: unknown }, id: string): void {
  const n = node as { data?: { hProperties?: Record<string, unknown> } };
  const data = (n.data ?? {}) as { hProperties?: Record<string, unknown> };
  data.hProperties = { ...(data.hProperties ?? {}), id };
  n.data = data;
}

/**
 * 1 章分の定義テーブル。`onMdast` 後の状態でキャッシュに保存し、
 * `onMdastAllChapters` フェーズで章をまたぐ参照を解決する。
 */
interface ChapterDefs {
  readonly chapterNumber: number;
  /** chapter ID（front-matter id か h1 から推定）。章間リンクのファイル名になる。 */
  readonly chapterId: string | undefined;
  /** 種別ごとの id → 番号文字列（"1.1" 等） */
  readonly idToNumber: Record<RefKind, Map<string, string>>;
}

const CACHE_KEY_CHAP = 'figure-numbering:chapter-defs';

/** 参照解決の結果。`href` があれば `<a>`、無ければ素のテキストに置換する。 */
interface ResolvedRef {
  readonly label: string;
  readonly href?: string;
}

/**
 * 図表番号・章節相互参照の自動採番プラグイン。
 *
 * 基本：fig / tbl / lst の章内連番 + `[@kind:id]` 解決（同章のみ）。
 * 拡張：
 *   - 種別を sec / eq / chap に拡張
 *   - 章をまたぐ参照を `onMdastAllChapters` で解決
 *   - 参照（`[@kind:id]`）は番号付きラベルの**ハイパーリンク**になり、図表側の
 *     アンカー（`<figure id="fig-id">` 等）へジャンプできる
 *   - 章番号は front-matter `id`（ch01）→ 1、h1 内の数字 → fallback、最後に出現順
 *
 * 参照記法（Pandoc-crossref 互換）：
 *   `![alt](path){#fig:id}` → 単独段落のブロック画像は
 *      `<figure id="fig-id"><img/><figcaption>図1.1: alt</figcaption></figure>` に変換し、
 *      番号付きキャプションを可視で出す（画像にプローズが続くインライン用法は
 *      従来どおり alt に番号を載せ、`<img id="fig-id">` を付ける）。
 *   GFM テーブル ＋ 直前/直後の `{#tbl:id} キャプション` 段落 →
 *      `<figure id="tbl-id"><figcaption>表1.1: キャプション</figcaption><table>…</table></figure>`。
 *   コードブロック ＋ 直前/直後の `{#lst:id} キャプション` 段落 →
 *      `<figure class="code-figure" id="lst-id"><figcaption>リスト1.1: キャプション</figcaption><pre>…</pre></figure>`。
 *   `## タイトル {#sec:foo}` → `1.1`（heading に `id="sec-foo"` が付き、後で参照可）
 *   `$$..$$ {#eq:bar}` → `1.1`（コードブロック直後の `{#eq:id}` テキスト。直後段落に
 *      `id="eq-bar"` を付け、参照リンクのジャンプ先にする）
 *   `[@fig:foo]` / `[@sec:bar]` / `[@chap:baz]` → 「図1.1」「節1.1」「第3章」へのリンク
 */
export const figureNumbering = definePlugin<FigureNumberingOptions>({
  name: '@kappan/plugin-figure-numbering',
  version: '0.4.0',
  kind: 'transform',
  hooks: (options = {}) => {
    const labels: Labels = options.labelStyle === 'en' ? EN_LABELS : JP_LABELS;
    return {
      onMdast(tree: MdastRoot, ctx) {
        // フェーズ 1：1 章分の定義を集めて番号を割り振り、同章内の参照を解決する。
        const chapterNumber = inferChapterNumber(tree);
        const chapterId = inferChapterId(tree);

        // h1 から章 ID マーカー `{#chXX}` を取り除く（見出しに残さない）。
        stripChapterIdMarker(tree);

        const record: ChapterDefs = {
          chapterNumber,
          chapterId,
          idToNumber: collectAndNumber(tree, chapterNumber, labels),
        };

        // 同章の参照をリンクに解決する（chap は別関数で章間用に置換するため別パス）。
        resolveSameChapterRefs(tree, record, labels);

        // キャッシュに章定義を蓄積（onMdastAllChapters で集めて参照解決）。
        const existing = ctx.cache.get<readonly ChapterDefs[]>(CACHE_KEY_CHAP) ?? [];
        ctx.cache.set(CACHE_KEY_CHAP, [...existing, record]);
      },
      onMdastAllChapters(trees, ctx) {
        // フェーズ 2：全章の定義を統合して、章をまたぐ参照を解決する。
        const records = ctx.cache.get<readonly ChapterDefs[]>(CACHE_KEY_CHAP) ?? [];
        const byChapterId = new Map<string, ChapterDefs>();
        for (const r of records) {
          if (r.chapterId) byChapterId.set(r.chapterId, r);
        }

        // 各章を巡回して、未解決のままだった `[@kind:id]`（chap / 他章名前空間）を
        // 解決し、それでも残る参照は警告する。
        for (const { tree, path } of trees) {
          resolveCrossChapterRefs(tree, byChapterId, labels);
          warnUnresolvedRefs(tree, path, ctx);
        }
      },
    };
  },
});

/**
 * tree から章番号を推定する。プラグインは frontmatter を直接受け取れないため、
 * 章番号は h1 のテキストから推定する。
 *
 * 優先順：
 *   1. h1 の "第N章" / "Chapter N"（最も意図が明確）
 *   2. 章 ID マーカー `{#chXX}` の先頭数字（`# はじめに {#ch00}` → 0、`{#ch01}` → 1）。
 *      タイトル本文に偶発的な数字（例: "5つの理由"）があると、後段の「任意の数字」rule
 *      が拾ってしまうため、ID マーカーを先に見て確実性を上げる。
 *   3. ID マーカー以外に出現する任意の数字（後方互換）
 *   4. fallback 1
 *
 * 注：英字のみの ID（`{#preface}` 等）は step 2 がスキップされ step 4 で 1 に落ちる。
 * 同一ブック内に `{#ch01}` と `{#preface}` が共存すると番号衝突が起きる（図1.1 が
 * 両章で発生）ため、章 ID は数字を含む `ch00` / `ch01` 形式で揃える運用を推奨する。
 */
function inferChapterNumber(tree: MdastRoot): number {
  // h1 を探す
  for (const child of tree.children) {
    if (child.type === 'heading' && child.depth === 1) {
      const text = collectText(child.children);
      // 1. "第3章" / "Chapter 3" を最優先
      const ch = text.match(/第\s*(\d+)\s*章|Chapter\s*(\d+)/i);
      if (ch) {
        return Number.parseInt(ch[1] ?? ch[2]!, 10);
      }
      // 2. 章 ID マーカー `{#chXX}` の先頭数字（ch01 → 1、ch00 → 0）
      const idMatch = text.match(/\{#[a-zA-Z]+(\d+)/);
      if (idMatch) {
        return Number.parseInt(idMatch[1]!, 10);
      }
      // 3. ID マーカー以外に出現する任意の数字
      const stripped = text.replace(/\{#[a-zA-Z0-9_-]+\}/g, '');
      const any = stripped.match(/(\d+)/);
      if (any) return Number.parseInt(any[1]!, 10);
    }
  }
  // 4. fallback
  return 1;
}

/**
 * 章 ID を推定する。最初の h1 の `{#id}` 接尾辞を見る。
 *
 * Kappan の collectChapters は front-matter `id` を別経路で扱うが、
 * プラグインは frontmatter を直接受け取らないため h1 の id 属性で代用する。
 * `# 第1章 {#ch01}` の形式を期待する。なければ undefined。
 *
 * 章間リンクの URL（`ch01.xhtml#fig-x`）はこの章 ID をファイル名に使う。出力ファイル名は
 * front-matter `id`（= `content/<id>.xhtml`）なので、h1 の `{#chXX}` と front-matter `id`
 * を一致させる運用を前提にする（showcase / docs の慣行どおり）。
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
 * mdast を 1 章分走査して、各種定義に番号を割り当て、アンカーを付ける。
 *
 * 対応する記法：
 *   - 画像 `![alt](path){#fig:id}` / `{#tbl:id}` / `{#lst:id}`
 *   - 見出し `## title {#sec:id}`（h2 / h3 / h4 を section とみなす）
 *   - GFM テーブル ＋ 隣接キャプション段落 `… {#tbl:id}`
 *   - コードブロック ＋ 隣接キャプション段落 `… {#lst:id}`（直後段落先頭の
 *     `{#lst:id}` プレフィックスも後方互換で受け付ける）
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
        const desc = imageNode.alt ?? '';
        const caption = desc ? `${label}${number}: ${desc}` : `${label}${number}`;

        // ブロック画像（段落の中身が実質その画像だけ）なら可視キャプション付き
        // `<figure>` に変換する。番号は figcaption に出し、alt は素の説明に戻す
        // （スクリーンリーダーで番号と説明が二重読みされないように）。
        // 画像にプローズが続くインライン用法は従来どおり alt に番号を載せる。
        const isBlockImage = paragraph.children.every((c, idx) => {
          if (idx === i) return true; // 画像自身
          if (c.type === 'text') return c.value.trim() === '';
          return false;
        });
        if (isBlockImage) {
          imageNode.alt = desc;
          paragraph.data = { ...paragraph.data, hName: 'figure' };
          if (id) setAnchor(paragraph, anchorId(kind, id));
          // figcaption は mdast 上は Paragraph だが hName で <figcaption> になる。
          // Paragraph.children は PhrasingContent[] のため、型を緩めて差し込む。
          paragraph.children = [
            imageNode,
            makeFigcaption(caption),
          ] as unknown as Paragraph['children'];
          break; // この段落は figure に確定したので走査終了
        }
        imageNode.alt = caption;
        // インライン用法：画像自身にアンカーを付け、参照リンクのジャンプ先にする。
        if (id) setAnchor(imageNode, anchorId(kind, id));
      }
    }
  });

  // GFM テーブルのキャプション採番。
  // テーブルの直前（推奨）または直後の段落が `{#tbl:id}` マーカーを持つとき、
  // そのテーブルを `<figure id="tbl-id">` でラップし「表N.N: キャプション」を figcaption に出す。
  // 画像形式の `{#tbl:id}` とは別経路だが、tblCounter を共有する（画像表 → GFM 表の順）。
  interface BlockAction {
    readonly parent: Parent;
    readonly block: RootContent;
    readonly captionPara: Paragraph;
    readonly captionText: string;
    readonly id: string;
  }
  const tableActions: BlockAction[] = [];
  visit(tree, 'table', (table: Table, index, parent) => {
    if (!parent || typeof index !== 'number') return;
    const hit = findCaptionSibling(parent, index, 'tbl');
    if (hit) {
      tableActions.push({ parent: parent as Parent, block: table, ...hit });
    }
  });
  for (const act of tableActions) {
    tblCounter += 1;
    const number = `${chapterNum}.${tblCounter}`;
    idMap.tbl.set(act.id, number);
    const label = labels.tbl;
    const captionText = act.captionText
      ? `${label}${number}: ${act.captionText}`
      : `${label}${number}`;
    // blockquote をキャリアにして hName で figure に上書きする。
    // figure 内は [figcaption, table]（表のキャプションは上に置くのが慣行）。
    const figureNode: Blockquote = {
      type: 'blockquote',
      data: {
        hName: 'figure',
        hProperties: { className: ['table-figure'], id: anchorId('tbl', act.id) },
      },
      children: [makeFigcaption(captionText), act.block as Table],
    };
    replaceBlockWithFigure(act.parent, act.block, act.captionPara, figureNode);
  }

  // コードブロックのキャプション採番（表と同じ要領）。
  // コードの直前/直後の段落が `{#lst:id}` を持てば `<figure class="code-figure">` で
  // ラップし「リストN.N: キャプション」を figcaption に出す。隣接キャプションが無くても
  // 直後段落の**先頭**に `{#lst:id}` があれば（後方互換）、番号とアンカーだけ付ける。
  const listActions: Array<BlockAction | { legacy: Code; id: string; parent: Parent }> = [];
  visit(tree, 'code', (code: Code, index, parent) => {
    if (!parent || typeof index !== 'number') return;
    const hit = findCaptionSibling(parent, index, 'lst');
    if (hit) {
      listActions.push({ parent: parent as Parent, block: code, ...hit });
      return;
    }
    // 後方互換：直後段落の先頭プレフィックス `{#lst:id}`
    const next = parent.children[index + 1];
    if (next && next.type === 'paragraph') {
      const first = next.children[0];
      if (first && first.type === 'text') {
        const m = first.value.match(/^\{#lst:([a-zA-Z0-9_-]+)\}\s*/);
        if (m) {
          first.value = first.value.slice(m[0].length);
          listActions.push({ legacy: code, id: m[1]!, parent: parent as Parent });
        }
      }
    }
  });
  for (const act of listActions) {
    lstCounter += 1;
    const number = `${chapterNum}.${lstCounter}`;
    if ('legacy' in act) {
      idMap.lst.set(act.id, number);
      setAnchor(act.legacy, anchorId('lst', act.id));
      continue;
    }
    idMap.lst.set(act.id, number);
    const label = labels.lst;
    const captionText = act.captionText
      ? `${label}${number}: ${act.captionText}`
      : `${label}${number}`;
    const figureNode: Blockquote = {
      type: 'blockquote',
      data: {
        hName: 'figure',
        hProperties: { className: ['code-figure'], id: anchorId('lst', act.id) },
      },
      children: [makeFigcaption(captionText), act.block as Code],
    };
    replaceBlockWithFigure(act.parent, act.block, act.captionPara, figureNode);
  }

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
        setAnchor(heading, anchorId('sec', m[1]!));
      }
    }
  });

  // 数式 `$$..$$` を Markdown としては math 拡張無しで扱えないため、
  // パターンとしては「段落の中身が `$$...$$` のみのテキスト」を eq として扱い、
  // 直後の段落先頭 `{#eq:id}` を割り当てる。アンカーは直後段落に付け、参照リンクの
  // ジャンプ先（数式の直下）にする。
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
      setAnchor(next, anchorId('eq', m[1]!));
    }
  });

  return idMap;
}

/**
 * ブロック（table / code）の直前または直後の段落が `{#kind:id}` キャプションなら
 * その情報を返す。キャプション段落は「丸ごと」マーカーで終わる段落に限る
 * （本文プローズを巻き込まないため）。直前を優先する（キャプションは上に置く慣行）。
 */
function findCaptionSibling(
  parent: Parent,
  index: number,
  kind: 'tbl' | 'lst',
): { captionPara: Paragraph; captionText: string; id: string } | undefined {
  const labelAlt = kind === 'tbl' ? '表|Table' : 'リスト|Listing';
  const re = new RegExp(
    `^\\s*(?:${labelAlt})?\\s*[:：]?\\s*([\\s\\S]*?)\\s*\\{#${kind}:([a-zA-Z0-9_-]+)\\}\\s*$`,
  );
  for (const pos of [index - 1, index + 1]) {
    const sib = parent.children[pos];
    if (!sib || sib.type !== 'paragraph') continue;
    const text = collectText(sib.children);
    const m = text.match(re);
    if (m) {
      return { captionPara: sib as Paragraph, captionText: (m[1] ?? '').trim(), id: m[2]! };
    }
  }
  return undefined;
}

/**
 * `block` を `figureNode` で置き換え、`captionPara` を親から取り除く。
 * 配列インデックスのズレを避けるため、まず figure を据えてからキャプションを消す。
 */
function replaceBlockWithFigure(
  parent: Parent,
  block: RootContent,
  captionPara: Paragraph,
  figureNode: RootContent,
): void {
  const ch = parent.children as RootContent[];
  const bi = ch.indexOf(block);
  if (bi === -1) return;
  ch[bi] = figureNode;
  const ci = ch.indexOf(captionPara);
  if (ci !== -1) ch.splice(ci, 1);
}

const REF_RE = /\[@(chap|fig|tbl|lst|sec|eq):([a-zA-Z0-9_/-]+)\]/g;

/**
 * tree 内のすべての text ノードを走査し、`[@kind:id]` を `resolve` の結果で置き換える。
 * `href` が返れば mdast の `link`（`class="kappan-xref"`）に、無ければ素のテキストに
 * 変換する。解決できない参照は手付かずで残す（後段で警告する）。
 */
function linkifyRefs(
  tree: MdastRoot,
  resolve: (kind: RefKind, raw: string) => ResolvedRef | undefined,
): void {
  const visitParent = (parent: Parent): void => {
    if (!Array.isArray(parent.children)) return;
    const out: RootContent[] = [];
    for (const child of parent.children as RootContent[]) {
      if (child.type === 'text') {
        const replaced = transformText(child as Text, resolve);
        if (replaced) {
          out.push(...replaced);
          continue;
        }
      }
      out.push(child);
    }
    parent.children = out as Parent['children'];
    for (const child of parent.children as RootContent[]) {
      // inlineCode / code は children を持たないので踏み込まない（記法例を壊さない）。
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
  resolve: (kind: RefKind, raw: string) => ResolvedRef | undefined,
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
    const resolved = resolve(m[1] as RefKind, m[2]!);
    if (!resolved) continue; // 未解決：素のテキストに残す
    if (m.index > cursor) out.push({ type: 'text', value: value.slice(cursor, m.index) });
    if (resolved.href) {
      const link: Link = {
        type: 'link',
        url: resolved.href,
        title: null,
        data: { hProperties: { className: ['kappan-xref'] } },
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

/**
 * 同一章内の `[@fig:id]` `[@tbl:id]` `[@lst:id]` `[@sec:id]` `[@eq:id]` をリンクに解決する。
 * `[@chap:id]` と他章名前空間付き参照（`ch01/foo`）は `onMdastAllChapters` で解決する。
 */
function resolveSameChapterRefs(tree: MdastRoot, record: ChapterDefs, labels: Labels): void {
  linkifyRefs(tree, (kind, raw) => {
    if (kind === 'chap') return undefined;
    if (raw.includes('/')) return undefined; // 他章参照は phase 2 へ
    const num = record.idToNumber[kind]?.get(raw);
    if (num === undefined) return undefined;
    return { label: `${labels[kind]}${num}`, href: `#${anchorId(kind, raw)}` };
  });
}

/**
 * 章をまたぐ参照を解決する。
 *
 * - `[@chap:ch03]` → 「第3章」（chapterId からファイル `ch03.xhtml` へリンク）
 * - `[@sec:ch03/intro]` のように `chapterId/refId` で他章の図表・節を参照する：
 *   `ch03.xhtml#sec-intro` へリンクする。
 *   `[@sec:foo]` 単体（章 ID なし）は同章解決済みなので、ここまで残るのは未定義扱い。
 */
function resolveCrossChapterRefs(
  tree: MdastRoot,
  byChapterId: Map<string, ChapterDefs>,
  labels: Labels,
): void {
  linkifyRefs(tree, (kind, raw) => {
    if (kind === 'chap') {
      const defs = byChapterId.get(raw);
      if (!defs) return undefined;
      return { label: `${labels.chap}${defs.chapterNumber}章`, href: `${raw}.xhtml` };
    }
    const slashIdx = raw.indexOf('/');
    if (slashIdx === -1) return undefined; // 同章参照（解決済み or 未定義）
    const chapterId = raw.slice(0, slashIdx);
    const refId = raw.slice(slashIdx + 1);
    const defs = byChapterId.get(chapterId);
    if (!defs) return undefined;
    const num = defs.idToNumber[kind].get(refId);
    if (num === undefined) return undefined;
    return { label: `${labels[kind]}${num}`, href: `${chapterId}.xhtml#${anchorId(kind, refId)}` };
  });
}

/**
 * 解決されずに残った `[@kind:id]` を警告する。定義漏れ・タイプミスを著者が
 * ビルドログで気付けるようにする（本文には生記法がそのまま出てしまうため）。
 */
function warnUnresolvedRefs(tree: MdastRoot, path: string, ctx: PluginContext): void {
  const seen = new Set<string>();
  visit(tree, 'text', (node: Text) => {
    REF_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = REF_RE.exec(node.value)) !== null) {
      const ref = `${m[1]}:${m[2]}`;
      if (seen.has(ref)) continue;
      seen.add(ref);
      ctx.emit({
        severity: 'warning',
        source: 'figure-numbering',
        message: `${path}: 未解決の相互参照 [@${ref}]（定義が見つかりません）`,
      });
    }
  });
}
