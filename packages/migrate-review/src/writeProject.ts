import { mkdir, writeFile, readFile, copyFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { ConvertedConfig } from './parseConfig.js';
import type { ConvertedChapter } from './convertFile.js';

export interface WriteProjectInput {
  readonly targetDir: string;
  readonly config: ConvertedConfig;
  readonly chapters: ReadonlyArray<{
    readonly mdName: string;
    readonly converted: ConvertedChapter;
  }>;
  readonly imagesDir?: string;
  /**
   * `images/` 配下に表紙画像（cover.{jpg,jpeg,png,webp}）が存在する場合のファイル名。
   * 検出時は kappan.config.ts の metadata.coverImage に自動設定する。
   */
  readonly detectedCoverImage?: string;
  /**
   * Re:VIEW の stylesheet: 由来のカスタム CSS（結合済み文字列）。
   * 指定時は kappan.config.ts のテーマを `saiun({ additionalCss })` にして転記する。
   */
  readonly additionalCss?: string;
  readonly report: string;
  /** 既存ディレクトリを上書きするか */
  readonly force: boolean;
  /** ファイルを書き出さない dry-run モード */
  readonly dryRun: boolean;
}

export interface WriteProjectResult {
  readonly imagesCopied: number;
  readonly filesWritten: number;
}

/**
 * 出力ディレクトリに Kappan プロジェクトを書き出す。
 */
export async function writeProject(input: WriteProjectInput): Promise<WriteProjectResult> {
  const { targetDir, dryRun, force } = input;

  if (!dryRun) {
    if (existsSync(targetDir) && !force) {
      throw new Error(
        `Output directory already exists: ${targetDir}\n` +
          `Use --force to overwrite, or specify a different --out.`,
      );
    }
    await mkdir(path.join(targetDir, 'src'), { recursive: true });
  }

  let filesWritten = 0;

  // kappan.config.ts
  const configCode = generateConfigCode(
    input.config,
    input.chapters[0]?.mdName ?? 'index.md',
    input.detectedCoverImage,
    input.additionalCss,
  );
  if (!dryRun) {
    await writeFile(path.join(targetDir, 'kappan.config.ts'), configCode, 'utf-8');
    filesWritten += 1;
  }

  // 章 Markdown
  for (const ch of input.chapters) {
    if (!dryRun) {
      await writeFile(path.join(targetDir, 'src', ch.mdName), ch.converted.markdown, 'utf-8');
      filesWritten += 1;
    }
  }

  // 画像ディレクトリのコピー
  let imagesCopied = 0;
  if (input.imagesDir && !dryRun) {
    const targetImagesDir = path.join(targetDir, 'images');
    await mkdir(targetImagesDir, { recursive: true });
    imagesCopied = await copyDirectory(input.imagesDir, targetImagesDir);
  } else if (input.imagesDir && dryRun) {
    imagesCopied = await countFiles(input.imagesDir);
  }

  // migration-report.md
  if (!dryRun) {
    await writeFile(path.join(targetDir, 'migration-report.md'), input.report, 'utf-8');
    filesWritten += 1;
  }

  return { imagesCopied, filesWritten };
}

function generateConfigCode(
  config: ConvertedConfig,
  entryFile: string,
  detectedCoverImage?: string,
  additionalCss?: string,
): string {
  const meta = config.metadata;
  const creators = meta.creator
    .map(
      (c) =>
        `    { name: ${jsonString(c.name)}, role: ${jsonString(c.role)}${c.fileAs ? `, fileAs: ${jsonString(c.fileAs)}` : ''} }`,
    )
    .join(',\n');

  // 表紙画像：config.coverImage（config.yml の coverimage 由来） >
  //           detectedCoverImage（images/cover.{jpg,png,webp} の自動検出）
  const coverImage = config.coverImage ?? detectedCoverImage;

  // stylesheet: があれば Saiun テーマに additionalCss として転記する。
  const useSaiun = additionalCss !== undefined && additionalCss.length > 0;

  const lines: string[] = [];
  lines.push(`import { defineConfig } from '@kappan/core';`);
  if (useSaiun) {
    lines.push(`import { saiun } from '@kappan/themes-saiun';`);
  } else {
    lines.push(`import { mono } from '@kappan/themes-mono';`);
  }
  lines.push(`import { reviewCompat } from '@kappan/plugin-review-compat';`);
  lines.push(`import { figureNumbering } from '@kappan/plugin-figure-numbering';`);
  lines.push(`import { kinsoku } from '@kappan/plugin-kinsoku';`);
  lines.push('');
  if (useSaiun) {
    // Re:VIEW の stylesheet: 由来 CSS。テンプレートリテラルで転記する。
    lines.push(`// Re:VIEW の stylesheet: から転記したカスタム CSS（M2-B）`);
    lines.push(`const customCss = ${templateLiteral(additionalCss!)};`);
    lines.push('');
  }
  lines.push(`export default defineConfig({`);
  lines.push(`  metadata: {`);
  lines.push(`    title: ${jsonString(meta.title)},`);
  if (meta.subtitle) lines.push(`    subtitle: ${jsonString(meta.subtitle)},`);
  lines.push(`    creator: [\n${creators}\n    ],`);
  lines.push(`    language: ${jsonString(meta.language)},`);
  if (meta.publisher) lines.push(`    publisher: ${jsonString(meta.publisher)},`);
  if (meta.identifier) lines.push(`    identifier: ${jsonString(meta.identifier)},`);
  if (meta.date) lines.push(`    date: ${jsonString(meta.date)},`);
  if (coverImage) lines.push(`    coverImage: ${jsonString(`images/${coverImage}`)},`);
  lines.push(`  },`);
  lines.push(`  source: { entry: 'src/${entryFile}', baseDir: 'src/' },`);
  lines.push(
    `  output: { dir: ${jsonString(config.output.dir)}, filename: ${jsonString(config.output.filename)} },`,
  );
  if (useSaiun) {
    lines.push(`  theme: saiun({ additionalCss: customCss }),`);
  } else {
    lines.push(`  theme: mono(),`);
  }
  lines.push(`  plugins: [reviewCompat(), figureNumbering(), kinsoku()],`);
  lines.push(`});`);
  return lines.join('\n') + '\n';
}

/**
 * CSS 文字列をテンプレートリテラルとして安全に埋め込む。
 * バックティック・`${`・バックスラッシュをエスケープする。
 */
function templateLiteral(s: string): string {
  const escaped = s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
  return '`' + escaped + '`';
}

function jsonString(s: string): string {
  return JSON.stringify(s);
}

async function copyDirectory(src: string, dest: string): Promise<number> {
  let count = 0;
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isFile()) {
      await copyFile(srcPath, destPath);
      count += 1;
    } else if (entry.isDirectory()) {
      await mkdir(destPath, { recursive: true });
      count += await copyDirectory(srcPath, destPath);
    }
  }
  return count;
}

async function countFiles(dir: string): Promise<number> {
  let count = 0;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isFile()) count += 1;
    else if (entry.isDirectory()) count += await countFiles(full);
  }
  return count;
}

/** @internal */
export async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

/** @internal */
export async function _readFileAsText(p: string): Promise<string> {
  return readFile(p, 'utf-8');
}
