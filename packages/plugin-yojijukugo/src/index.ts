import { definePlugin } from '@kappan/core';
import type { Root as MdastRoot, Text } from 'mdast';
import { visit } from 'unist-util-visit';
import { z } from 'zod';

export interface YojijukugoOptions {
  /** ユーザー追加の表記統一辞書（誤記/異表記 → 正規表記） */
  readonly dictionary?: Record<string, string>;
  /** 組み込み辞書を使うか（デフォルト true） */
  readonly useBuiltin?: boolean;
}

const optionsSchema = z
  .object({
    dictionary: z.record(z.string(), z.string()).optional(),
    useBuiltin: z.boolean().optional(),
  })
  .default({});

/**
 * 四字熟語をはじめとする日本語の表記ゆれ統一辞書プラグイン。
 *
 * 例：「再起不能」「危機一発」など慣用的な誤記を正規表記に統一する。
 * 組み込み辞書は最小（よくある誤記のみ）で、`dictionary` オプションで上書き・追加できる。
 *
 * 表記統一は校正支援の範疇であり過剰適用は危険なため、辞書は保守的に小さく保つ。
 * AST の text ノード単位で置換する（コードや URL は visit 対象外なので安全）。
 */
const BUILTIN_DICT: Record<string, string> = {
  // 慣用的な誤記 → 正
  危機一発: '危機一髪',
  絶対絶命: '絶体絶命',
  五里夢中: '五里霧中',
  一同に: '一堂に',
  意味伸長: '意味深長',
};

export const yojijukugo = definePlugin<YojijukugoOptions>({
  name: '@kappan/plugin-yojijukugo',
  version: '0.3.0',
  kind: 'transform',
  schema: optionsSchema as z.ZodType<YojijukugoOptions>,
  hooks: (options = {}) => {
    const dict: Record<string, string> = {
      ...(options.useBuiltin !== false ? BUILTIN_DICT : {}),
      ...(options.dictionary ?? {}),
    };
    const keys = Object.keys(dict).sort((a, b) => b.length - a.length); // 長い語優先
    return {
      onMdast(tree: MdastRoot) {
        if (keys.length === 0) return;
        visit(tree, 'text', (node: Text) => {
          let value = node.value;
          for (const key of keys) {
            if (value.includes(key)) {
              value = value.split(key).join(dict[key]!);
            }
          }
          node.value = value;
        });
      },
    };
  },
});
