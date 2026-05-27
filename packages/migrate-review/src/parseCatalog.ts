import { sanitizeXmlId } from '@kappan/plugin-review-compat';
import { parseYaml, type YamlValue } from './parseYaml.js';

export interface ReviewCatalogInput {
  readonly source: string;
  readonly path?: string;
}

export interface ChapterEntry {
  /** 元の .re ファイル名（catalog.yml に書かれている形） */
  readonly originalName: string;
  /** 変換後の .md ファイル名 */
  readonly mdName: string;
  /** 章 id（front-matter の id） */
  readonly id: string;
  /** 次の章の .md ファイル名（最終章なら undefined） */
  readonly next?: string;
  /** どのセクションに属するか */
  readonly section: 'PREDEF' | 'CHAPS' | 'APPENDIX' | 'POSTDEF';
  /** catalog 順から自動採番した章番号（1 始まり） */
  readonly chapterNumber: number;
  /**
   * 所属する部の番号（PART 配下の章のみ、1 始まり）。
   * Re:VIEW の `PART:` ネスト構造を保存する。
   */
  readonly part?: number;
  /** 所属する部の名前（例：「第1部」）。未指定の PART には自動生成名 `Part N` を当てる */
  readonly partTitle?: string;
}

export interface ParsedCatalog {
  readonly chapters: readonly ChapterEntry[];
  /**
   * ignored セクション名（未知キー）— 文言は対応状況のいずれかを明示する。
   * PART は ignored ではなく正規変換されるので含まれない。
   */
  readonly ignoredSections: readonly string[];
  /**
   * 検出された部のリスト（PART がなければ空）。番号は 1 始まりで catalog 順を保つ。
   */
  readonly parts: ReadonlyArray<{
    readonly number: number;
    readonly title: string;
    readonly chapterCount: number;
  }>;
}

const KNOWN_SECTIONS = ['PREDEF', 'CHAPS', 'APPENDIX', 'POSTDEF'] as const;

/**
 * Re:VIEW の catalog.yml を読んで、章順序付きの ChapterEntry リストに変換する。
 *
 * PART: が含まれていた場合は、各部の章順を維持しつつ part / partTitle を付与する。
 * PART は正規変換されるので警告は出さない。
 */
export function parseReviewCatalog(input: ReviewCatalogInput): ParsedCatalog {
  const yaml = parseYaml(input.source, input.path ? { path: input.path } : {});
  const ignored: string[] = [];

  // 各セクションの .re ファイル一覧を集める（セクション順を保持）
  interface RawEntry {
    name: string;
    section: ChapterEntry['section'];
    part?: number;
    partTitle?: string;
  }
  const all: RawEntry[] = [];
  for (const section of KNOWN_SECTIONS) {
    const items = yaml[section];
    if (items === undefined || items === null) continue;
    if (!Array.isArray(items)) {
      throw new Error(`catalog.yml: ${section} must be a list`);
    }
    for (const item of items) {
      if (typeof item === 'string') {
        all.push({ name: item, section });
      }
    }
  }

  // PART セクションを正規対応：各部に part 番号と partTitle を付与
  const partsMeta: Array<{ number: number; title: string; chapterCount: number }> = [];
  const partValue = yaml['PART'];
  if (partValue !== undefined && partValue !== null) {
    const grouped = groupPartChapters(partValue);
    let nextPartNumber = 1;
    for (const group of grouped) {
      const partNumber = nextPartNumber++;
      const partTitle = group.title ?? `Part ${partNumber}`;
      for (const name of group.chapters) {
        all.push({ name, section: 'CHAPS', part: partNumber, partTitle });
      }
      partsMeta.push({
        number: partNumber,
        title: partTitle,
        chapterCount: group.chapters.length,
      });
    }
  }

  // 未知セクション（PART は上で処理済みなのでスキップ）
  for (const key of Object.keys(yaml)) {
    if (KNOWN_SECTIONS.includes(key as (typeof KNOWN_SECTIONS)[number])) continue;
    if (key === 'PART') continue;
    ignored.push(
      `Unknown catalog section '${key}' — not mapped to Kappan. Full catalog notation coverage is planned for M3.`,
    );
  }

  // ChapterEntry へ変換し、next と chapterNumber を埋める
  const chapters: ChapterEntry[] = all.map((item, idx) => {
    const mdName = item.name.replace(/\.re$/, '.md');
    const id = sanitizeXmlId(mdName.replace(/\.md$/, ''));
    const nextItem = all[idx + 1];
    return {
      originalName: item.name,
      mdName,
      id,
      ...(nextItem ? { next: nextItem.name.replace(/\.re$/, '.md') } : {}),
      section: item.section,
      chapterNumber: idx + 1,
      ...(item.part !== undefined ? { part: item.part } : {}),
      ...(item.partTitle !== undefined ? { partTitle: item.partTitle } : {}),
    };
  });

  return { chapters, ignoredSections: ignored, parts: partsMeta };
}

/**
 * PART: 配下のネスト構造を「部ごとの章リスト」にまとめる。
 *
 * 受理形式：
 *   PART:
 *     第1部:
 *       - chap01.re
 *       - chap02.re
 *     第2部:
 *       - chap03.re
 * もしくは（部タイトル無し、暗黙に 1 つの部にまとめる）：
 *   PART:
 *     - chap01.re
 *     - chap02.re
 *
 * @returns 部ごとの { title, chapters } 配列。title は undefined のとき呼び出し側が
 *   `Part N` を割り当てる。
 */
function groupPartChapters(
  value: YamlValue,
): Array<{ title: string | undefined; chapters: string[] }> {
  if (Array.isArray(value)) {
    const chapters = value.filter((v): v is string => typeof v === 'string');
    return chapters.length > 0 ? [{ title: undefined, chapters }] : [];
  }
  if (value && typeof value === 'object') {
    const out: Array<{ title: string | undefined; chapters: string[] }> = [];
    for (const [title, items] of Object.entries(value as Record<string, YamlValue>)) {
      if (Array.isArray(items)) {
        const chapters = items.filter((v): v is string => typeof v === 'string');
        if (chapters.length > 0) out.push({ title, chapters });
      } else if (typeof items === 'string') {
        out.push({ title, chapters: [items] });
      }
    }
    return out;
  }
  return [];
}

/** @internal テスト・整合用 */
export function _yamlValue(v: YamlValue): YamlValue {
  return v;
}
