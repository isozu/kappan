/**
 * Re:VIEW の config.yml / catalog.yml を読むための簡易 YAML パーサ。
 *
 * Re:VIEW のこれらのファイルは典型的に以下の構造に収まる：
 *   - top-level の `key: value` ペア
 *   - 配列：インライン `[a, b, c]` と複数行 `- item`
 *   - クォート：`"..."` と `'...'`
 *   - コメント：`#` 以降
 *   - 2 段のネスト（catalog の `PREDEF: [...]` 等）
 *
 * 完全な YAML 仕様には対応せず、上記の範囲に限定する。複雑なケースに
 * 遭遇した場合は parseYaml で例外を投げ、呼び出し側が `yaml` npm パッケージへ
 * フォールバックできるようにする（インターフェイスを揃えておく）。
 */

export type YamlValue =
  | string
  | number
  | boolean
  | null
  | readonly YamlValue[]
  | { readonly [key: string]: YamlValue };

export interface ParseYamlOptions {
  readonly path?: string;
}

export class YamlParseError extends Error {
  readonly path: string | undefined;
  readonly line: number;
  constructor(message: string, line: number, path?: string) {
    super(`${path ? path + ':' : ''}${line}: ${message}`);
    this.name = 'YamlParseError';
    this.line = line;
    this.path = path;
  }
}

/**
 * 簡易 YAML をパースして、トップレベルがオブジェクトの形で返す。
 */
export function parseYaml(source: string, opts: ParseYamlOptions = {}): Record<string, YamlValue> {
  const lines = source.split(/\r?\n/);
  const result: Record<string, YamlValue> = {};
  let i = 0;

  while (i < lines.length) {
    const raw = lines[i] ?? '';
    const stripped = stripComment(raw);
    if (stripped.trim() === '') {
      i += 1;
      continue;
    }
    // インデント無しの key: value のみをトップレベルとして扱う
    if (raw.startsWith(' ') || raw.startsWith('\t')) {
      throw new YamlParseError('unexpected indentation at top level', i + 1, opts.path);
    }

    const m = stripped.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (!m) {
      throw new YamlParseError(`invalid top-level line: "${raw}"`, i + 1, opts.path);
    }
    const key = m[1]!;
    const rest = m[2]!.trim();

    if (rest === '') {
      // 次の行から始まる複数行リストまたはマップ
      const block = collectIndentedBlock(lines, i + 1);
      i = block.nextIndex;
      result[key] = parseBlock(block.lines, i, opts.path);
    } else {
      result[key] = parseScalarOrInline(rest, i + 1, opts.path);
      i += 1;
    }
  }

  return result;
}

function stripComment(line: string): string {
  // 文字列内の # は保持する
  let inStr: false | "'" | '"' = false;
  for (let j = 0; j < line.length; j++) {
    const c = line[j];
    if (!inStr && (c === '"' || c === "'")) {
      inStr = c;
    } else if (inStr && c === inStr) {
      inStr = false;
    } else if (!inStr && c === '#') {
      return line.slice(0, j);
    }
  }
  return line;
}

interface IndentedBlock {
  lines: string[];
  nextIndex: number;
}

function collectIndentedBlock(lines: readonly string[], start: number): IndentedBlock {
  const out: string[] = [];
  let i = start;
  while (i < lines.length) {
    const raw = lines[i] ?? '';
    if (raw.trim() === '' || raw.startsWith(' ') || raw.startsWith('\t') || raw.startsWith('-')) {
      out.push(raw);
      i += 1;
    } else {
      break;
    }
  }
  return { lines: out, nextIndex: i };
}

/**
 * `- item` または `subkey: value` の繰り返しを解釈する。
 */
function parseBlock(lines: readonly string[], startLine: number, path?: string): YamlValue {
  const cleaned = lines.map((l) => stripComment(l)).filter((l) => l.trim() !== '');
  if (cleaned.length === 0) return null;

  // リスト判定：すべての行が "- " で始まる
  if (cleaned.every((l) => /^\s*-\s/.test(l) || /^-$/.test(l.trim()))) {
    return cleaned.map((l) => {
      const item = l.replace(/^\s*-\s*/, '').trim();
      return parseScalarOrInline(item, startLine, path);
    });
  }

  // マップ判定：インデント深さで最小レベルを map key として扱い、
  // それより深い行はそのキーの子ブロックとして再帰パースする。
  // ASCII 以外（例：「第1部」）の YAML キーも受理する。
  const minIndent = Math.min(...cleaned.map((l) => leadingSpaces(l)));
  const obj: Record<string, YamlValue> = {};

  let i = 0;
  while (i < cleaned.length) {
    const line = cleaned[i]!;
    if (leadingSpaces(line) !== minIndent) {
      throw new YamlParseError(`unexpected indentation: "${line}"`, startLine, path);
    }
    const m = line.match(/^\s+([^\s:][^:]*?)\s*:\s*(.*)$/);
    if (!m) {
      throw new YamlParseError(`unrecognized block line: "${line}"`, startLine, path);
    }
    const key = m[1]!.trim();
    const rest = m[2]!.trim();
    if (rest === '') {
      // 子ブロックを収集（minIndent より深い行）
      const childLines: string[] = [];
      i += 1;
      while (i < cleaned.length && leadingSpaces(cleaned[i]!) > minIndent) {
        childLines.push(cleaned[i]!);
        i += 1;
      }
      obj[key] = parseBlock(childLines, startLine, path);
    } else {
      obj[key] = parseScalarOrInline(rest, startLine, path);
      i += 1;
    }
  }
  return obj;
}

function leadingSpaces(line: string): number {
  let n = 0;
  for (const c of line) {
    if (c === ' ') n += 1;
    else if (c === '\t') n += 2;
    else break;
  }
  return n;
}

function parseScalarOrInline(text: string, line: number, path?: string): YamlValue {
  if (text === '') return null;
  if (text === 'null' || text === '~') return null;
  if (text === 'true') return true;
  if (text === 'false') return false;

  // インライン配列 [a, b, c]
  if (text.startsWith('[') && text.endsWith(']')) {
    const inner = text.slice(1, -1).trim();
    if (inner === '') return [];
    return splitInlineList(inner).map((s) => parseScalarOrInline(s.trim(), line, path));
  }

  // インラインマップ {key: value, key: value}（Re:VIEW の booktitle や aut で頻出）
  if (text.startsWith('{') && text.endsWith('}')) {
    const inner = text.slice(1, -1).trim();
    if (inner === '') return {};
    const obj: Record<string, YamlValue> = {};
    for (const entry of splitInlineList(inner)) {
      const colonIdx = findUnquotedColon(entry);
      if (colonIdx === -1) continue;
      const key = entry
        .slice(0, colonIdx)
        .trim()
        .replace(/^["']|["']$/g, '');
      const value = entry.slice(colonIdx + 1).trim();
      obj[key] = parseScalarOrInline(value, line, path);
    }
    return obj;
  }

  // クォート文字列
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    return text.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'");
  }

  // 数値
  if (/^-?\d+$/.test(text)) return Number.parseInt(text, 10);
  if (/^-?\d+\.\d+$/.test(text)) return Number.parseFloat(text);

  // 素の文字列
  return text;
}

function findUnquotedColon(text: string): number {
  let inStr: false | "'" | '"' = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (!inStr && (c === '"' || c === "'")) inStr = c;
    else if (inStr && c === inStr) inStr = false;
    else if (!inStr && c === ':') return i;
  }
  return -1;
}

function splitInlineList(text: string): string[] {
  // ネスト無しの単純な分割。文字列内のコンマを尊重する
  const out: string[] = [];
  let buf = '';
  let inStr: false | "'" | '"' = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (!inStr && (c === '"' || c === "'")) {
      inStr = c;
      buf += c;
    } else if (inStr && c === inStr) {
      inStr = false;
      buf += c;
    } else if (!inStr && c === ',') {
      out.push(buf);
      buf = '';
    } else {
      buf += c;
    }
  }
  if (buf.trim() !== '') out.push(buf);
  return out;
}
