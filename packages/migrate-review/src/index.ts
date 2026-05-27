import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { walkReviewProject } from './walk.js';
import { parseReviewConfig } from './parseConfig.js';
import { parseReviewCatalog, type ChapterEntry } from './parseCatalog.js';
import { convertReviewFile, type ConvertedChapter } from './convertFile.js';
import { writeProject } from './writeProject.js';
import { buildReport } from './report.js';

export interface MigrateOptions {
  /** Re:VIEW プロジェクトのルートディレクトリ */
  readonly sourceDir: string;
  /** 出力先（省略時は `<sourceDir>-kappan`） */
  readonly outDir?: string;
  /** ファイルを書き出さず、結果情報のみ返す */
  readonly dryRun?: boolean;
  /** migration-report.md のみを生成する */
  readonly reportOnly?: boolean;
  /** 既存ディレクトリの上書き */
  readonly force?: boolean;
}

export interface MigrationResult {
  readonly sourceDir: string;
  readonly targetDir: string;
  readonly filesConverted: number;
  readonly imagesCopied: number;
  readonly report: string;
  readonly unsupported: ReadonlyArray<{ file: string; line: number; snippet: string }>;
  readonly ignoredFields: ReadonlyArray<{ key: string; reason: string }>;
}

/**
 * Re:VIEW プロジェクトを Kappan プロジェクトに変換する。
 */
export async function migrate(opts: MigrateOptions): Promise<MigrationResult> {
  const sourceDir = path.resolve(opts.sourceDir);
  const targetDir = path.resolve(opts.outDir ?? `${sourceDir}-kappan`);

  // 1. プロジェクトレイアウト検出
  const layout = await walkReviewProject(sourceDir);
  if (layout.reFiles.length === 0) {
    throw new Error(`No .re files found in ${sourceDir}`);
  }
  if (!layout.catalogPath) {
    throw new Error(`catalog.yml not found in ${sourceDir}`);
  }

  // 2. config.yml の変換
  let convertedConfig;
  if (layout.configPath) {
    const configSource = await readFile(layout.configPath, 'utf-8');
    convertedConfig = parseReviewConfig({ source: configSource, path: layout.configPath });
  } else {
    convertedConfig = parseReviewConfig({ source: '' }); // デフォルト config
  }

  // 3. catalog.yml の解析
  const catalogSource = await readFile(layout.catalogPath, 'utf-8');
  const catalog = parseReviewCatalog({ source: catalogSource, path: layout.catalogPath });

  // 4. 各 .re ファイルを変換
  const reByBasename = new Map<string, string>();
  for (const p of layout.reFiles) reByBasename.set(path.basename(p), p);

  const convertedChapters: Array<{
    chapter: ChapterEntry;
    mdName: string;
    converted: ConvertedChapter;
  }> = [];
  const allUnsupported: Array<{ file: string; line: number; snippet: string }> = [];
  let notationsMatched = 0;

  for (const chapter of catalog.chapters) {
    const reFile = reByBasename.get(chapter.originalName);
    if (!reFile) {
      throw new Error(`catalog.yml references ${chapter.originalName} but the file was not found.`);
    }
    const source = await readFile(reFile, 'utf-8');
    const converted = convertReviewFile({
      source,
      chapter,
      imageIndex: layout.imageIndex,
    });

    convertedChapters.push({ chapter, mdName: chapter.mdName, converted });
    for (const u of converted.unsupported) {
      allUnsupported.push({ file: `src/${chapter.mdName}`, line: u.line, snippet: u.snippet });
    }
    notationsMatched += countMatchedNotations(source);
  }

  // 5. レポート生成
  const report = buildReport({
    sourceDir,
    targetDir,
    filesConverted: convertedChapters.length,
    notationsMatched,
    imagesCopied: layout.imageIndex.size,
    unsupported: allUnsupported,
    ignoredConfigFields: convertedConfig.ignoredFields,
    ignoredSections: catalog.ignoredSections,
    parts: catalog.parts,
    generatedAt: new Date(),
  });

  // 6. 出力
  if (opts.reportOnly) {
    return {
      sourceDir,
      targetDir,
      filesConverted: convertedChapters.length,
      imagesCopied: 0,
      report,
      unsupported: allUnsupported,
      ignoredFields: convertedConfig.ignoredFields,
    };
  }

  const detectedCoverImage = detectCoverImage(layout.imageIndex);

  // stylesheet: のカスタム CSS を読み込み、テーマ拡張 CSS として転記する。
  const additionalCss = await readStylesheets(sourceDir, convertedConfig.stylesheets);

  const writeResult = await writeProject({
    targetDir,
    config: convertedConfig,
    chapters: convertedChapters.map(({ mdName, converted }) => ({ mdName, converted })),
    ...(layout.imagesDir !== undefined ? { imagesDir: layout.imagesDir } : {}),
    ...(detectedCoverImage !== undefined ? { detectedCoverImage } : {}),
    ...(additionalCss !== undefined ? { additionalCss } : {}),
    report,
    force: opts.force ?? false,
    dryRun: opts.dryRun ?? false,
  });

  return {
    sourceDir,
    targetDir,
    filesConverted: convertedChapters.length,
    imagesCopied: writeResult.imagesCopied,
    report,
    unsupported: allUnsupported,
    ignoredFields: convertedConfig.ignoredFields,
  };
}

/**
 * Re:VIEW の stylesheet: で指定された CSS ファイル群を読み込み、結合した CSS 文字列を返す。
 * Re:VIEW では CSS はプロジェクトルートまたは sty/ に置かれることが多い。見つからない
 * ファイルはスキップする。1 つも読めなければ undefined。
 */
async function readStylesheets(
  sourceDir: string,
  stylesheets: ReadonlyArray<string> | undefined,
): Promise<string | undefined> {
  if (!stylesheets || stylesheets.length === 0) return undefined;
  const parts: string[] = [];
  for (const name of stylesheets) {
    const candidates = [
      path.join(sourceDir, name),
      path.join(sourceDir, 'sty', name),
      path.join(sourceDir, 'styles', name),
    ];
    for (const c of candidates) {
      try {
        const css = await readFile(c, 'utf-8');
        parts.push(`/* from ${name} */\n${css.trim()}`);
        break;
      } catch {
        // 次の候補へ
      }
    }
  }
  return parts.length > 0 ? parts.join('\n\n') : undefined;
}

function countMatchedNotations(source: string): number {
  // 簡易カウント：@<...>{...} と //...{...//} の数
  const inline = (source.match(/@<[a-z]+>\{[^}]*\}/g) ?? []).length;
  const block = (source.match(/^\/\/[a-z]+(?:\[[^\]]*\])*/gm) ?? []).length;
  return inline + block;
}

/**
 * images/cover.{jpg,jpeg,png,webp} が存在する場合のファイル名を返す。
 * 見つからなければ undefined。優先順位は jpg → jpeg → png → webp。
 */
function detectCoverImage(imageIndex: ReadonlyMap<string, string>): string | undefined {
  const candidates = ['cover.jpg', 'cover.jpeg', 'cover.png', 'cover.webp'];
  for (const name of candidates) {
    if (imageIndex.has(name)) return name;
  }
  return undefined;
}

export { parseReviewConfig } from './parseConfig.js';
export { parseReviewCatalog } from './parseCatalog.js';
export { walkReviewProject } from './walk.js';
export { convertReviewFile } from './convertFile.js';
export { buildReport } from './report.js';
export type { ChapterEntry } from './parseCatalog.js';
export type { ConvertedConfig } from './parseConfig.js';
export type { ConvertedChapter } from './convertFile.js';
export type { ReviewProjectLayout } from './walk.js';
