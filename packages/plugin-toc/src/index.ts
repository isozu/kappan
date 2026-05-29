import {
  definePlugin,
  CHAPTER_REGISTRY_CACHE_KEY,
  type ChapterRegistry,
  type GeneratedDocument,
} from '@kappan/core';
import { z } from 'zod';
import { buildTocXhtml } from './buildTocXhtml.js';

export interface TocOptions {
  /** 目次ページのタイトル（既定「目次」）。h1 と `<title>` の両方に使う */
  readonly title?: string;
  /**
   * 目次の深さ：
   *   - `1`（既定）：章のみ
   *   - `2`：章 + h2 節
   *   - `3`：章 + h2 + h3
   */
  readonly depth?: 1 | 2 | 3;
  /**
   * spine 上の配置位置：
   *   - `'before-bodymatter'`（既定）：本文の前
   *   - `'after-bodymatter'`：本文の後（巻末目次）
   */
  readonly position?: 'before-bodymatter' | 'after-bodymatter';
  /** 目次ドキュメントの EPUB 内パス（既定 `content/toc.xhtml`）。content/ 配下推奨 */
  readonly href?: string;
  /** 目次ドキュメントの id（既定 `gentoc`）。manifest / spine の id に使う */
  readonly id?: string;
  /**
   * kind !== 'chapter'（frontmatter / backmatter / appendix）を目次に含めるか（既定 false）。
   * 既定では本文の章のみ並ぶ。`true` にすると索引・凡例なども目次に出る。
   */
  readonly includeNonChapter?: boolean;
}

const optionsSchema = z
  .object({
    title: z.string().min(1).optional(),
    depth: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    position: z.enum(['before-bodymatter', 'after-bodymatter']).optional(),
    href: z.string().min(1).optional(),
    id: z.string().min(1).optional(),
    includeNonChapter: z.boolean().optional(),
  })
  .default({});

/**
 * 読者向け目次（`content/toc.xhtml`）を spine に追加するプラグイン。
 *
 * `plugin-heading-number` が publish した `ChapterRegistry` を読み、本文の前
 * （または後）に目次ページとして XHTML を生成する。`ChapterRegistry` が未公開の
 * 場合は warning を出して何も生成しない（heading-number を入れ忘れた状況の検出）。
 *
 * EPUB3 の必須ナビゲーション `nav.xhtml` とは別に「読者がページとして読める」目次を作る。
 * 紙の本にある「目次」と同じ位置付け。
 *
 * 使用例:
 *   ```ts
 *   plugins: [
 *     headingNumber(),
 *     toc({ depth: 2 }),
 *   ]
 *   ```
 */
export const toc = definePlugin<TocOptions>({
  name: '@kappan/plugin-toc',
  version: '0.1.0',
  kind: 'transform',
  schema: optionsSchema as z.ZodType<TocOptions>,
  hooks: (options = {}) => {
    const title = options.title ?? '目次';
    const depth: 1 | 2 | 3 = options.depth ?? 1;
    const position: 'before-bodymatter' | 'after-bodymatter' =
      options.position ?? 'before-bodymatter';
    const href = options.href ?? 'content/toc.xhtml';
    const docId = options.id ?? 'gentoc';
    const includeNonChapter = options.includeNonChapter ?? false;

    return {
      onGenerate(ctx): readonly GeneratedDocument[] {
        const registry = ctx.cache.get<ChapterRegistry>(CHAPTER_REGISTRY_CACHE_KEY);
        if (!registry) {
          ctx.emit({
            severity: 'warning',
            source: 'plugin-toc',
            message:
              '目次を生成できません：ChapterRegistry が未公開です。' +
              ' plugin-toc は plugin-heading-number を前提とします（plugins 配列に headingNumber() を含めてください）。',
          });
          return [];
        }
        const xhtml = buildTocXhtml(registry.records, {
          title,
          language: ctx.config.metadata.language,
          depth,
          includeNonChapter,
          selfId: docId,
        });
        return [
          {
            id: docId,
            href,
            title,
            xhtml,
            position,
          },
        ];
      },
    };
  },
});
