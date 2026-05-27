import { definePlugin } from '@kappan/core';
import type { Root as HastRoot, Element } from 'hast';
import { visit } from 'unist-util-visit';

export interface KinsokuOptions {
  /** 段落クラス名（デフォルト 'kinsoku'） */
  readonly className?: string;
  /** 厳密モード：拗音・長音も禁則対象に含める（デフォルト false） */
  readonly strict?: boolean;
}

/**
 * 行頭禁則文字（行頭に来てはならない文字）。
 * JLReq の主要規則を抜粋。
 *
 * これらの文字が text ノードの先頭に来ている場合、
 * 直前のテキスト末尾とくっつけて改行されないようにする。
 */
const LINE_START_BASIC = new Set([
  '、',
  '。',
  '，',
  '．',
  '・',
  '：',
  '；',
  '？',
  '！',
  '”',
  '’',
  '）',
  '〕',
  '］',
  '｝',
  '〉',
  '》',
  '」',
  '』',
  '】',
]);

const LINE_START_STRICT_ADDITIONS = new Set([
  'ぁ',
  'ぃ',
  'ぅ',
  'ぇ',
  'ぉ',
  'っ',
  'ゃ',
  'ゅ',
  'ょ',
  'ゎ',
  'ァ',
  'ィ',
  'ゥ',
  'ェ',
  'ォ',
  'ッ',
  'ャ',
  'ュ',
  'ョ',
  'ヮ',
  'ー',
  '〜',
]);

/**
 * 行末禁則文字（行末に来てはならない文字＝開き括弧類）。
 */
const LINE_END_FORBIDDEN = new Set([
  '“',
  '‘',
  '（',
  '〔',
  '［',
  '｛',
  '〈',
  '《',
  '「',
  '『',
  '【',
]);

/**
 * 禁則処理プラグイン。
 *
 * 動作：
 *   1. 段落（p、li 等）にクラス `kinsoku` を付与
 *   2. 段落内の text ノードの先頭が行頭禁則文字の場合、直前と分割不可マーカーで結合
 *   3. 段落内の text ノードの末尾が行末禁則文字の場合、直後と分割不可マーカーで結合
 *
 * Reading System が `line-break: strict` を正しく解釈しない場合のフォールバックとして、
 * 明示的なクラス付与とインライン構造で禁則を強制する。
 *
 * 公式プラグインカタログ ★★★。
 */
export const kinsoku = definePlugin<KinsokuOptions>({
  name: '@kappan/plugin-kinsoku',
  version: '0.3.0',
  kind: 'typography',
  hooks: (options = {}) => {
    const className = options.className ?? 'kinsoku';
    const lineStartForbidden = options.strict
      ? new Set<string>([...LINE_START_BASIC, ...LINE_START_STRICT_ADDITIONS])
      : LINE_START_BASIC;
    return {
      onHast(tree: HastRoot) {
        visit(tree, 'element', (node: Element) => {
          if (!isBlockText(node.tagName)) return;
          ensureClass(node, className);
          mergeAdjacentTextNodes(node);
          applyKinsokuToChildren(node, lineStartForbidden);
        });
      },
    };
  },
});

function isBlockText(tag: string): boolean {
  return tag === 'p' || tag === 'li' || tag === 'dd' || tag === 'dt' || tag === 'blockquote';
}

function ensureClass(node: Element, className: string): void {
  const props = (node.properties ??= {});
  const existing = props['className'];
  if (Array.isArray(existing)) {
    if (!existing.includes(className)) existing.push(className);
  } else {
    props['className'] = [className];
  }
}

/**
 * 隣接する text ノードを 1 つに統合する（regex 適用の前準備）。
 */
function mergeAdjacentTextNodes(node: Element): void {
  const merged: Array<Element | { type: string; value?: string }> = [];
  for (const child of node.children) {
    const last = merged[merged.length - 1];
    if (child.type === 'text' && last && last.type === 'text') {
      (last as { value: string }).value += child.value;
    } else {
      merged.push(child as Element | { type: string; value?: string });
    }
  }
  node.children = merged as Element['children'];
}

/**
 * text ノード内の行頭・行末禁則文字を nowrap span でラップする。
 *
 * 簡易戦略：行頭禁則文字の直前の 1 文字、または行末禁則文字の直後の 1 文字を
 * セットで `<span class="kinsoku-no-break">…</span>` で囲む。
 * これにより、その境界で改行が発生しなくなる。
 */
function applyKinsokuToChildren(node: Element, lineStartForbidden: ReadonlySet<string>): void {
  const out: Element['children'] = [];
  for (const child of node.children) {
    if (child.type !== 'text') {
      out.push(child);
      continue;
    }
    const segments = segmentText(child.value, lineStartForbidden);
    if (segments.length === 1 && segments[0]!.kind === 'plain') {
      out.push(child);
      continue;
    }
    for (const seg of segments) {
      if (seg.kind === 'plain') {
        out.push({ type: 'text', value: seg.value });
      } else {
        out.push({
          type: 'element',
          tagName: 'span',
          properties: { className: ['kinsoku-no-break'] },
          children: [{ type: 'text', value: seg.value }],
        });
      }
    }
  }
  node.children = out;
}

interface Segment {
  kind: 'plain' | 'kinsoku';
  value: string;
}

/**
 * テキストを禁則ペアごとにセグメント化する。
 *
 * 例：`これは「テスト」です。`
 *   → ['これは', '「テ', 'スト', '」です', '。']
 *   ※ 開き括弧の直後と閉じ括弧の直前で nowrap セグメントを作る
 *
 * 実装は簡素化：
 *   - 文字を 1 文字ずつ走査
 *   - 「禁則文字＋次の1文字」または「前の1文字＋禁則文字」を kinsoku セグメントにまとめる
 *   - 連続適用すれば「直前」と「直後」の両方に対応
 */
function segmentText(text: string, lineStartForbidden: ReadonlySet<string>): readonly Segment[] {
  if (text.length < 2) return [{ kind: 'plain', value: text }];

  const chars = [...text];
  const segments: Segment[] = [];
  let buffer = '';

  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]!;
    const next = chars[i + 1];

    // 行末禁則文字（開き括弧類）：直後の文字とくっつける
    if (LINE_END_FORBIDDEN.has(c) && next) {
      if (buffer) {
        segments.push({ kind: 'plain', value: buffer });
        buffer = '';
      }
      segments.push({ kind: 'kinsoku', value: c + next });
      i += 1; // 次の文字を消費
      continue;
    }

    // 行頭禁則文字（句読点・閉じ括弧類）：直前の 1 文字と結合
    if (lineStartForbidden.has(c) && buffer.length > 0) {
      const lastChar = [...buffer].pop()!;
      const newBuffer = buffer.slice(0, buffer.length - lastChar.length);
      if (newBuffer) segments.push({ kind: 'plain', value: newBuffer });
      segments.push({ kind: 'kinsoku', value: lastChar + c });
      buffer = '';
      continue;
    }

    buffer += c;
  }

  if (buffer) segments.push({ kind: 'plain', value: buffer });
  return segments;
}
