import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { KappanConfig } from '../config/schema.js';
import type { ChapterFrontmatter } from '../types.js';
import { parseFrontmatter } from './frontmatter.js';

export interface Chapter {
  /** ファイルパス（baseDir からの相対） */
  readonly relativePath: string;
  /** 章ファイルの絶対パス（画像など相対参照の解決基準） */
  readonly absolutePath: string;
  /** spine / manifest 用の id。front-matter の id か、ファイル名から自動推定 */
  readonly id: string;
  /** 章タイトル。front-matter の title か、Markdown 本文の最初の見出しから推定 */
  readonly title: string;
  /** Markdown 本文（front-matter は除去済み） */
  readonly markdown: string;
  /** パース済み front-matter（章番号・部・種別などプラグインが参照する） */
  readonly frontmatter: ChapterFrontmatter;
}

/**
 * 章ファイルを front-matter の `next` フィールドを辿って順序付きで収集する。
 *
 * 制約：
 *   - entry から始めて next を順に辿る単純なリンクリスト
 *   - 循環参照は検出してエラー
 */
export async function collectChapters(config: KappanConfig, configDir: string): Promise<Chapter[]> {
  const baseDir = path.resolve(configDir, config.source.baseDir);
  const chapters: Chapter[] = [];
  const visited = new Set<string>();

  let cursor: string | undefined = config.source.entry;

  while (cursor) {
    const absPath = path.resolve(configDir, cursor);
    const relativePath = path.relative(baseDir, absPath);

    if (visited.has(absPath)) {
      throw new Error(
        `Cyclic chapter reference detected at ${relativePath}. ` +
          `Check the 'next' field in your chapter front-matter.`,
      );
    }
    visited.add(absPath);

    const raw = await readFile(absPath, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(raw);

    chapters.push({
      relativePath,
      absolutePath: absPath,
      id: frontmatter.id ?? slugifyFilename(relativePath),
      title: frontmatter.title ?? extractFirstHeading(body) ?? relativePath,
      markdown: body,
      frontmatter,
    });

    cursor = frontmatter.next ? path.join(path.dirname(cursor), frontmatter.next) : undefined;
  }

  return chapters;
}

function slugifyFilename(filename: string): string {
  return path
    .basename(filename, path.extname(filename))
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function extractFirstHeading(markdown: string): string | undefined {
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^#+\s+(.+)$/);
    if (match) {
      return match[1]!.trim();
    }
  }
  return undefined;
}
