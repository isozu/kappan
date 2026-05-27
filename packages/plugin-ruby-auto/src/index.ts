import { definePlugin } from '@kappan/core';
import type { Root as MdastRoot, Text, Parent, PhrasingContent } from 'mdast';
import { visit } from 'unist-util-visit';
import { z } from 'zod';

export interface RubyAutoOptions {
  /**
   * 難読漢字 → 読みの辞書（ユーザー指定）。kuromoji.js を使わず、この辞書だけで
   * ルビを振るのがデフォルト動作。MeCab/UniDic 不要・辞書同梱不要。
   */
  readonly dictionary?: Record<string, string>;
  /**
   * kuromoji.js による自動読み推定を有効にする（デフォルト false）。
   * `kuromoji` を別途インストールし辞書を用意する必要がある（Docker `:full` 同梱想定）。
   * 未導入時は warning を出し、`dictionary` のみで動作する。
   */
  readonly autoReading?: boolean;
}

const optionsSchema = z
  .object({
    dictionary: z.record(z.string(), z.string()).optional(),
    autoReading: z.boolean().optional(),
  })
  .default({});

/**
 * 難読漢字の自動ルビ付与プラグイン。
 *
 * デフォルトはユーザー提供の `dictionary`（語→読み）による決定的なルビ付与で、
 * kuromoji.js も MeCab/UniDic も不要。`autoReading: true` のときだけ optional な
 * kuromoji.js を使うが、本フェーズでは未導入を検出して dictionary のみにフォールバックする。
 *
 * ルビは `<ruby>語<rt>よみ</rt></ruby>` を mdast の data.hName で生成する
 * （文字列置換せず AST で組む）。同じ語が複数回出ても全て振る。
 */
export const rubyAuto = definePlugin<RubyAutoOptions>({
  name: '@kappan/plugin-ruby-auto',
  version: '0.3.0',
  kind: 'transform',
  schema: optionsSchema as z.ZodType<RubyAutoOptions>,
  hooks: (options = {}) => {
    const dict = options.dictionary ?? {};
    const keys = Object.keys(dict).sort((a, b) => b.length - a.length);
    let warnedAuto = false;
    return {
      onMdast(tree: MdastRoot, ctx) {
        if (options.autoReading && !warnedAuto) {
          warnedAuto = true;
          ctx.logger.warn(
            'ruby-auto: autoReading is requested but kuromoji-based inference is not ' +
              'enabled in this build. Using the provided dictionary only.',
          );
        }
        if (keys.length === 0) return;
        visit(tree, 'text', (node: Text, index, parent) => {
          if (!parent || typeof index !== 'number') return;
          const hit = keys.find((k) => node.value.includes(k));
          if (!hit) return;
          const nodes = splitWithRuby(node.value, keys, dict);
          if (nodes.length === 1 && nodes[0]!.type === 'text') return;
          (parent as Parent).children.splice(index, 1, ...nodes);
          return index + nodes.length;
        });
      },
    };
  },
});

function splitWithRuby(
  value: string,
  keys: readonly string[],
  dict: Record<string, string>,
): PhrasingContent[] {
  const nodes: PhrasingContent[] = [];
  let i = 0;
  let buffer = '';
  const flush = () => {
    if (buffer.length > 0) {
      nodes.push({ type: 'text', value: buffer });
      buffer = '';
    }
  };
  outer: while (i < value.length) {
    for (const key of keys) {
      if (value.startsWith(key, i)) {
        flush();
        nodes.push({
          type: 'emphasis',
          data: { hName: 'ruby' },
          children: [
            { type: 'text', value: key },
            {
              type: 'emphasis',
              data: { hName: 'rt' },
              children: [{ type: 'text', value: dict[key]! }],
            } as unknown as PhrasingContent,
          ],
        } as unknown as PhrasingContent);
        i += key.length;
        continue outer;
      }
    }
    buffer += value[i];
    i += 1;
  }
  flush();
  return nodes;
}
