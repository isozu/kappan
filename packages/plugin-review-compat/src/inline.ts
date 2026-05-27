/**
 * Re:VIEW インライン記法 → Markdown / Kappan 拡張記法 への変換。
 *
 * Re:VIEW のインライン記法は `@<command>{argument}` の形式である。
 * 引数中のエスケープ（`}` のエスケープに `\` を使う）は現状では未対応とする。
 */

interface InlineRule {
  readonly tag: string;
  readonly transform: (arg: string) => string;
}

/**
 * 単純な単一引数のインライン記法。
 */
const SIMPLE_RULES: readonly InlineRule[] = [
  { tag: 'code', transform: (s) => '`' + s + '`' },
  { tag: 'tt', transform: (s) => '`' + s + '`' },
  { tag: 'tti', transform: (s) => '`' + s + '`' },
  { tag: 'ttb', transform: (s) => '`' + s + '`' },
  { tag: 'b', transform: (s) => '**' + s + '**' },
  { tag: 'strong', transform: (s) => '**' + s + '**' },
  { tag: 'i', transform: (s) => '*' + s + '*' },
  { tag: 'em', transform: (s) => '*' + s + '*' },
  { tag: 'u', transform: (s) => '[' + s + ']{.underline}' },
  { tag: 'del', transform: (s) => '~~' + s + '~~' },
  { tag: 'strike', transform: (s) => '~~' + s + '~~' },
  { tag: 'kw', transform: (s) => '[' + s + ']{.kw}' },
  { tag: 'hidx', transform: (_s) => '' }, // 隠し索引は削除
  { tag: 'idx', transform: (s) => s }, // 索引は本文をそのまま残す（plugin-jp-index で対応）
  // 圏点：@<bou>{テキスト} → [テキスト]{.kenten}（remark-jp の圏点ノードに拾われる）
  { tag: 'bou', transform: (s) => '[' + s + ']{.kenten}' },
  // 縦中横：@<tcy>{テキスト} → [テキスト]{.tcy}（属性として通し、テーマ側で縦組み表示）
  { tag: 'tcy', transform: (s) => '[' + s + ']{.tcy}' },
  // 数式インライン：@<m>{...} → コードバッククォート退避（KaTeX 連携で対応）
  { tag: 'm', transform: (s) => '`' + s + '`' },
  // 網掛け・吹き出し：プレーンテキスト化で受理（背景塗りはテーマ拡張で対応）
  { tag: 'ami', transform: (s) => s },
  { tag: 'balloon', transform: (s) => s },
];

/**
 * 複数引数のインライン記法（カンマ区切り）。
 */
interface MultiArgRule {
  readonly tag: string;
  readonly transform: (args: readonly string[]) => string;
}

const MULTI_ARG_RULES: readonly MultiArgRule[] = [
  {
    tag: 'ruby',
    transform: ([base, reading]) => `{${base}|${reading}}`,
  },
  {
    tag: 'href',
    transform: (args) => {
      const url = args[0] ?? '';
      const text = args[1];
      if (text === undefined) return `[${url}](${url})`;
      return `[${text}](${url})`;
    },
  },
];

/**
 * ID 参照系（後段で resolveReferences が解決する想定だが、現状では即時テキスト化）。
 */
const REFERENCE_RULES: readonly InlineRule[] = [
  { tag: 'img', transform: (id) => `[図 ${id}]` },
  { tag: 'list', transform: (id) => `[リスト ${id}]` },
  { tag: 'table', transform: (id) => `[表 ${id}]` },
  { tag: 'eq', transform: (id) => `[式 ${id}]` },
  { tag: 'fn', transform: (id) => `[^${id}]` },
  { tag: 'chap', transform: (id) => `[${id} 章]` },
  { tag: 'chapref', transform: (id) => `[${id} 章]` },
  { tag: 'title', transform: (id) => `[${id}]` },
];

const INLINE_RE = /@<([a-z]+)>\{((?:[^{}\\]|\\.)*?)\}/g;

/**
 * 文字列中の `@<tag>{arg}` をすべて変換する。
 * 認識できないタグは元のテキストを残し、警告コメントを差し込む。
 */
export function transformInline(source: string): string {
  return source.replace(INLINE_RE, (match, tag: string, rawArg: string) => {
    const arg = unescapeBraces(rawArg);
    const simple = SIMPLE_RULES.find((r) => r.tag === tag);
    if (simple) return simple.transform(arg);

    const multi = MULTI_ARG_RULES.find((r) => r.tag === tag);
    if (multi) return multi.transform(splitArgs(arg));

    const ref = REFERENCE_RULES.find((r) => r.tag === tag);
    if (ref) return ref.transform(arg);

    // 未対応：原文を残しつつコメントで明示
    return `<!-- REVIEW-UNSUPPORTED: @<${tag}>{${arg}} -->${match}`;
  });
}

function unescapeBraces(s: string): string {
  return s.replace(/\\([{}\\])/g, '$1');
}

function splitArgs(s: string): string[] {
  // Re:VIEW はカンマ区切り。エスケープされたカンマ \, は分割対象外
  const out: string[] = [];
  let current = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && s[i + 1] === ',') {
      current += ',';
      i++;
    } else if (c === ',') {
      out.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  out.push(current);
  return out;
}
