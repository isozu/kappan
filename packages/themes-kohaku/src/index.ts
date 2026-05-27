import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineTheme } from '@kappan/core';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ASSETS_DIR = path.resolve(__dirname, '..', 'assets');

const KohakuOptionsSchema = z
  .object({
    /** アクセント色（引用・参考文献の枠）。CSS 色値 */
    accent: z
      .string()
      .regex(/^#[0-9a-fA-F]{3,8}$|^rgb|^hsl|^var\(/, 'accent must be a CSS color value')
      .optional(),
    /** 本文行間（学術書向けは詰める）。0.5〜2.5 */
    lineHeight: z.number().min(0.5).max(2.5).optional(),
    /** 章番号を本文より大きく見せる（学術書定番） */
    bigChapterNumber: z.boolean().optional(),
    /** 追記 CSS（テーマ拡張統一） */
    additionalCss: z.string().optional(),
  })
  .strict();

export type KohakuOptions = z.infer<typeof KohakuOptionsSchema>;

function buildOverrideCss(opts: KohakuOptions): string {
  const lines: string[] = [];
  const rootDecls: string[] = [];
  if (opts.accent) rootDecls.push(`--kohaku-accent: ${opts.accent};`);
  if (opts.lineHeight !== undefined) rootDecls.push(`--kohaku-line-height: ${opts.lineHeight};`);
  if (rootDecls.length > 0) {
    lines.push(':root {', ...rootDecls.map((d) => '  ' + d), '}');
  }
  if (opts.bigChapterNumber) {
    lines.push(
      'h1::first-letter { font-size: 2em; font-weight: bold; color: var(--kohaku-accent, #8a5a2b); }',
    );
  }
  if (opts.additionalCss) lines.push(opts.additionalCss);
  return lines.length > 0 ? '\n/* kohaku() user overrides */\n' + lines.join('\n') + '\n' : '';
}

/**
 * Kohaku（琥珀）テーマ — 学術書 / 論文 / リファレンス向け公式テーマ。
 *
 * 設計：
 *   - 本文に明朝（Noto Serif JP）、見出しに明朝太字、参考文献に等幅
 *   - アクセントに琥珀色（橙茶）、引用や脚注のサイドバー
 *   - 行間 1.55 を既定（学術書相当）
 *   - 章番号を h1 の先頭文字として強調するオプション
 *
 * 本格的なフォント同梱や数式タイポは今後のリリースで対応する。
 */
export function kohaku(options: KohakuOptions = {}) {
  const parsed = KohakuOptionsSchema.parse(options);
  return defineTheme({
    name: '@kappan/themes-kohaku',
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
