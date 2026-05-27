import type { ChapterFrontmatter } from '../types.js';

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;

export interface ParsedSource {
  readonly frontmatter: ChapterFrontmatter;
  readonly body: string;
}

/**
 * Markdown ソース先頭の YAML front-matter を分解する。
 * title / id / next の3フィールドを認識する最小実装。
 * 値のクォート（' または "）は除去する。
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

    if (key === 'title' || key === 'id' || key === 'next') {
      frontmatter[key] = value;
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
