import archiver from 'archiver';
import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { buildContainerXml } from './buildContainerXml.js';
import { buildPackageOpf } from './buildPackageOpf.js';
import type { EpubPackage } from './types.js';

export interface PackageEpubOptions {
  readonly pkg: EpubPackage;
  readonly outputPath: string;
}

/**
 * EPUB 3.3 ZIP コンテナを生成して書き出す。
 *
 * EPUB のディレクトリ構造を踏襲:
 *   mimetype             (非圧縮、最初に配置)
 *   META-INF/container.xml
 *   EPUB/package.opf
 *   EPUB/<resources>     (manifest が参照する全リソース)
 *
 * mimetype の非圧縮 (store-only) は EPUB 仕様で必須。
 * 圧縮されると EPUBCheck が "MIMETYPE file is compressed" を出す。
 */
export async function packageEpub(opts: PackageEpubOptions): Promise<void> {
  const { pkg, outputPath } = opts;

  await mkdir(path.dirname(outputPath), { recursive: true });

  return new Promise((resolve, reject) => {
    const output = createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
    archive.on('warning', (err) => {
      if (err.code === 'ENOENT') return;
      reject(err);
    });

    archive.pipe(output);

    // 1. mimetype を非圧縮で最初に
    archive.append('application/epub+zip', {
      name: 'mimetype',
      store: true,
    });

    // 2. META-INF/container.xml
    archive.append(buildContainerXml(), {
      name: 'META-INF/container.xml',
    });

    // 3. EPUB/package.opf
    archive.append(
      buildPackageOpf(pkg.metadata, pkg.manifest, pkg.spine, pkg.pageProgressionDirection),
      {
        name: 'EPUB/package.opf',
      },
    );

    // 4. その他リソース（nav.xhtml を含む）
    for (const [resourcePath, data] of pkg.resources) {
      const name = `EPUB/${resourcePath}`;
      if (typeof data === 'string') {
        archive.append(data, { name });
      } else {
        archive.append(Buffer.from(data), { name });
      }
    }

    void archive.finalize();
  });
}
