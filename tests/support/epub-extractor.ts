import { readFile } from 'node:fs/promises';
import * as unzipper from 'unzipper';

export interface ExtractedEntry {
  readonly path: string;
  /** UTF-8 文字列として解釈可能ならテキスト、バイナリなら 'binary' */
  readonly kind: 'text' | 'binary';
  /** kind === 'text' のときの文字列、'binary' のときは SHA-256 ハッシュ */
  readonly content: string;
  readonly compressionMethod: 'store' | 'deflate';
}

const TEXT_EXTENSIONS = new Set([
  '.xhtml',
  '.xml',
  '.opf',
  '.css',
  '.txt',
  '.html',
  '.svg',
  '.smil',
  '.json',
]);

const TEXT_BARE_NAMES = new Set(['mimetype']);

/**
 * EPUB ファイルを展開し、各エントリを正規化された形で返す。
 * ゴールデンファイル比較で使う中間表現。
 *
 * RDD §11.2「重要な制約」より：
 *   - バイナリ部分は内容比較せずパス + ハッシュ + サイズで比較
 *   - テキストは UTF-8 として読み、正規化処理に渡す
 */
export async function extractEpub(epubPath: string): Promise<ExtractedEntry[]> {
  const buffer = await readFile(epubPath);
  const directory = await unzipper.Open.buffer(buffer);

  const entries: ExtractedEntry[] = [];
  for (const file of directory.files) {
    if (file.type !== 'File') continue;

    const isText = isTextEntry(file.path);
    const content = await file.buffer();

    entries.push({
      path: file.path,
      kind: isText ? 'text' : 'binary',
      content: isText ? content.toString('utf-8') : await hashBinary(content),
      compressionMethod: file.compressionMethod === 0 ? 'store' : 'deflate',
    });
  }

  // 安定した順序で返す（パスでソート）
  entries.sort((a, b) => a.path.localeCompare(b.path));
  return entries;
}

function isTextEntry(filePath: string): boolean {
  if (TEXT_BARE_NAMES.has(filePath)) return true;
  const dotIdx = filePath.lastIndexOf('.');
  if (dotIdx === -1) return false;
  return TEXT_EXTENSIONS.has(filePath.slice(dotIdx).toLowerCase());
}

async function hashBinary(buffer: Buffer): Promise<string> {
  const { createHash } = await import('node:crypto');
  const hash = createHash('sha256').update(buffer).digest('hex');
  return `sha256:${hash}:size=${buffer.byteLength}`;
}
