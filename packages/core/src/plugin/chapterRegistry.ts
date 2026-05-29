import type { ChapterFrontmatter, ChapterKind } from '../types.js';

/**
 * 章メタデータ（`PluginContext.chapters` 経由でプラグインに渡る情報）。
 *
 * `collectChapters` が読み取った front-matter とパス情報を spine 順に並べたもの。
 * プラグインは h1 のテキストを再パースせずに、ここから章 ID や種別を知れる。
 */
export interface ChapterMeta {
  /** spine / manifest の id。front-matter の `id` か、ファイル名から自動推定 */
  readonly id: string;
  /** baseDir からの相対パス（例 `ch05.md`） */
  readonly relativePath: string;
  /** spine 上の位置（0 始まり） */
  readonly spineIndex: number;
  /** 章タイトル。front-matter の `title` か、本文の最初の見出しから推定 */
  readonly title: string;
  /** 章ファイルの front-matter（パース済み・読み出し専用） */
  readonly frontmatter: ChapterFrontmatter;
}

/**
 * 採番後の節（h2〜h4）情報。`plugin-toc` などの consumer が目次ツリーを
 * 組み立てる際に参照する。
 */
export interface SectionRecord {
  /** XHTML 上のアンカー id（`<h2 id="...">` の値）。リンク先 href の `#` 以降 */
  readonly anchorId: string;
  /** 見出しレベル（h2/h3/h4） */
  readonly level: 2 | 3 | 4;
  /** "1.1" / "1.1.1" 形式の節番号。採番除外なら undefined */
  readonly number?: string;
  /** 採番プレフィックスを除いた元のタイトル */
  readonly title: string;
  /** "1.1　節タイトル" のような最終表示文字列 */
  readonly numberedTitle: string;
}

/**
 * コラム（`plugin-column` が `:::column[タイトル]{#col:id}` から生成する傍流記事）。
 * `plugin-column` が `onMdastAllChapters` で所属章の `ChapterRecord.columns` に追記し、
 * `plugin-toc` が目次に「コラム」行として描画する。
 */
export interface ColumnRecord {
  /** 参照 id（`[@col:id]` の id）。`{#col:id}` 由来 */
  readonly id: string;
  /** XHTML 上のアンカー id（`<aside id="col-id">` の値）。リンク先 href の `#` 以降 */
  readonly anchorId: string;
  /** コラムのタイトル（`:::column[タイトル]` の `[...]`） */
  readonly title: string;
}

/**
 * 1 章分のレジストリレコード。
 * `plugin-heading-number` が build し、他プラグイン（figure-numbering / toc / nav）が consumer として参照する。
 */
export interface ChapterRecord {
  /** content/<id>.xhtml のファイル名に使われる章 ID */
  readonly id: string;
  /** baseDir からの相対パス */
  readonly path: string;
  /** spine 上の位置（0 始まり） */
  readonly spineIndex: number;
  /** 章種別。`chapter` 以外は採番対象外 */
  readonly kind: ChapterKind;
  /** 「部」のグルーピング番号（将来用） */
  readonly part?: number;
  /** 部の表示タイトル（将来用） */
  readonly partTitle?: string;
  /**
   * 採番された章番号。`kind === 'chapter'` かつ採番除外でないときに値が入る。
   * 採番されない章（前付け、`{-}` 章、appendix の現状）では undefined。
   */
  readonly chapterNumber?: number;
  /** "第5章" "Chapter 5"。未採番なら空文字 */
  readonly displayLabel: string;
  /** タイトル原文（front-matter title か h1 のテキスト） */
  readonly rawTitle: string;
  /** "第5章　DeFiの構造" のような最終表示タイトル。未採番なら rawTitle と同じ */
  readonly numberedTitle: string;
  /** 章内の h2〜h4 の節情報（spine 順） */
  readonly sections: readonly SectionRecord[];
  /**
   * 章内のコラム（出現順）。`plugin-column` が `onMdastAllChapters` で追記する。
   * `plugin-heading-number` が build した時点では未設定（undefined）。
   */
  columns?: readonly ColumnRecord[];
}

/**
 * 全章分のレジストリ。`ctx.cache.get<ChapterRegistry>(CHAPTER_REGISTRY_CACHE_KEY)` で取得する。
 */
export interface ChapterRegistry {
  /** spine 順の全レコード */
  readonly records: readonly ChapterRecord[];
  /** id → record の lookup */
  readonly byId: ReadonlyMap<string, ChapterRecord>;
  /** path → record の lookup */
  readonly byPath: ReadonlyMap<string, ChapterRecord>;
}

/**
 * `ctx.cache` 上のキー。
 * このキーで保存された値は `ChapterRegistry` 型である契約。
 */
export const CHAPTER_REGISTRY_CACHE_KEY = 'kappan:chapter-registry';

/**
 * `ChapterRecord[]` から lookup 付きの `ChapterRegistry` を組み立てるヘルパ。
 */
export function buildChapterRegistry(records: readonly ChapterRecord[]): ChapterRegistry {
  const byId = new Map<string, ChapterRecord>();
  const byPath = new Map<string, ChapterRecord>();
  for (const r of records) {
    byId.set(r.id, r);
    byPath.set(r.path, r);
  }
  return { records, byId, byPath };
}
