/**
 * EPUB 3.3 パッケージング用の型定義。
 */

export interface Creator {
  readonly name: string;
  readonly role: string;
  readonly fileAs?: string;
}

export interface AccessibilityMeta {
  readonly features: readonly string[];
  readonly hazards: readonly string[];
  readonly accessModes: readonly string[];
  readonly summary: string;
}

export interface Metadata {
  readonly title: string;
  /** サブタイトル（任意）。EPUB 3 の `title-type=subtitle` で別 dc:title として出力される */
  readonly subtitle?: string;
  readonly creators: readonly Creator[];
  readonly language: string;
  readonly publisher?: string;
  readonly identifier: string;
  readonly date: string;
  readonly modified: string;
  readonly accessibility: AccessibilityMeta;
}

/**
 * EPUB manifest 内の1リソース項目。
 */
export interface ManifestEntry {
  /** OPF 内での idref。manifest と spine 双方からこの id で参照する */
  readonly id: string;
  /** EPUB 内の相対パス（EPUB/ 配下からの相対）。例: "content/ch01.xhtml" */
  readonly href: string;
  /** media-type。例: "application/xhtml+xml", "text/css", "image/jpeg" */
  readonly mediaType: string;
  /** EPUB 3.3 で nav に対しては "nav"、cover に対しては "cover-image" など */
  readonly properties?: readonly string[];
}

/**
 * Spine（読み順）の1エントリ。manifest の id を参照する。
 */
export interface SpineEntry {
  readonly idref: string;
  readonly linear: boolean;
}

/**
 * パッケージング入力をひとまとめにした型。
 * `@kappan/core` の buildBook がこれを構築し、packageEpub に渡す。
 */
export interface EpubPackage {
  readonly metadata: Metadata;
  readonly manifest: readonly ManifestEntry[];
  readonly spine: readonly SpineEntry[];
  /** EPUB/ 配下の相対パスをキーとした、生バイト列または UTF-8 テキスト */
  readonly resources: ReadonlyMap<string, Uint8Array | string>;
  /**
   * spine の読み進み方向。縦組み（vertical-rl）の右綴じ書籍で `'rtl'`。
   * 省略時は属性を出力しない（横組みの既定。EPUB 3 では既定 ltr）。
   */
  readonly pageProgressionDirection?: 'rtl' | 'ltr';
}
