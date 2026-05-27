import { transformReviewSource } from '@kappan/plugin-review-compat';
import type { ChapterEntry } from './parseCatalog.js';

export interface ConvertFileInput {
  /** Re:VIEW ソース文字列 */
  readonly source: string;
  /** catalog から得られた章エントリ（id、next を埋め込むのに使う） */
  readonly chapter: ChapterEntry;
  /** 画像ファイル名（拡張子なし、または完全名）→ 実在ファイル名 */
  readonly imageIndex?: ReadonlyMap<string, string>;
}

export interface ConvertedChapter {
  /** front-matter 込みの完成 Markdown */
  readonly markdown: string;
  /** Markdown 中の <!-- REVIEW-UNSUPPORTED: ... --> の行番号と内容 */
  readonly unsupported: ReadonlyArray<{ line: number; snippet: string }>;
}

const TITLE_PATTERN = /^#{1,6}\s+(.+?)(?:\s*\{#[^}]+\})?\s*$/;

/**
 * 単一の .re ソースを Markdown に変換する。
 *
 * 流れ：
 *   1. `@kappan/plugin-review-compat` の transformReviewSource で記法変換
 *   2. 画像参照の拡張子を image index で補完
 *   3. 章タイトルを抽出して front-matter を組み立て
 *   4. 未対応記法を集計
 */
export function convertReviewFile(input: ConvertFileInput): ConvertedChapter {
  const transformed = transformReviewSource(input.source);
  const withImages = resolveImageExtensions(transformed, input.imageIndex);

  // タイトル抽出（最初の見出し）
  const title = extractTitle(withImages) ?? input.chapter.id;

  // front-matter を作る
  const fm: string[] = ['---'];
  fm.push(`title: ${escapeYamlString(title)}`);
  fm.push(`id: ${input.chapter.id}`);
  fm.push(`chapterNumber: ${input.chapter.chapterNumber}`);
  if (input.chapter.part !== undefined) {
    fm.push(`part: ${input.chapter.part}`);
    if (input.chapter.partTitle) {
      fm.push(`partTitle: ${escapeYamlString(input.chapter.partTitle)}`);
    }
  }
  if (input.chapter.next) fm.push(`next: ${input.chapter.next}`);
  fm.push('---', '');

  const markdown = fm.join('\n') + withImages;

  // 未対応記法の検出
  const unsupported = collectUnsupported(markdown);

  return { markdown, unsupported };
}

function extractTitle(markdown: string): string | undefined {
  for (const line of markdown.split(/\r?\n/)) {
    const m = line.match(TITLE_PATTERN);
    if (m) return m[1]!.trim();
  }
  return undefined;
}

function escapeYamlString(s: string): string {
  if (/[":#\n]/.test(s)) {
    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return s;
}

/**
 * `![](images/<stem>.png)` のような暫定 src を、image index で実在ファイル名に置き換える。
 * 拡張子が違うケース（jpg 等）に対応する。
 */
function resolveImageExtensions(
  markdown: string,
  imageIndex?: ReadonlyMap<string, string>,
): string {
  // 章ファイルは `src/<chap>.md`、画像はプロジェクトルートの `images/<file>` にコピーされるため、
  // 章から見た相対パスは `../images/<file>` となる。
  return markdown.replace(
    /!\[([^\]]*)\]\(images\/([^)\s]+)\)/g,
    (_match, alt: string, file: string) => {
      let resolvedFile = file;
      if (imageIndex && imageIndex.size > 0 && !imageIndex.has(file)) {
        const stem = file.replace(/\.[^.]+$/, '');
        const resolvedPath = imageIndex.get(stem) ?? imageIndex.get(file);
        if (resolvedPath) {
          resolvedFile = resolvedPath.split('/').pop() ?? file;
        }
      }
      return `![${alt}](../images/${resolvedFile})`;
    },
  );
}

function collectUnsupported(markdown: string): Array<{ line: number; snippet: string }> {
  const out: Array<{ line: number; snippet: string }> = [];
  const lines = markdown.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.includes('REVIEW-UNSUPPORTED')) {
      out.push({ line: i + 1, snippet: line.trim() });
    }
  }
  return out;
}
