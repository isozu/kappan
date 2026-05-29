import type { ChapterFrontmatter, ChapterKind } from '../types.js';

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;

const CHAPTER_KINDS: ReadonlySet<ChapterKind> = new Set([
  'chapter',
  'frontmatter',
  'backmatter',
  'appendix',
]);

export interface ParsedSource {
  readonly frontmatter: ChapterFrontmatter;
  readonly body: string;
}

/**
 * Markdown ソース先頭の YAML front-matter を分解する。
 *
 * 認識フィールド：
 *   - 文字列: `title` / `id` / `next` / `partTitle`
 *   - 列挙: `kind` (chapter|frontmatter|backmatter|appendix)
 *   - 整数: `part` / `chapterNumber`
 *
 * 値のクォート（' または "）は除去する。未知のキーは無視する（後方互換）。
 */
export function parseFrontmatter(source: string): ParsedSource {
  const match = source.match(FRONTMATTER_RE);
  if (!match) {
    return { frontmatter: {}, body: source };
  }
  const [, yaml = '', body = ''] = match;
  const frontmatter: Mutable<ChapterFrontmatter> = {};

  for (const rawLine of yaml.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    const value = unquote(line.slice(colonIdx + 1).trim());

    if (key === 'title' || key === 'id' || key === 'next' || key === 'partTitle') {
      frontmatter[key] = value;
    } else if (key === 'kind') {
      if ((CHAPTER_KINDS as ReadonlySet<string>).has(value)) {
        frontmatter.kind = value as ChapterKind;
      }
    } else if (key === 'part' || key === 'chapterNumber') {
      const n = Number.parseInt(value, 10);
      if (Number.isFinite(n)) frontmatter[key] = n;
    }
  }

  return { frontmatter, body };
}

function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' || first === "'") && first === last) {
      return value.slice(1, -1);
    }
  }
  return value;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
