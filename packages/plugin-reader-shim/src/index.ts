import { definePlugin } from '@kappan/core';
import type { Root as HastRoot, Element } from 'hast';
import { visit } from 'unist-util-visit';
import { z } from 'zod';

/** 対応リーダープロファイル。縦組み差異吸収済（CSS は Sumi/Saiun テーマに集約）。 */
export type ReaderProfile = 'apple' | 'kindle' | 'kobo' | 'thorium' | 'generic';

export interface ReaderShimOptions {
  /** 対象プロファイル（デフォルト 'generic'）。body に `reader-<profile>` class を付ける */
  readonly profile?: ReaderProfile;
}

const optionsSchema = z
  .object({
    profile: z.enum(['apple', 'kindle', 'kobo', 'thorium', 'generic']).optional(),
  })
  .default({});

/**
 * リーダー互換性 shim（横組み・縦組み共通）。
 *
 * 各 EPUB リーダーの CSS 実装差異をテーマ側で吸収できるよう、body に
 * `reader-<profile>` class を付与する。テーマはこの class を見て個別に微調整できる。
 *
 * 縦組みリーダー差異（ルビ位置、圏点位置、text-combine の prefix・サポート差）の
 * 吸収 CSS は Sumi/Saiun テーマの `body.reader-<profile>.kappan-vertical-rl { ... }`
 * ブロックに集約する（Kindle で `@supports` は不安定なため prefix 併記）。
 * 本プラグインは class 付与に徹し、組み方向で分岐しない（縦組みでも横組みと同じ
 * `reader-<profile>` class を付け、差異吸収は CSS に委ねる）。
 *
 * onHast で body 要素に class を足すだけなので、どのビルドでも安全に動く。
 */
export const readerShim = definePlugin<ReaderShimOptions>({
  name: '@kappan/plugin-reader-shim',
  version: '0.3.0',
  kind: 'typography',
  schema: optionsSchema as z.ZodType<ReaderShimOptions>,
  hooks: (options = {}) => {
    const profile = options.profile ?? 'generic';
    const cls = `reader-${profile}`;
    return {
      onHast(tree: HastRoot) {
        visit(tree, 'element', (node: Element) => {
          if (node.tagName !== 'body') return;
          const props = node.properties ?? {};
          const existing = props['className'];
          const list = Array.isArray(existing)
            ? existing.map(String)
            : typeof existing === 'string'
              ? existing.split(/\s+/).filter(Boolean)
              : [];
          if (!list.includes(cls)) list.push(cls);
          node.properties = { ...props, className: list };
        });
      },
    };
  },
});
