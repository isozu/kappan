import { definePlugin } from '@kappan/core';
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
}

interface ResolvedOptions {
  readonly style: 'jp' | 'en';
  readonly numberChapter: boolean;
  readonly maxDepth: number;
  readonly separator: string;
}

/**
 * 見出しの自動採番プラグイン。
 *
 * 章（h1）に「第N章」、節（h2〜maxDepth）に「N.M」「N.M.K」を付ける。
 * 章番号は spine 順（`onMdastAllChapters` で受け取る章の並び）で採番するため、
 * 番号を持たない素の見出しだけの本でも多章で正しく連番になる。
 *
 * 記法：
 *   - `# タイトル`         → `第1章　タイトル`（numberChapter 既定 true）
 *   - `# 第3章 既存`        → そのまま（番号を尊重し、以降は 4 から続く）
 *   - `## 概要`            → `1.1　概要`
 *   - `### 詳細`           → `1.1.1　詳細`
 *   - `## まえがき {-}`     → 採番をスキップ（`{-}` / `{.unnumbered}` マーカー）
 *
 * 注意：`@kappan/plugin-figure-numbering` と併用し図表番号にも章番号を反映させたい
 * 場合は、各章 h1 に章番号を明記する（例 `# 第3章 タイトル`）。素の h1 を本プラグインで
 * 自動採番した場合、figure-numbering 側は章番号を 1 とみなすことがある（既知の制限）。
 */
export const headingNumber = definePlugin<HeadingNumberOptions>({
  name: '@kappan/plugin-heading-number',
  version: '0.1.0',
  kind: 'transform',
  hooks: (options = {}) => {
    const style: 'jp' | 'en' = options.labelStyle === 'en' ? 'en' : 'jp';
    const cfg: ResolvedOptions = {
      style,
      numberChapter: options.numberChapter !== false,
      maxDepth: clampDepth(options.maxDepth),
      separator: options.separator ?? (style === 'en' ? ' ' : '　'),
    };
    return {
      onMdastAllChapters(trees) {
        // 章番号は spine 順で採番する。明示「第N章」があればその番号に合わせ、
        // 次章はその続きから採番する。
        let nextAuto = options.startNumber ?? 1;
        for (const { tree } of trees) {
          nextAuto = numberOneChapter(tree, nextAuto, cfg);
        }
      },
    };
  },
});

function clampDepth(d: number | undefined): number {
  if (d === undefined) return 3;
  if (d < 2) return 2;
  if (d > 4) return 4;
  return d;
}

/**
 * 1 章分の見出しを採番する。戻り値は次章に渡す自動採番カウンタ。
 */
function numberOneChapter(tree: MdastRoot, nextAuto: number, cfg: ResolvedOptions): number {
  const h1 = tree.children.find((c): c is Heading => c.type === 'heading' && c.depth === 1);

  let chapterNum = nextAuto;
  let advanced = nextAuto;
  let numberSections = true;

  if (h1) {
    if (stripOptOut(h1)) {
      // 採番除外の章：章番号も節番号も振らないが、節のマーカーは除去しておく。
      processSections(tree, chapterNum, cfg, false);
      return nextAuto;
    }
    const manual = matchChapterNumber(collectText(h1.children), cfg.style);
    if (manual !== undefined) {
      // 既に番号がある章：その番号を使い、次章はその続きから。
      chapterNum = manual;
      advanced = manual + 1;
    } else {
      chapterNum = nextAuto;
      advanced = nextAuto + 1;
      if (cfg.numberChapter) {
        prependHeadingText(h1, `${chapterWord(chapterNum, cfg.style)}${cfg.separator}`);
      }
    }
  } else {
    // h1 を持たない章（前付けなど）：番号は消費せず、節も振らない。
    numberSections = false;
  }

  processSections(tree, chapterNum, cfg, numberSections);
  return advanced;
}

/**
 * 章内の見出しを処理する。`doNumber` が true のとき h2〜maxDepth に
 * 「N.M」「N.M.K」を前置する。除外マーカー `{-}` / `{.unnumbered}` は
 * 採番の有無にかかわらず常に除去する。
 */
function processSections(
  tree: MdastRoot,
  chapterNum: number,
  cfg: ResolvedOptions,
  doNumber: boolean,
): void {
  // counters[0] = h2, counters[1] = h3, counters[2] = h4
  const counters = [0, 0, 0];
  visit(tree, 'heading', (h: Heading) => {
    if (h.depth < 2) return; // h1 は呼び出し側で処理済み
    const opted = stripOptOut(h); // マーカーは常に剥がす
    if (!doNumber || opted || h.depth > cfg.maxDepth) return;
    const di = h.depth - 2;
    counters[di] = (counters[di] ?? 0) + 1;
    for (let k = di + 1; k < counters.length; k++) counters[k] = 0;
    const parts: number[] = [chapterNum];
    for (let k = 0; k <= di; k++) parts.push(counters[k] ?? 0);
    prependHeadingText(h, `${parts.join('.')}${cfg.separator}`);
  });
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
