#!/usr/bin/env node
/**
 * リーダー互換性マトリクスを README.md に反映する（RDD §11.3、M2-C）。
 *
 * `matrix.json`（ソース・オブ・トゥルース）を読み、README.md 内の
 * `<!-- READER-MATRIX:START -->` 〜 `<!-- READER-MATRIX:END -->` の間を
 * 再生成する。CI（reader-matrix.yml）から四半期に 1 度呼ばれる。
 *
 * 用法:
 *   node --import tsx tests/reader-compatibility/scripts/update-readme.ts \
 *     [--readme README.md] [--matrix tests/reader-compatibility/matrix.json] \
 *     [--results tests/reader-compatibility/results] [--commit]
 *
 * `--results` を渡すと、リーダー実機結果から matrix を更新する余地があるが、
 * M2-C 着地時点では実機ステップが skeleton（if:false）のため、matrix.json を
 * そのまま反映する。実機統合は M3。
 *
 * `--commit` は CI 用フラグ（このスクリプト自身は commit しない。reader-matrix.yml の
 * create-pull-request アクションが差分を拾う）。
 */

import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

const START_MARKER = '<!-- READER-MATRIX:START -->';
const END_MARKER = '<!-- READER-MATRIX:END -->';

interface MatrixRow {
  readonly feature: string;
  readonly cells: readonly string[];
}

interface MatrixScope {
  readonly scope: string;
  readonly label?: string;
  readonly rows: readonly MatrixRow[];
}

interface Matrix {
  readonly updatedAt: string;
  readonly readers: readonly string[];
  readonly scopes: readonly MatrixScope[];
}

interface Args {
  readonly readme: string;
  readonly matrix: string;
  readonly results: string | null;
  readonly commit: boolean;
}

function parseArgs(argv: string[]): Args {
  const args = {
    readme: 'README.md',
    matrix: 'tests/reader-compatibility/matrix.json',
    results: null as string | null,
    commit: false,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--readme') args.readme = argv[++i]!;
    else if (argv[i] === '--matrix') args.matrix = argv[++i]!;
    else if (argv[i] === '--results') args.results = argv[++i]!;
    else if (argv[i] === '--commit') args.commit = true;
  }
  return args;
}

function renderTable(scope: MatrixScope, readers: readonly string[]): string {
  const header = `| 機能 | ${readers.join(' | ')} |`;
  const divider = `| --- | ${readers.map(() => '---').join(' | ')} |`;
  const rows = scope.rows.map((r) => {
    if (r.cells.length !== readers.length) {
      throw new Error(
        `matrix scope "${scope.scope}" row "${r.feature}" has ${r.cells.length} cells but there are ${readers.length} readers`,
      );
    }
    return `| ${r.feature} | ${r.cells.join(' | ')} |`;
  });
  return [header, divider, ...rows].join('\n');
}

function renderBlock(matrix: Matrix): string {
  const scopeLines: string[] = [];
  for (const scope of matrix.scopes) {
    scopeLines.push(
      `### ${scope.label ?? scope.scope}`,
      '',
      renderTable(scope, matrix.readers),
      '',
    );
  }
  const lines = [
    START_MARKER,
    '',
    `_最終更新: ${matrix.updatedAt}。この表は`,
    '`.github/workflows/reader-matrix.yml` が四半期ごとに自動再生成する。`✅` 完全対応 /',
    '`⚠` 部分対応または表示差異 / `❌` 未対応。縦組み（vertical-rl）は M2-A で対応し、',
    'Chromium（Thorium 近似）で構造・レイアウトを自動検証している。実フォントでの最終目視はユーザー領域。_',
    '',
    ...scopeLines,
    END_MARKER,
  ];
  return lines.join('\n');
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const matrixPath = path.resolve(ROOT, args.matrix);
  const readmePath = path.resolve(ROOT, args.readme);

  const matrix = JSON.parse(await readFile(matrixPath, 'utf-8')) as Matrix;

  if (args.results) {
    const resultsPath = path.resolve(ROOT, args.results);
    if (await fileExists(resultsPath)) {
      console.error(
        `[update-readme] results dir found at ${resultsPath}; ` +
          `live reader integration is a M3 skeleton, using matrix.json as the source of truth for now.`,
      );
    }
  }

  const readme = await readFile(readmePath, 'utf-8');
  const block = renderBlock(matrix);

  let next: string;
  const startIdx = readme.indexOf(START_MARKER);
  const endIdx = readme.indexOf(END_MARKER);
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    // 既存ブロックを置換
    next = readme.slice(0, startIdx) + block + readme.slice(endIdx + END_MARKER.length);
  } else {
    throw new Error(
      `README.md does not contain the ${START_MARKER} ... ${END_MARKER} block. ` +
        `Add it under a "## リーダー互換性" heading first.`,
    );
  }

  if (next === readme) {
    console.error('[update-readme] README.md is already up to date; no change.');
    return;
  }

  await writeFile(readmePath, next, 'utf-8');
  console.error(`[update-readme] README.md reader-compatibility matrix regenerated.`);
  if (args.commit) {
    console.error('[update-readme] --commit set: CI workflow will pick up the diff and open a PR.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
