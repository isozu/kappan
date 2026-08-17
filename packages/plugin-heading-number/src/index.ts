import {
  definePlugin,
  buildChapterRegistry,
  CHAPTER_REGISTRY_CACHE_KEY,
  type ChapterMeta,
  type ChapterRecord,
  type ChapterKind,
  type PluginContext,
  type SectionRecord,
} from '@kappan/core';
import type { Root as MdastRoot, Heading, RootContent } from 'mdast';
import { visit } from 'unist-util-visit';

export interface HeadingNumberOptions {
  /** 章・節ラベルの言語。'jp'（既定）= 第N章 / N.M、'en' = Chapter N / N.M */
  readonly labelStyle?: 'jp' | 'en';
  /**
   * h1（章見出し）に「第N章」を自動で付けるか（既定 true）。
   * 既に「第N章」「Chapter N」を含む h1 はそのまま尊重し、その番号を採番に使う。
   */
  readonly numberChapter?: boolean;
  /** 何階層まで節番号を振るか（2〜4、既定 3 = h2・h3 に N.M / N.M.K）。 */
  readonly maxDepth?: 2 | 3 | 4;
  /** 採番の開始章番号（既定 1）。 */
  readonly startNumber?: number;
  /** 番号と見出しテキストの区切り（既定: 和=全角空白、英=半角空白）。 */
  readonly separator?: string;
  /**
   * 章番号ソースの整合性チェック（既定 true）。
   * front-matter `chapterNumber` / `id` / h1 の `{#chXX}` / h1 の「第N章」がズレていた
   * 場合に warning diagnostic を出す。番号自体は priority に従って決まる。
   */
  readonly validateConsistency?: boolean;
}

interface ResolvedOptions {
  readonly style: 'jp' | 'en';
  readonly numberChapter: boolean;
  readonly maxDepth: number;
  readonly separator: string;
  readonly validateConsistency: boolean;
}

type ChapterNumberSource = 'fm-chapterNumber' | 'fm-id' | 'id-marker' | 'explicit-label' | 'auto';

/**
 * 見出しの自動採番プラグイン（v0.3 で章番号源を front-matter 優先に変更）。
 *
 * 章（h1）に「第N章」、節（h2〜maxDepth）に「N.M」「N.M.K」を付け、`@kappan/core` の
 * `ChapterRegistry` を `ctx.cache` に publish する（`plugin-figure-numbering` /
 * `plugin-toc` / EPUB nav が consumer として参照する）。
 *
 * 章番号の真実源（優先順位）：
 *   1. front-matter `chapterNumber`（著者明示）
 *   2. front-matter `id`（`ch05` → 5）
 *   3. h1 の章 ID マーカー `{#ch05}`（5）
 *   4. h1 の明示ラベル「第3章」「Chapter 3」
 *   5. spine 順（auto-increment、後方互換）
 *
 * 食い違いを検出すると warning diagnostic を発行する（採番自体は優先順位で決まる）。
 *
 * 記法：
 *   - `# タイトル`         → `第1章　タイトル`
 *   - `# 第3章 既存`        → そのまま尊重し、以降は 4 から続く
 *   - `## 概要`            → `1.1　概要`
 *   - `### 詳細`           → `1.1.1　詳細`
 *   - `## まえがき {-}`     → 採番をスキップ（`{-}` / `{.unnumbered}` マーカー）
 */
export const headingNumber = definePlugin<HeadingNumberOptions>({
  name: '@kappan/plugin-heading-number',
  version: '0.3.0',
  kind: 'transform',
  hooks: (options = {}) => {
    const style: 'jp' | 'en' = options.labelStyle === 'en' ? 'en' : 'jp';
    const cfg: ResolvedOptions = {
      style,
      numberChapter: options.numberChapter !== false,
      maxDepth: clampDepth(options.maxDepth),
      separator: options.separator ?? (style === 'en' ? ' ' : '　'),
      validateConsistency: options.validateConsistency !== false,
    };
    return {
      onMdastAllChapters(trees, ctx) {
        // 章レコードを spine 順に組み立てる。直前章の番号確定後に次章の自動カウンタを更新する。
        const records: ChapterRecord[] = [];
        let nextAuto = options.startNumber ?? 1;

        for (let i = 0; i < trees.length; i++) {
          const entry = trees[i]!;
          const meta = ctx.chapters[i]; // ctx.chapters が空のユニットテストでは undefined
          const result = numberOneChapter(entry.tree, entry.path, i, meta, nextAuto, cfg, ctx);
          records.push(result.record);
          if (result.advancedTo !== undefined) {
            nextAuto = result.advancedTo;
          }
        }

        const registry = buildChapterRegistry(records);
        ctx.cache.set(CHAPTER_REGISTRY_CACHE_KEY, registry);
      },
    };
  },
});

interface NumberResult {
  readonly record: ChapterRecord;
  /** 次章の自動採番カウンタ（未採番の章では undefined＝据え置き） */
  readonly advancedTo?: number;
}

function numberOneChapter(
  tree: MdastRoot,
  path: string,
  spineIndex: number,
  meta: ChapterMeta | undefined,
  nextAuto: number,
  cfg: ResolvedOptions,
  ctx: PluginContext,
): NumberResult {
  const h1 = tree.children.find((c): c is Heading => c.type === 'heading' && c.depth === 1);
  const chapterId = meta?.id ?? deriveIdFromPath(path);
  const kind: ChapterKind = meta?.frontmatter.kind ?? 'chapter';

  // opt-out マーカーは「採番しないとき」にも除去する。
  const optOut = h1 ? stripOptOut(h1) : false;

  // 未採番ケース：h1 なし / `{-}` / kind が chapter 以外
  if (!h1 || optOut || kind !== 'chapter') {
    if (h1) stripChapterIdMarker(h1);
    const sections = collectSections(tree, chapterId, undefined, cfg);
    const rawTitle = h1 ? collectText(h1.children).trim() : (meta?.title ?? '');
    return {
      record: buildRecord({
        id: chapterId,
        path,
        spineIndex,
        kind,
        meta,
        chapterNumber: undefined,
        displayLabel: '',
        rawTitle,
        numberedTitle: rawTitle,
        sections,
      }),
    };
  }

  // 章番号の優先順位ベース解決
  const h1Text = collectText(h1.children);
  const idMarkerNum = parseIdMarkerNumber(h1Text);
  const explicitLabel = matchChapterNumber(h1Text, cfg.style);

  const fmChapterNumber = meta?.frontmatter.chapterNumber;
  const fmIdNum = parseFrontmatterIdNumber(meta?.frontmatter.id);

  let chapterNum: number;
  let source: ChapterNumberSource;

  if (fmChapterNumber !== undefined) {
    chapterNum = fmChapterNumber;
    source = 'fm-chapterNumber';
  } else if (fmIdNum !== undefined) {
    chapterNum = fmIdNum;
    source = 'fm-id';
  } else if (idMarkerNum !== undefined) {
    chapterNum = idMarkerNum;
    source = 'id-marker';
  } else if (explicitLabel !== undefined) {
    chapterNum = explicitLabel;
    source = 'explicit-label';
  } else {
    chapterNum = nextAuto;
    source = 'auto';
  }

  if (cfg.validateConsistency) {
    emitDisagreement(ctx, path, chapterNum, source, {
      fmChapterNumber,
      fmIdNum,
      idMarkerNum,
      explicitLabel,
    });
  }

  // h1 から章 ID マーカーを除去（採番表示に混ざらないように）
  stripChapterIdMarker(h1);

  // 「第N章」プレフィックス（既に explicit ラベルがあれば二重付与しない）
  if (cfg.numberChapter && explicitLabel === undefined) {
    prependHeadingText(h1, `${chapterWord(chapterNum, cfg.style)}${cfg.separator}`);
  }

  const sections = collectSections(tree, chapterId, chapterNum, cfg);

  const numberedTitle = collectText(h1.children).trim();
  const rawTitle = meta?.title ?? extractRawTitle(h1Text, cfg.style);

  return {
    record: buildRecord({
      id: chapterId,
      path,
      spineIndex,
      kind: 'chapter',
      meta,
      chapterNumber: chapterNum,
      displayLabel: chapterWord(chapterNum, cfg.style),
      rawTitle,
      numberedTitle,
      sections,
    }),
    advancedTo: chapterNum + 1,
  };
}

interface BuildRecordInput {
  readonly id: string;
  readonly path: string;
  readonly spineIndex: number;
  readonly kind: ChapterKind;
  readonly meta: ChapterMeta | undefined;
  readonly chapterNumber: number | undefined;
  readonly displayLabel: string;
  readonly rawTitle: string;
  readonly numberedTitle: string;
  readonly sections: readonly SectionRecord[];
}

function buildRecord(input: BuildRecordInput): ChapterRecord {
  const base: ChapterRecord = {
    id: input.id,
    path: input.path,
    spineIndex: input.spineIndex,
    kind: input.kind,
    displayLabel: input.displayLabel,
    rawTitle: input.rawTitle,
    numberedTitle: input.numberedTitle,
    sections: input.sections,
    ...(input.chapterNumber !== undefined ? { chapterNumber: input.chapterNumber } : {}),
    ...(input.meta?.frontmatter.part !== undefined ? { part: input.meta.frontmatter.part } : {}),
    ...(input.meta?.frontmatter.partTitle !== undefined
      ? { partTitle: input.meta.frontmatter.partTitle }
      : {}),
  };
  return base;
}

function clampDepth(d: number | undefined): number {
  if (d === undefined) return 3;
  if (d < 2) return 2;
  if (d > 4) return 4;
  return d;
}

/**
 * h1 内の章 ID マーカー `{#chXX}` から先頭の数字を取り出す。
 * `{#ch01}` → 1, `{#chapter05}` → 5, `{#preface}` → undefined。
 */
function parseIdMarkerNumber(text: string): number | undefined {
  const m = text.match(/\{#[a-zA-Z]+(\d+)/);
  return m ? Number.parseInt(m[1]!, 10) : undefined;
}

/**
 * front-matter の `id: ch05` 形式から章番号を取り出す。
 * 数字を含まない id（`preface` 等）は undefined。
 */
function parseFrontmatterIdNumber(id: string | undefined): number | undefined {
  if (!id) return undefined;
  const m = id.match(/^[a-zA-Z]+(\d+)$/);
  return m ? Number.parseInt(m[1]!, 10) : undefined;
}

/**
 * 章内の h2〜maxDepth に節番号を振り、各見出しに anchor id を付与しつつ `SectionRecord` を返す。
 *
 * anchor id ルール：
 *   - 既に `data.hProperties.id`（例: figure-numbering の `{#sec:foo}` → `sec-foo`）があれば尊重
 *   - 無ければ `<chapterId>-s<n>` を生成して `data.hProperties.id` を設定する（後段で TOC や
 *     リーダーから直接ジャンプできる anchor になる）
 *
 * `chapterNum` が undefined のときは番号を振らない（未採番章 / opt-out 章 / kind != chapter）。
 */
function collectSections(
  tree: MdastRoot,
  chapterId: string,
  chapterNum: number | undefined,
  cfg: ResolvedOptions,
): SectionRecord[] {
  const counters = [0, 0, 0]; // h2, h3, h4 採番カウンタ
  let ordinal = 0; // anchor id 用の通し番号
  const records: SectionRecord[] = [];

  visit(tree, 'heading', (h: Heading) => {
    if (h.depth < 2 || h.depth > 4) return;
    const level = h.depth as 2 | 3 | 4;
    const opted = stripOptOut(h);

    // 節採番（章番号があり、opt-out でなく、maxDepth 以内のときだけ）
    let number: string | undefined;
    if (chapterNum !== undefined && !opted && h.depth <= cfg.maxDepth) {
      const di = h.depth - 2;
      counters[di] = (counters[di] ?? 0) + 1;
      for (let k = di + 1; k < counters.length; k++) counters[k] = 0;
      const parts: number[] = [chapterNum];
      for (let k = 0; k <= di; k++) parts.push(counters[k] ?? 0);
      number = parts.join('.');
      prependHeadingText(h, `${number}${cfg.separator}`);
    }

    ordinal += 1;
    const existing = readHeadingId(h);
    let anchorId: string;
    if (existing && existing.length > 0) {
      anchorId = existing;
    } else {
      anchorId = `${chapterId}-s${ordinal}`;
      setHeadingId(h, anchorId);
    }

    const numberedTitle = collectText(h.children).trim();
    const title =
      number !== undefined && numberedTitle.startsWith(number)
        ? numberedTitle.slice(number.length).replace(/^[\s　]+/, '')
        : numberedTitle;

    const record: SectionRecord = {
      anchorId,
      level,
      ...(number !== undefined ? { number } : {}),
      title,
      numberedTitle,
    };
    records.push(record);
  });
  return records;
}

function readHeadingId(h: Heading): string | undefined {
  const data = h.data as { hProperties?: { id?: unknown } } | undefined;
  const id = data?.hProperties?.id;
  return typeof id === 'string' ? id : undefined;
}

function setHeadingId(h: Heading, id: string): void {
  // mdast の HeadingData は `exactOptionalPropertyTypes` で hProperties を未知の構造として扱う。
  // figure-numbering と同じく `unknown` キャストで data を一旦掴んで再代入する。
  const node = h as unknown as { data?: { hProperties?: Record<string, unknown> } };
  const data = (node.data ?? {}) as { hProperties?: Record<string, unknown> };
  data.hProperties = { ...(data.hProperties ?? {}), id };
  node.data = data;
}

function chapterWord(n: number, style: 'jp' | 'en'): string {
  return style === 'en' ? `Chapter ${n}` : `第${n}章`;
}

/**
 * 見出しテキストから既存の章番号を読み取る。「第N章」/「Chapter N」の両形を許容する。
 */
function matchChapterNumber(text: string, style: 'jp' | 'en'): number | undefined {
  const primary = style === 'en' ? /Chapter\s+(\d+)/i : /第\s*(\d+)\s*章/;
  const m = text.match(primary) ?? text.match(/第\s*(\d+)\s*章/) ?? text.match(/Chapter\s+(\d+)/i);
  return m ? Number.parseInt(m[1]!, 10) : undefined;
}

/**
 * h1 テキストから章番号プレフィックス（「第N章」「Chapter N」）と章 ID マーカー（`{#chXX}`）を
 * 取り除いた純粋なタイトル文字列を取り出す。front-matter `title` がない場合の rawTitle 用。
 */
function extractRawTitle(text: string, _style: 'jp' | 'en'): string {
  let t = text.replace(/\{#[a-zA-Z0-9_-]+\}/g, '');
  t = t.replace(/^\s*第\s*\d+\s*章\s*[　 \t]*/, '');
  t = t.replace(/^\s*Chapter\s+\d+\s*[　 \t]*/i, '');
  return t.trim();
}

/**
 * h1 末尾の `{#chXX}` マーカーを除去する。h1 の最後のテキストノードに含まれるケースのみ対象。
 */
function stripChapterIdMarker(h: Heading): void {
  const last = h.children[h.children.length - 1];
  if (last && last.type === 'text') {
    last.value = last.value.replace(/\s*\{#[a-zA-Z0-9_-]+\}\s*$/, '');
  }
}

/**
 * 採番除外マーカー `{-}` / `{.unnumbered}` を見出しから取り除く。
 * 見つかれば true（＝この見出しは採番しない）。
 */
function stripOptOut(h: Heading): boolean {
  let found = false;
  for (const c of h.children) {
    if (c.type === 'text' && /\{(?:-|\.unnumbered)\}/.test(c.value)) {
      c.value = c.value.replace(/\s*\{(?:-|\.unnumbered)\}\s*/g, ' ').replace(/^\s+|\s+$/g, '');
      found = true;
    }
  }
  return found;
}

/**
 * 見出しの先頭にテキスト（番号）を前置する。
 * 先頭子が text ならそこに連結、そうでなければ text ノードを挿入する。
 */
function prependHeadingText(h: Heading, prefix: string): void {
  const first = h.children[0];
  if (first && first.type === 'text') {
    first.value = prefix + first.value;
  } else {
    h.children.unshift({ type: 'text', value: prefix });
  }
}

function collectText(
  nodes:
    | readonly RootContent[]
    | readonly { type: string; value?: string; children?: readonly { type: string }[] }[],
): string {
  let s = '';
  for (const n of nodes as Array<{ type: string; value?: string; children?: unknown[] }>) {
    if (n.type === 'text') s += n.value ?? '';
    else if (Array.isArray(n.children))
      s += collectText(n.children as Array<{ type: string; value?: string }>);
  }
  return s;
}

function deriveIdFromPath(p: string): string {
  const base = p.replace(/^.*\//, '').replace(/\.[^./]+$/, '');
  return base || p;
}

/**
 * 章番号ソースが食い違う場合に warning diagnostic を出す。番号自体は priority に従って
 * 既に決定済み。著者にズレを通知して将来のバグの芽を摘む。
 */
interface ChapterNumberSources {
  readonly fmChapterNumber: number | undefined;
  readonly fmIdNum: number | undefined;
  readonly idMarkerNum: number | undefined;
  readonly explicitLabel: number | undefined;
}

function emitDisagreement(
  ctx: PluginContext,
  path: string,
  chosen: number,
  chosenSource: ChapterNumberSource,
  sources: ChapterNumberSources,
): void {
  const others: string[] = [];
  if (
    sources.fmChapterNumber !== undefined &&
    sources.fmChapterNumber !== chosen &&
    chosenSource !== 'fm-chapterNumber'
  ) {
    others.push(`front-matter chapterNumber=${sources.fmChapterNumber}`);
  }
  if (sources.fmIdNum !== undefined && sources.fmIdNum !== chosen && chosenSource !== 'fm-id') {
    others.push(`front-matter id digit=${sources.fmIdNum}`);
  }
  if (
    sources.idMarkerNum !== undefined &&
    sources.idMarkerNum !== chosen &&
    chosenSource !== 'id-marker'
  ) {
    others.push(`h1 marker {#chNN}=${sources.idMarkerNum}`);
  }
  if (
    sources.explicitLabel !== undefined &&
    sources.explicitLabel !== chosen &&
    chosenSource !== 'explicit-label'
  ) {
    others.push(`h1 label "第N章"=${sources.explicitLabel}`);
  }
  if (others.length === 0) return;
  ctx.emit({
    severity: 'warning',
    source: 'heading-number',
    message: `${path}: chapter number=${chosen} (source: ${chosenSource}) disagrees with ${others.join(', ')}`,
  });
}
