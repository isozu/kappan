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

export type ChapterKind = 'chapter' | 'frontmatter' | 'backmatter' | 'appendix';

export interface ChapterFrontmatter {
  readonly title?: string;
  readonly id?: string;
  readonly next?: string;
  /**
   * 章の種別。省略時は `chapter` 扱い。
   *   - `chapter`：本文章。`plugin-heading-number` は ChapterRegistry に
   *     `chapterNumber` を採番する
   *   - `frontmatter` / `backmatter` / `appendix`：補助章。採番は別系統
   *     （現段階では採番対象外、将来 appendix の独自採番に拡張する余地を残す）
   */
  readonly kind?: ChapterKind;
  /** 章を「部」(第I部) でグルーピングする際の通し番号。将来用、現状は採番非対応 */
  readonly part?: number;
  /** 部の見出し。`part` を新しく開始する章にのみ書く（連続する章は同じ part を共有） */
  readonly partTitle?: string;
  /**
   * 著者明示の章番号オーバーライド。指定すれば
   * front-matter `id` / `{#chXX}` / spine 順 のいずれよりも優先される。
   */
  readonly chapterNumber?: number;
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
