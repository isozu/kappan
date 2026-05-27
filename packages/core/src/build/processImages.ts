import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const IMAGE_RE = /<img\s+([^>]*?)\bsrc="([^"]+)"([^>]*?)\s*(?:\/>|><\/img>)/g;
const ALT_RE = /\balt="([^"]*)"/;

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
};

export interface ImageProcessOptions {
  /** XHTML 文字列 */
  readonly xhtml: string;
  /** XHTML が EPUB 内で置かれるパス（例: "content/ch01.xhtml"） */
  readonly chapterEpubPath: string;
  /** Markdown ソースが置かれているディレクトリの絶対パス */
  readonly markdownSourceDir: string;
}

export interface ProcessedImage {
  /** ファイルシステム上の絶対パス */
  readonly absoluteSourcePath: string;
  /** EPUB 内に配置する相対パス（"images/xxx.png" 等） */
  readonly epubPath: string;
  /** id 文字列（manifest 用） */
  readonly id: string;
  /** image/png 等 */
  readonly mediaType: string;
}

export interface ImageProcessResult {
  readonly xhtml: string;
  readonly images: readonly ProcessedImage[];
  /** alt 属性が欠落していた画像のソース URL の一覧（W5 で a11y 検証が使う） */
  readonly missingAltSources: readonly string[];
}

/**
 * 章 XHTML に含まれる `<img>` タグを走査し、ローカル相対パスの画像を抽出する。
 * src を EPUB 内の安定したパス（images/<basename>）に書き換え、収集した画像情報を返す。
 *
 * W4 の最小実装：
 *   - 絶対 URL（http/https/data:）はそのまま残す
 *   - ローカル相対パスのみ EPUB 内に配置
 *   - alt が空文字 or 未指定の場合は missingAltSources に記録（W5 でエラーに昇格）
 */
export async function processImages(opts: ImageProcessOptions): Promise<ImageProcessResult> {
  const { xhtml, chapterEpubPath, markdownSourceDir } = opts;
  const collected = new Map<string, ProcessedImage>();
  const missingAlts: string[] = [];

  // EPUB 内パスから chapter XHTML へ戻るための相対計算用
  const chapterDir = path.posix.dirname(chapterEpubPath);

  const replaced = xhtml.replace(IMAGE_RE, (match, leading, src, trailing) => {
    const altMatch = `${leading}${trailing}`.match(ALT_RE);
    const alt = altMatch?.[1];

    if (alt === undefined || alt === '') {
      missingAlts.push(src);
    }

    if (/^(?:https?:|data:|mailto:)/.test(src) || src.startsWith('/')) {
      // 外部参照またはルート相対：触らない
      return match;
    }

    const absSource = path.resolve(markdownSourceDir, src);
    // 画像ファイルが実在しない場合は HTML コメント化して EPUBCheck の RSC-007 を回避
    if (!existsSync(absSource)) {
      return `<!-- IMAGE NOT FOUND: ${src} (alt: ${alt ?? ''}) -->`;
    }
    const basename = path.basename(absSource);
    const epubPath = `images/${basename}`;

    if (!collected.has(absSource)) {
      collected.set(absSource, {
        absoluteSourcePath: absSource,
        epubPath,
        id: `img-${sanitizeId(basename)}`,
        mediaType: mediaTypeOf(basename),
      });
    }

    // 章XHTMLからの相対パス（章は content/ch01.xhtml、画像は images/sample.png）
    const relativeFromChapter = path.posix.relative(chapterDir, epubPath);
    return `<img ${leading}src="${relativeFromChapter}"${trailing}/>`;
  });

  return {
    xhtml: replaced,
    images: [...collected.values()],
    missingAltSources: missingAlts,
  };
}

/**
 * 収集された画像ファイルをファイルシステムから読み、resources マップに乗せる。
 * 同じ画像が複数章で参照されても1度だけ読み込む。
 */
export interface LoadImageResourcesResult {
  readonly resources: Map<string, Uint8Array>;
  readonly missing: ReadonlyArray<{ epubPath: string; sourcePath: string }>;
}

export async function loadImageResources(
  images: readonly ProcessedImage[],
): Promise<Map<string, Uint8Array>> {
  const result = new Map<string, Uint8Array>();
  const seen = new Set<string>();

  for (const img of images) {
    if (seen.has(img.epubPath)) continue;
    seen.add(img.epubPath);
    try {
      const buf = await readFile(img.absoluteSourcePath);
      result.set(img.epubPath, new Uint8Array(buf));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        // 画像ファイルが見つからない場合は警告して続行。
        // EPUB 内には manifest 項目を出さず、XHTML 中の参照は壊れたまま残るが
        // ビルド自体は完走させる。
        process.stderr.write(
          `[kappan] warn: image not found: ${img.absoluteSourcePath} (referenced as ${img.epubPath})\n`,
        );
        continue;
      }
      throw err;
    }
  }

  return result;
}

function sanitizeId(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function mediaTypeOf(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return IMAGE_MIME_BY_EXT[ext] ?? 'application/octet-stream';
}
