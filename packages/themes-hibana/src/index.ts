import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineTheme } from '@kappan/core';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ASSETS_DIR = path.resolve(__dirname, '..', 'assets');

const HibanaOptionsSchema = z
  .object({
    accent: z
      .string()
      .regex(/^#[0-9a-fA-F]{3,8}$|^rgb|^hsl|^var\(/, 'accent must be a CSS color value')
      .optional(),
    /** ステップ番号を強調表示（マニュアル定番） */
    stepBadges: z.boolean().optional(),
    additionalCss: z.string().optional(),
  })
  .strict();

export type HibanaOptions = z.infer<typeof HibanaOptionsSchema>;

function buildOverrideCss(opts: HibanaOptions): string {
  const lines: string[] = [];
  if (opts.accent) {
    lines.push(':root {', `  --hibana-accent: ${opts.accent};`, '}');
  }
  if (opts.stepBadges) {
    lines.push(
      'ol > li { position: relative; padding-left: 2.4em; list-style: none; margin: 0.5em 0; }',
      'ol > li::before { content: counter(list-item); counter-increment: list-item; position: absolute; left: 0; top: 0.1em; width: 1.8em; height: 1.8em; line-height: 1.8em; text-align: center; background: var(--hibana-accent, #d94f29); color: white; border-radius: 50%; font-weight: 700; font-size: 0.85em; }',
    );
  }
  if (opts.additionalCss) lines.push(opts.additionalCss);
  return lines.length > 0 ? '\n/* hibana() user overrides */\n' + lines.join('\n') + '\n' : '';
}

/**
 * Hibana（火花）テーマ — マニュアル / How-to 向け公式テーマ。
 *
 * 設計：
 *   - 本文サンセリフ（読みやすい）、コードは等幅
 *   - 注意喚起（admonition）の枠を鮮やかなオレンジ＝火花
 *   - 手順を順序リストで書くと、`stepBadges` オプションで丸番号バッジ化
 *   - リーダー側の幅に合わせて図表は余白控えめ
 */
export function hibana(options: HibanaOptions = {}) {
  const parsed = HibanaOptionsSchema.parse(options);
  return defineTheme({
    name: '@kappan/themes-hibana',
    version: '0.3.0',
    async getAssets() {
      const assets = new Map<string, Uint8Array>();
      const resetBytes = await readFile(path.join(ASSETS_DIR, 'reset.css'));
      let themeBytes = await readFile(path.join(ASSETS_DIR, 'theme.css'));
      const override = buildOverrideCss(parsed);
      if (override.length > 0) {
        themeBytes = Buffer.concat([themeBytes, Buffer.from(override, 'utf-8')]);
      }
      assets.set('styles/reset.css', new Uint8Array(resetBytes));
      assets.set('styles/theme.css', new Uint8Array(themeBytes));
      return assets;
    },
  });
}
