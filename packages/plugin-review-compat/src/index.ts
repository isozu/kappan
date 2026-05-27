import { definePlugin } from '@kappan/core';
import { z } from 'zod';
import { transformReviewSource } from './transform.js';

export interface ReviewCompatOptions {
  /** 未対応記法を検出した時にビルドを warning にする（デフォルト true） */
  readonly warnOnUnsupported?: boolean;
  /**
   * `//raw` ブロック（Re:VIEW の生 HTML 埋め込み）を素通しで出力するか。
   *
   * - `false`（デフォルト）：`<!-- review-raw: ... -->` コメント化して保留する
   * - `true`：本文を生 HTML として出力する
   *
   * **重要**：`true` にする場合は `kappan.config.ts` 側で
   * `unsafeHtml: 'sanitized'` または `'trusted'` を設定する必要がある。
   * デフォルトの `unsafeHtml: false` だと remark-rehype が生 HTML を破棄して
   * EPUBCheck が `<!-- review-raw: ... -->` 部分を見ない（実害なし）か、
   * 内容によっては破壊的に出力されて EPUBCheck で失敗する可能性がある。
   */
  readonly allowRaw?: boolean;
}

const optionsSchema = z
  .object({
    warnOnUnsupported: z.boolean().optional(),
    allowRaw: z.boolean().optional(),
  })
  .default({});

/**
 * Re:VIEW 互換レイヤープラグイン。
 *
 * 「Re:VIEW 記法の部分受理レイヤー」を実装する。
 * onSource フックで Markdown ソースを受け取り、Re:VIEW 記法を
 * Markdown / Kappan 拡張記法に文字列前処理で変換する。
 *
 * 完全互換は目指さず、技術書典で頻出する上位 25-30 記法に集中する。
 * 認識できない記法は HTML コメントで残し、ビルドは中断しない。
 */
export const reviewCompat = definePlugin<ReviewCompatOptions>({
  name: '@kappan/plugin-review-compat',
  version: '0.3.0',
  kind: 'syntax',
  schema: optionsSchema as z.ZodType<ReviewCompatOptions>,
  hooks: (options = {}) => ({
    async onSource(source, ctx) {
      const converted = transformReviewSource(source.content, {
        allowRaw: options.allowRaw === true,
      });
      if (options.warnOnUnsupported !== false) {
        const unsupportedCount = countUnsupported(converted);
        if (unsupportedCount > 0) {
          ctx.logger.warn(
            `review-compat: ${unsupportedCount} unsupported Re:VIEW notation(s) in ${source.path}`,
          );
        }
      }
      return { ...source, content: converted };
    },
  }),
});

function countUnsupported(text: string): number {
  return (text.match(/REVIEW-UNSUPPORTED/g) ?? []).length;
}

export { transformReviewSource };
export { sanitizeXmlId } from './block.js';
