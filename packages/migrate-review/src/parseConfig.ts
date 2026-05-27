import { parseYaml, type YamlValue } from './parseYaml.js';

export interface ReviewConfigInput {
  readonly source: string;
  readonly path?: string;
}

export interface ConvertedConfig {
  readonly metadata: {
    readonly title: string;
    readonly subtitle?: string;
    readonly creator: ReadonlyArray<{ name: string; role: string; fileAs?: string }>;
    readonly language: string;
    readonly publisher?: string;
    readonly identifier?: string;
    readonly date?: string;
  };
  readonly output: {
    readonly dir: string;
    readonly filename: string;
  };
  readonly source: {
    readonly entry: string;
    readonly baseDir: string;
  };
  /** 表紙画像のファイル名（例：`cover.jpg`）。`images/` 配下を想定 */
  readonly coverImage?: string;
  /**
   * Re:VIEW の `stylesheet:` で指定されたカスタム CSS ファイル名の一覧。
   * `theme(\{ additionalCss \})` 経由で転記される。空配列または undefined なら転記なし。
   */
  readonly stylesheets?: ReadonlyArray<string>;
  /** ユーザー警告に使う、無視されたフィールド一覧 */
  readonly ignoredFields: ReadonlyArray<{ key: string; reason: string }>;
}

const KNOWN_FIELDS = new Set([
  'bookname',
  'booktitle',
  'subtitle',
  'aut',
  'edt',
  'trl',
  'language',
  'date',
  'publisher',
  'isbn',
  'coverimage',
  'stylesheet',
]);

/**
 * 各フィールドを M1 で受理できない理由と、いつ対応するかの 3 段階ライン。
 *
 * - **M1 非対応**：M1 アルファでは扱えないが、Kappan の別経路で代替可能。
 * - **M2 で対応予定**：M2 ベータで実装される機能で受理する予定。
 * - **M3 で対応予定**：M3 RC 以降で対応予定の Re:VIEW 固有機能。
 *
 * 「M1 非対応 / M2 で対応予定 / M3 で対応予定」のいずれかを明示すること。
 */
const IGNORED_REASONS: Record<string, string> = {
  toc_depth: 'Use Kappan automatic TOC generation. Configurable in M2 via output.tocDepth.',
  toc: 'Kappan always generates a TOC. M1 非対応 — output.tocDepth は M2 で対応予定。',
  contact: 'Contact info is not part of EPUB metadata. M1 非対応 — 奥付ページに記載してください。',
  rights: 'M1 非対応 — metadata.identifier または奥付ページで指定してください。M3 で対応予定。',
  prt: 'M1 非対応 — "prt" ロール（印刷者）は M3 で対応予定。M1 では creator ロールに aut/edt/trl のみを受理します。',
  pbl: 'M1 非対応 — "pbl" は publisher フィールドにマッピングしてください。',
  chapter_file:
    'M1 非対応 — Kappan は front-matter の next チェーンで章順序を表現します。M3 で chapter_file 互換を検討予定。',
  texcommand:
    'M1 非対応 — Re:VIEW 固有の TeX コマンド名指定は Kappan では使いません。M3 で対応予定。',
  texdocumentclass: 'M1 非対応 — TeX クラスは Kappan では使いません。M3 で対応予定。',
  texstyle: 'M1 非対応 — TeX スタイルは Kappan では使いません。M3 で対応予定。',
  review_version: 'M1 非対応 — Re:VIEW バージョン宣言は Kappan では不要です。',
  catalogfile:
    'M1 非対応 — Kappan は catalog.yml のパスをコマンドラインで指定します。M3 で対応予定。',
  history:
    'M1 非対応 — 履歴情報は奥付ページに記載してください。M3 で metadata.history として対応予定。',
  rights_url: 'M1 非対応 — ライセンス URL は奥付ページに記載してください。M3 で対応予定。',
  colophon: 'M1 非対応 — Kappan は colophon を通常の章ファイルとして扱います。',
  backcover: 'M1 非対応 — 裏表紙画像は M2 で metadata.backCoverImage として対応予定。',
  cover:
    'M1 非対応 — Re:VIEW 固有の cover 構造は使いません。metadata.coverImage を使ってください。',
  pdfmaker: 'M1 非対応 — PDF 出力は Kappan のスコープ外です。',
  htmlmaker: 'M1 非対応 — HTML 出力は Kappan のスコープ外です。',
  textmaker: 'M1 非対応 — テキスト出力は Kappan のスコープ外です。',
  idgxmlmaker: 'M1 非対応 — InDesign 出力は Kappan のスコープ外です。',
  epubmaker:
    'M1 非対応 — Re:VIEW の epubmaker オプションは Kappan には引き継がれません。kappan.config.ts の output セクションで再設定してください。',
};

/** 未知フィールド向けの汎用 reason — 3 段階表記を明示。 */
const UNKNOWN_FIELD_REASON =
  'M1 非対応 — Kappan の設定にマッピングがありません。Re:VIEW 完全互換は M3 で部分対応予定です。';

/**
 * Re:VIEW の config.yml を読み、Kappan の KappanConfigInput 相当に変換する。
 */
export function parseReviewConfig(input: ReviewConfigInput): ConvertedConfig {
  const yaml = parseYaml(input.source, input.path ? { path: input.path } : {});
  const ignored: Array<{ key: string; reason: string }> = [];

  // booktitle が文字列か {name, file-as} オブジェクトかを判別
  const titleEntry = readNameWithFileAs(yaml['booktitle']);
  const title = titleEntry?.name ?? stringOf(yaml['bookname']) ?? 'Untitled';
  const subtitleEntry = readNameWithFileAs(yaml['subtitle']);

  const language = stringOf(yaml['language']) ?? 'ja';
  const date = stringOf(yaml['date']);
  const publisher = stringOf(yaml['publisher']);

  const creators: Array<{ name: string; role: string; fileAs?: string }> = [];
  pushCreators(yaml['aut'], 'aut', creators);
  pushCreators(yaml['edt'], 'edt', creators);
  pushCreators(yaml['trl'], 'trl', creators);
  if (creators.length === 0) creators.push({ name: 'Unknown', role: 'aut' });

  const isbn = stringOf(yaml['isbn']);
  const identifier = isbn ? `urn:isbn:${isbn.replace(/[-\s]/g, '')}` : undefined;

  const bookname = stringOf(yaml['bookname']) ?? 'book';
  const filename = `${sanitizeFilename(bookname)}.epub`;

  const coverImage = stringOf(yaml['coverimage']);

  // stylesheet:（文字列 or 配列）をテーマ拡張 CSS として転記する。
  const stylesheets = readStringList(yaml['stylesheet']);

  // 未知フィールドの収集
  for (const key of Object.keys(yaml)) {
    if (KNOWN_FIELDS.has(key)) continue;
    ignored.push({
      key,
      reason: IGNORED_REASONS[key] ?? UNKNOWN_FIELD_REASON,
    });
  }

  const metadata = {
    title,
    ...(subtitleEntry?.name ? { subtitle: subtitleEntry.name } : {}),
    creator: creators,
    language,
    ...(publisher !== undefined ? { publisher } : {}),
    ...(identifier !== undefined ? { identifier } : {}),
    ...(date !== undefined ? { date } : {}),
  };

  return {
    metadata,
    output: { dir: 'dist/', filename },
    source: { entry: '', baseDir: 'src/' }, // entry は catalog 解析後に埋まる
    ...(coverImage !== undefined ? { coverImage } : {}),
    ...(stylesheets.length > 0 ? { stylesheets } : {}),
    ignoredFields: ignored,
  };
}

/**
 * `stylesheet:` の値（文字列 / 配列 / 空白区切り文字列）を CSS ファイル名の配列にする。
 */
function readStringList(v: YamlValue | undefined): string[] {
  if (v === undefined || v === null) return [];
  if (typeof v === 'string') {
    // Re:VIEW は空白区切りで複数指定できる
    return v.split(/\s+/).filter((s) => s.length > 0);
  }
  if (Array.isArray(v)) {
    const out: string[] = [];
    for (const item of v) {
      const s = stringOf(item);
      if (s) out.push(s);
    }
    return out;
  }
  return [];
}

/**
 * Re:VIEW の `{name: "...", file-as: "..."}` 形式と単純な文字列の両方を受理する。
 */
function readNameWithFileAs(
  v: YamlValue | undefined,
): { name: string; fileAs?: string } | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'string') return { name: v };
  if (typeof v === 'object' && !Array.isArray(v)) {
    const obj = v as Record<string, YamlValue>;
    const name = stringOf(obj['name']);
    if (!name) return undefined;
    const fileAs = stringOf(obj['file-as']);
    return fileAs ? { name, fileAs } : { name };
  }
  return undefined;
}

function stringOf(v: YamlValue | undefined): string | undefined {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return undefined;
}

function pushCreators(
  v: YamlValue | undefined,
  role: string,
  out: Array<{ name: string; role: string; fileAs?: string }>,
): void {
  if (v === undefined || v === null) return;
  if (typeof v === 'string') {
    out.push({ name: v, role });
    return;
  }
  // 単一オブジェクト：aut: {name: "...", file-as: "..."} 形式
  if (!Array.isArray(v) && typeof v === 'object' && 'name' in (v as object)) {
    const entry = readObjectCreator(v as Record<string, YamlValue>, role);
    if (entry) out.push(entry);
    return;
  }
  if (Array.isArray(v)) {
    for (const item of v) {
      if (typeof item === 'string') {
        out.push({ name: item, role });
      } else if (item && typeof item === 'object' && 'name' in (item as object)) {
        const entry = readObjectCreator(item as Record<string, YamlValue>, role);
        if (entry) out.push(entry);
      }
    }
  }
}

function readObjectCreator(
  obj: Record<string, YamlValue>,
  role: string,
): { name: string; role: string; fileAs?: string } | undefined {
  const name = stringOf(obj['name']);
  if (!name) return undefined;
  // Re:VIEW は file-as キー、JavaScript 慣習は fileAs。両方受理する
  const fileAs = stringOf(obj['file-as']) ?? stringOf(obj['fileAs']);
  return fileAs ? { name, role, fileAs } : { name, role };
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_');
}
