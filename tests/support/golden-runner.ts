import { readdir, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { expect } from 'vitest';
import { extractEpub, type ExtractedEntry } from './epub-extractor.js';
import { normalizeEntries } from './normalizer.js';

/**
 * 環境変数 UPDATE_GOLDEN または vitest の `-u` フラグで golden を更新する。
 * vitest は -u フラグを SNAPSHOT_UPDATE などで認識するが、独自比較なのでここでは
 * 環境変数のみを採用する。`pnpm test:update-golden` で UPDATE_GOLDEN=1 を立てる運用。
 */
const SHOULD_UPDATE = process.env['UPDATE_GOLDEN'] === '1';

export interface GoldenCompareOptions {
  /** 生成済み EPUB のパス */
  readonly epubPath: string;
  /** golden ファイルを置くディレクトリ（フィクスチャごとに1つ） */
  readonly goldenDir: string;
}

/**
 * EPUB を展開して golden ファイルと比較する。
 *
 * - 一致 → テスト pass
 * - 不一致 → vitest assertion で失敗（差分が見える）
 * - UPDATE_GOLDEN=1 → golden を上書きしてテスト pass
 *
 * 比較対象：
 *   1. エントリ一覧（パスの集合）
 *   2. 各エントリの内容（テキストは正規化後、バイナリはハッシュ）
 *   3. 圧縮方式（mimetype は store 必須）
 */
export async function compareToGolden(opts: GoldenCompareOptions): Promise<void> {
  const extracted = await extractEpub(opts.epubPath);
  const normalized = normalizeEntries(extracted);

  if (SHOULD_UPDATE) {
    await writeGolden(opts.goldenDir, normalized);
    return;
  }

  if (!existsSync(opts.goldenDir)) {
    throw new Error(
      `Golden directory does not exist: ${opts.goldenDir}\n` +
        `Run with UPDATE_GOLDEN=1 to generate it.`,
    );
  }

  const golden = await readGolden(opts.goldenDir);

  const actualPaths = normalized.map((e) => e.path).sort();
  const goldenPaths = golden.map((e) => e.path).sort();
  expect(actualPaths, 'EPUB entry list differs').toEqual(goldenPaths);

  for (const actual of normalized) {
    const expected = golden.find((g) => g.path === actual.path);
    if (!expected) throw new Error(`Unexpected: ${actual.path}`);

    expect(actual.kind, `kind differs for ${actual.path}`).toBe(expected.kind);
    expect(actual.content, `content differs for ${actual.path}`).toBe(expected.content);
    expect(actual.compressionMethod, `compression differs for ${actual.path}`).toBe(
      expected.compressionMethod,
    );
  }
}

interface GoldenManifestEntry {
  readonly path: string;
  readonly kind: 'text' | 'binary';
  readonly compressionMethod: 'store' | 'deflate';
}

async function writeGolden(goldenDir: string, entries: readonly ExtractedEntry[]): Promise<void> {
  await rm(goldenDir, { recursive: true, force: true });
  await mkdir(goldenDir, { recursive: true });

  const manifestEntries: GoldenManifestEntry[] = [];

  for (const entry of entries) {
    manifestEntries.push({
      path: entry.path,
      kind: entry.kind,
      compressionMethod: entry.compressionMethod,
    });

    const targetPath = path.join(goldenDir, entry.path);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, entry.content);
  }

  // manifest.json でメタデータも保存
  await writeFile(path.join(goldenDir, '_manifest.json'), JSON.stringify(manifestEntries, null, 2));
}

async function readGolden(goldenDir: string): Promise<ExtractedEntry[]> {
  const manifestPath = path.join(goldenDir, '_manifest.json');
  const manifestText = await readFile(manifestPath, 'utf-8');
  const manifest = JSON.parse(manifestText) as GoldenManifestEntry[];

  const entries: ExtractedEntry[] = [];
  for (const item of manifest) {
    const content = await readFile(path.join(goldenDir, item.path), 'utf-8');
    entries.push({
      path: item.path,
      kind: item.kind,
      content,
      compressionMethod: item.compressionMethod,
    });
  }

  entries.sort((a, b) => a.path.localeCompare(b.path));
  return entries;
}

/**
 * フィクスチャディレクトリから *.md ファイルを全て収集する（テスト用ユーティリティ）。
 */
export async function listFixtureFiles(fixtureDir: string): Promise<string[]> {
  async function walk(dir: string, prefix: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.join(prefix, entry.name);
      if (entry.isDirectory()) {
        files.push(...(await walk(fullPath, relPath)));
      } else {
        files.push(relPath);
      }
    }
    return files;
  }
  return walk(fixtureDir, '');
}
