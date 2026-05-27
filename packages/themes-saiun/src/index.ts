import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineTheme } from '@kappan/core';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ASSETS_DIR = path.resolve(__dirname, '..', 'assets');

const FontStackSchema = z
  .object({
    mincho: z.array(z.string().min(1)).min(1).optional(),
    sans: z.array(z.string().min(1)).min(1).optional(),
    mono: z.array(z.string().min(1)).min(1).optional(),
  })
  .strict();

const SaiunOptionsSchema = z
  .object({
    accent: z
      .string()
      .regex(/^#[0-9a-fA-F]{3,8}$|^rgb|^hsl|^var\(/, 'accent must be a CSS color value')
      .optional(),
    fontStack: FontStackSchema.optional(),
    codeTheme: z.string().min(1).optional(),
    additionalCss: z.string().optional(),
  })
  .strict();

export type SaiunFontStack = z.infer<typeof FontStackSchema>;
export type SaiunOptions = z.infer<typeof SaiunOptionsSchema>;

function quoteFamily(name: string): string {
  // CSS の font-family リスト用にクオートを補う。
  // 単一語のキーワード（serif / sans-serif / monospace / system-ui 等）はクオートしない。
  const bare =
    /^(serif|sans-serif|monospace|system-ui|cursive|fantasy|ui-serif|ui-sans-serif|ui-monospace|ui-rounded|-apple-system|BlinkMacSystemFont)$/;
  if (bare.test(name)) return name;
  // 既にクオート済みは尊重
  if (/^["'].*["']$/.test(name)) return name;
  return `'${name.replace(/'/g, "\\'")}'`;
}

function buildOverrideCss(opts: SaiunOptions): string {
  const lines: string[] = [];
  const rootDecls: string[] = [];
  if (opts.accent) {
    rootDecls.push(`--saiun-accent: ${opts.accent};`);
  }
  if (opts.codeTheme) {
    // shiki theme との協調用カスタムプロパティ。
    // 実際の shiki スタイルは remark-tech 側が当てるので、ここでは命名のみ公開。
    rootDecls.push(`--saiun-code-theme: ${opts.codeTheme};`);
  }
  if (rootDecls.length > 0) {
    lines.push(':root {', ...rootDecls.map((d) => '  ' + d), '}');
  }
  const fs = opts.fontStack;
  if (fs?.mincho) {
    lines.push('body {');
    lines.push(`  font-family: ${fs.mincho.map(quoteFamily).join(', ')}, serif;`);
    lines.push('}');
  }
  if (fs?.sans) {
    const sansList = fs.sans.map(quoteFamily).join(', ');
    lines.push('h1, h2, h3, h4, h5, h6, th {');
    lines.push(`  font-family: ${sansList}, sans-serif;`);
    lines.push('}');
    lines.push('ruby > rt {');
    lines.push(`  font-family: ${sansList}, sans-serif;`);
    lines.push('}');
  }
  if (fs?.mono) {
    lines.push('code, pre, pre code, pre.shiki, pre.shiki code {');
    lines.push(`  font-family: ${fs.mono.map(quoteFamily).join(', ')}, monospace;`);
    lines.push('}');
  }
  if (opts.additionalCss) {
    lines.push(opts.additionalCss);
  }
  return lines.length > 0 ? '\n/* saiun() user overrides */\n' + lines.join('\n') + '\n' : '';
}

/**
 * Saiun（彩雲）テーマ — 技術書・実用書向けの公式テーマ。
 *
 * 「明朝＋サンセリフ、青系アクセント、コードブロックは角丸グレー」。
 * 情報密度と可読性のバランスを重視し、本文は明朝、見出しはサンセリフ、
 * 強調・リンク・見出しに青系アクセントを当てる。
 *
 * 主な拡張点:
 * - `accent`: CSS カスタムプロパティ `--saiun-accent` の上書き
 * - `fontStack.{mincho,sans,mono}`: フォントスタックの差し替え
 * - `codeTheme`: shiki テーマ名（CSS カスタムプロパティ `--saiun-code-theme` で共有）
 * - `additionalCss`: 追記 CSS（各テーマ共通の `additionalCss` API に整理予定）
 */
export function saiun(options: SaiunOptions = {}) {
  const parsed = SaiunOptionsSchema.parse(options);
  return defineTheme({
    name: '@kappan/themes-saiun',
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
