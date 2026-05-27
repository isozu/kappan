export type { PluginContext } from './plugin/types.js';

/**
 * Diagnostic — LSP互換の診断情報。
 * バリデータと将来のプラグインが共通の形式で警告・エラーを返すための型。
 */
export interface Diagnostic {
  readonly severity: 'error' | 'warning' | 'info' | 'hint';
  readonly source: string;
  readonly message: string;
  readonly range?: {
    readonly file: string;
    readonly start: { line: number; column: number };
    readonly end: { line: number; column: number };
  };
}

/**
 * 章ファイルのソース表現。front-matter由来のメタデータと本文を持つ。
 */
export interface SourceFile {
  readonly path: string;
  readonly content: string;
  readonly frontmatter: ChapterFrontmatter;
}

export interface ChapterFrontmatter {
  readonly title?: string;
  readonly id?: string;
  readonly next?: string;
}

/**
 * テーマアセットの最小インターフェイス。`getAssets()` のみ。
 * `defineTheme()` API は別途導入する。
 */
export interface ThemeLike {
  readonly name: string;
  readonly version: string;
  getAssets(): Promise<Map<string, Uint8Array>>;
}
