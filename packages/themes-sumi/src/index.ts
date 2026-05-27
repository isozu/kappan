import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineTheme } from '@kappan/core';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ASSETS_DIR = path.resolve(__dirname, '..', 'assets');

const SumiOptionsSchema = z
  .object({
    additionalCss: z.string().optional(),
  })
  .strict();

export type SumiOptions = z.infer<typeof SumiOptionsSchema>;

/**
 * Sumi（墨）テーマ — 縦組み小説向け。
 *
 * 「Kindle Unlimited で売れる日本語縦書き小説」を商業品質で組むための
 * 公式テーマ。`getAssets()` が返す theme.css は横組みでも valid な基底スタイルを持ち、
 * 縦組みビルド時（`writingMode: 'vertical-rl'`）にビルドが付ける
 * `<body class="kappan-vertical-rl">` を起点に縦組み中核を発火させる:
 * - `writing-mode: vertical-rl`（prefix 併記）+ `text-orientation: mixed`
 * - コードブロック（pre）は縦組み中も `horizontal-tb` に固定
 * - ルビ・圏点の縦位置（右側）、縦中横（.tcy、plugin-tcy-smart 連携）
 * - 章扉の改ページ、地の文 1 字下げ / 会話文抑制（remark-jp の narrative/dialogue）、
 *   連続約物の非改行（remark-jp の renzoku-dash/renzoku-leader）
 * - リーダー別 fallback（reader-shim の reader-<profile> 起点、@supports 非使用）
 *
 * 縦組みで推奨するプラグインセット: `ruby, kenten, kinsoku, tcySmart, punctuation,
 * dialogue, readerShim`。横組み専用テーマ（kohaku/hibana/mono）は縦組み非対応なので、
 * 縦組みは Sumi（小説）または Saiun（技術書も縦組み可）を使う。
 */
export function sumi(options: SumiOptions = {}) {
  const parsed = SumiOptionsSchema.parse(options);
  return defineTheme({
    name: '@kappan/themes-sumi',
    version: '0.3.0',
    async getAssets() {
      const assets = new Map<string, Uint8Array>();
      const resetBytes = await readFile(path.join(ASSETS_DIR, 'reset.css'));
      let themeBytes = await readFile(path.join(ASSETS_DIR, 'theme.css'));
      if (parsed.additionalCss) {
        themeBytes = Buffer.concat([
          themeBytes,
          Buffer.from('\n/* sumi() user overrides */\n' + parsed.additionalCss + '\n', 'utf-8'),
        ]);
      }
      assets.set('styles/reset.css', new Uint8Array(resetBytes));
      assets.set('styles/theme.css', new Uint8Array(themeBytes));
      return assets;
    },
  });
}
