import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

export interface ReviewProjectLayout {
  /** 入力ディレクトリの絶対パス */
  readonly rootDir: string;
  /** 検出された .re ファイルの絶対パス一覧 */
  readonly reFiles: readonly string[];
  /** images ディレクトリ（存在しない場合は undefined） */
  readonly imagesDir?: string;
  /** 画像ファイル名（拡張子含む）→ 絶対パス のインデックス */
  readonly imageIndex: ReadonlyMap<string, string>;
  /** config.yml の絶対パス（存在しない場合は undefined） */
  readonly configPath?: string;
  /** catalog.yml の絶対パス */
  readonly catalogPath?: string;
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg']);

/**
 * Re:VIEW プロジェクトのレイアウトを検出する。
 *
 * 想定構造：
 *   <root>/
 *   ├── config.yml
 *   ├── catalog.yml
 *   ├── *.re
 *   └── images/
 *       └── *.{png,jpg,...}
 */
export async function walkReviewProject(rootDir: string): Promise<ReviewProjectLayout> {
  const absRoot = path.resolve(rootDir);
  const entries = await readdir(absRoot, { withFileTypes: true });

  const reFiles: string[] = [];
  let imagesDir: string | undefined;
  let configPath: string | undefined;
  let catalogPath: string | undefined;
  const imageIndex = new Map<string, string>();

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue; // 隠しファイル無視
    const full = path.join(absRoot, entry.name);

    if (entry.isFile()) {
      if (entry.name === 'config.yml' || entry.name === 'config.yaml') {
        configPath = full;
      } else if (entry.name === 'catalog.yml' || entry.name === 'catalog.yaml') {
        catalogPath = full;
      } else if (entry.name.endsWith('.re')) {
        reFiles.push(full);
      }
    } else if (entry.isDirectory()) {
      if (entry.name === 'images') {
        imagesDir = full;
        await collectImages(full, full, imageIndex);
      }
    } else if (entry.isSymbolicLink()) {
      // シンボリックリンクは対象がファイル/ディレクトリかで分岐するが、現状は辿らない
      continue;
    }
  }

  reFiles.sort();

  return {
    rootDir: absRoot,
    reFiles,
    ...(imagesDir !== undefined ? { imagesDir } : {}),
    imageIndex,
    ...(configPath !== undefined ? { configPath } : {}),
    ...(catalogPath !== undefined ? { catalogPath } : {}),
  };
}

async function collectImages(
  dir: string,
  baseDir: string,
  index: Map<string, string>,
): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectImages(full, baseDir, index);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (IMAGE_EXTENSIONS.has(ext)) {
        // basename ベースで登録（Re:VIEW 風）。サブディレクトリは無視
        index.set(entry.name, full);
        // 拡張子無しの stem も登録（//image[id] の解決用）
        const stem = entry.name.slice(0, entry.name.length - ext.length);
        if (!index.has(stem)) {
          index.set(stem, full);
        }
      }
    }
  }
}

/**
 * 巨大プロジェクト早期検出ガード（テスト用に expose する）。
 */
export async function isLargeProject(rootDir: string, threshold = 1000): Promise<boolean> {
  let count = 0;
  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry.isFile()) {
        count += 1;
        if (count > threshold) return;
      } else if (entry.isDirectory()) {
        await walk(path.join(dir, entry.name));
      }
    }
  }
  await walk(rootDir);
  return count > threshold;
}

/** @internal stat へのラッパー */
export async function isFile(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.isFile();
  } catch {
    return false;
  }
}
