import { transformBlocks, type TransformBlockOptions } from './block.js';
import { transformInline } from './inline.js';

export interface TransformReviewOptions {
  /**
   * `//raw` ブロックを素通しするか。`reviewCompat({ allowRaw: true })` に対応。
   * デフォルト false。`unsafeHtml: 'sanitized' | 'trusted'` と組み合わせて使う。
   */
  readonly allowRaw?: boolean;
}

/**
 * Re:VIEW 記法を含む文字列を Markdown / Kappan 拡張記法に変換する。
 *
 * 処理順：
 *   1. ブロック記法（//tag[...]{...//}）の変換と見出し（={id}）の変換
 *   2. インライン記法（@<tag>{...}）の変換
 *
 * この順序は重要：ブロックを先に処理することで、ブロック内のインライン記法が
 * 適切な位置（コードブロック内かどうかなど）の判断のもとで変換される。
 */
export function transformReviewSource(
  source: string,
  options: TransformReviewOptions = {},
): string {
  const blockOpts: TransformBlockOptions = { allowRaw: options.allowRaw === true };
  const afterBlock = transformBlocks(source, blockOpts);
  // コードブロック内のインライン記法は変換しない
  return transformInlineExceptCode(afterBlock);
}

/**
 * コードブロック内のインライン記法を保護しながら全体を変換する。
 */
function transformInlineExceptCode(source: string): string {
  const lines = source.split(/\r?\n/);
  const out: string[] = [];
  let inFence = false;
  for (const line of lines) {
    if (line.startsWith('```')) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
    } else {
      out.push(transformInline(line));
    }
  }
  return out.join('\n');
}
