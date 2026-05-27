import type { ExtractedEntry } from './epub-extractor.js';

/**
 * 実行毎に変動する要素（UUID、タイムスタンプ）を golden ファイルとの比較が成立するよう
 * 固定値に正規化する。
 *
 * RDD §11.2「正規化フィルタで除去する」を具体化。
 *
 * 正規化対象（buildBook の now/identifierOverride で固定できなかった場合の保険として）:
 *   - urn:uuid:XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX  →  urn:uuid:00000000-0000-0000-0000-000000000000
 *   - ISO8601 タイムスタンプ                           →  2026-01-01T00:00:00Z
 *   - ISO8601 日付                                   →  2026-01-01
 */
const UUID_RE = /urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const ISO_DATETIME_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g;
const ISO_DATE_INSIDE_TAGS_RE = /(<dc:date>)\d{4}-\d{2}-\d{2}(<\/dc:date>)/g;

const STABLE_UUID = 'urn:uuid:00000000-0000-0000-0000-000000000000';
const STABLE_DATETIME = '2026-01-01T00:00:00Z';
const STABLE_DATE = '2026-01-01';

export function normalizeText(content: string): string {
  return content
    .replace(UUID_RE, STABLE_UUID)
    .replace(ISO_DATETIME_RE, STABLE_DATETIME)
    .replace(ISO_DATE_INSIDE_TAGS_RE, `$1${STABLE_DATE}$2`);
}

/**
 * extractEpub の出力に正規化を適用したエントリリストを返す。
 */
export function normalizeEntries(entries: readonly ExtractedEntry[]): ExtractedEntry[] {
  return entries.map((entry) =>
    entry.kind === 'text' ? { ...entry, content: normalizeText(entry.content) } : entry,
  );
}
