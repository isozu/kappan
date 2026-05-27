import { z } from 'zod';
import type { ThemeLike } from '../types.js';
import type { PluginDefinition } from '../plugin/types.js';

/**
 * Kappan の設定スキーマ。
 *
 * 主な拡張点：
 *   - `writingMode`: `horizontal-tb` / `vertical-rl`。
 *   - `unsafeHtml`: HTML 埋め込みの許可制。
 *   - `rendition`: 固定レイアウト書籍用。スキーマには optional で置く。
 *   - `additionalCss`: テーマ拡張 CSS（`theme()` オプションとして使用）。
 */

export const CreatorSchema = z.object({
  name: z.string().min(1),
  role: z.string().default('aut'),
  fileAs: z.string().optional(),
});

export const AccessibilitySchema = z.object({
  features: z.array(z.string()).optional(),
  hazards: z.array(z.string()).default(['none']),
  summary: z.string().optional(),
});

export const MetadataSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  creator: z.array(CreatorSchema).min(1),
  language: z.string().default('ja'),
  publisher: z.string().optional(),
  identifier: z
    .string()
    .regex(
      /^urn:(uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|isbn:[0-9]{10,13})$/i,
      {
        message: 'identifier must be a urn:uuid:* or urn:isbn:* string',
      },
    )
    .optional(),
  date: z.string().optional(),
  // 表紙画像。kappan.config.ts からの相対パス（例: 'images/cover.jpg'）。
  // 指定すると EPUB OPF manifest に properties="cover-image" 付きで出力される。
  coverImage: z.string().optional(),
  accessibility: AccessibilitySchema.optional(),
});

export const SourceSchema = z.object({
  entry: z.string().min(1),
  baseDir: z.string().default('src/'),
});

export const OutputSchema = z.object({
  dir: z.string().default('dist/'),
  filename: z.string().default('{title}.epub'),
});

export const ThemeRefSchema: z.ZodType<ThemeLike> = z.custom<ThemeLike>(
  (val) => {
    if (typeof val !== 'object' || val === null) return false;
    const t = val as Partial<ThemeLike>;
    return (
      typeof t.name === 'string' &&
      typeof t.version === 'string' &&
      typeof t.getAssets === 'function'
    );
  },
  { message: 'theme must have { name, version, getAssets() }' },
);

export const PluginRefSchema: z.ZodType<PluginDefinition> = z.custom<PluginDefinition>(
  (val) => {
    if (typeof val !== 'object' || val === null) return false;
    const p = val as Partial<PluginDefinition>;
    return (
      typeof p.name === 'string' &&
      typeof p.version === 'string' &&
      typeof p.kind === 'string' &&
      typeof p.hooks === 'object'
    );
  },
  { message: 'plugin must have { name, version, kind, hooks }' },
);

/**
 * HTML 埋め込み許可制。
 *
 * - `false`（デフォルト）: 一切の生 HTML を出力に含めない。
 * - `'sanitized'`: rehype-sanitize 経由で安全な HTML のみ出力。
 * - `'trusted'`: 入力 HTML を素通し（信頼できるソース専用）。
 */
export const UnsafeHtmlSchema = z
  .union([z.literal(false), z.literal('sanitized'), z.literal('trusted')])
  .default(false);

/**
 * 文書の組み方向。`horizontal-tb`（横組み）または `vertical-rl`（縦組み・右綴じ）。
 */
export const WritingModeSchema = z
  .union([z.literal('horizontal-tb'), z.literal('vertical-rl')])
  .default('horizontal-tb');

/**
 * 固定レイアウト設定。現状は optional として置くのみ。
 */
export const RenditionSchema = z
  .object({
    layout: z.literal('reflowable').or(z.literal('pre-paginated')).default('reflowable'),
    orientation: z.literal('auto').or(z.literal('portrait')).or(z.literal('landscape')).optional(),
    spread: z.literal('auto').or(z.literal('none')).or(z.literal('both')).optional(),
  })
  .optional();

export const KappanConfigSchema = z.object({
  metadata: MetadataSchema,
  source: SourceSchema,
  output: OutputSchema.default({ dir: 'dist/', filename: '{title}.epub' }),
  theme: ThemeRefSchema,
  plugins: z.array(PluginRefSchema).default([]),
  /** HTML 埋め込み許可制（デフォルトは `false`） */
  unsafeHtml: UnsafeHtmlSchema,
  /** 文書の組み方向（`horizontal-tb` / `vertical-rl`） */
  writingMode: WritingModeSchema,
  /** 固定レイアウト書籍 */
  rendition: RenditionSchema,
});

export type KappanConfigInput = z.input<typeof KappanConfigSchema>;
export type KappanConfig = z.output<typeof KappanConfigSchema>;
