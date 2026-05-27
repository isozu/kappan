import { create } from 'xmlbuilder2';
import type { Metadata, ManifestEntry, SpineEntry } from './types.js';

/**
 * `EPUB/package.opf` を EPUB 3.3 形式で生成する。
 *
 * メタデータ必須要件を満たす:
 * - dc:identifier, dc:title, dc:language（必須）
 * - dc:creator（role/file-as 属性付き）
 * - dc:date, dcterms:modified
 * - schema:accessibilityFeature/accessMode/accessibilityHazard/accessibilitySummary
 *
 * unique-identifier は dc:identifier の id 属性を参照する。
 */
export function buildPackageOpf(
  metadata: Metadata,
  manifest: readonly ManifestEntry[],
  spine: readonly SpineEntry[],
  pageProgressionDirection?: 'rtl' | 'ltr',
): string {
  const root = create({ version: '1.0', encoding: 'UTF-8' }).ele('package', {
    xmlns: 'http://www.idpf.org/2007/opf',
    version: '3.0',
    'unique-identifier': 'pub-id',
    'xml:lang': metadata.language,
    prefix: 'schema: http://schema.org/',
  });

  // metadata
  const meta = root.ele('metadata', {
    'xmlns:dc': 'http://purl.org/dc/elements/1.1/',
  });

  meta.ele('dc:identifier', { id: 'pub-id' }).txt(metadata.identifier);
  if (metadata.subtitle) {
    // subtitle 指定時は EPUB 3 の title-type refinement で main / subtitle を区別する
    meta.ele('dc:title', { id: 'title-main' }).txt(metadata.title);
    meta.ele('meta', { refines: '#title-main', property: 'title-type' }).txt('main');
    meta.ele('dc:title', { id: 'title-sub' }).txt(metadata.subtitle);
    meta.ele('meta', { refines: '#title-sub', property: 'title-type' }).txt('subtitle');
    meta.ele('meta', { refines: '#title-sub', property: 'display-seq' }).txt('2');
  } else {
    meta.ele('dc:title').txt(metadata.title);
  }
  meta.ele('dc:language').txt(metadata.language);

  for (const [idx, creator] of metadata.creators.entries()) {
    const id = `creator-${idx + 1}`;
    meta.ele('dc:creator', { id }).txt(creator.name);
    meta
      .ele('meta', { refines: `#${id}`, property: 'role', scheme: 'marc:relators' })
      .txt(creator.role);
    if (creator.fileAs) {
      meta.ele('meta', { refines: `#${id}`, property: 'file-as' }).txt(creator.fileAs);
    }
  }

  if (metadata.publisher) {
    meta.ele('dc:publisher').txt(metadata.publisher);
  }

  meta.ele('dc:date').txt(metadata.date);
  meta.ele('meta', { property: 'dcterms:modified' }).txt(metadata.modified);

  // schema.org accessibility metadata
  for (const feature of metadata.accessibility.features) {
    meta.ele('meta', { property: 'schema:accessibilityFeature' }).txt(feature);
  }
  for (const accessMode of metadata.accessibility.accessModes) {
    meta.ele('meta', { property: 'schema:accessMode' }).txt(accessMode);
  }
  for (const hazard of metadata.accessibility.hazards) {
    meta.ele('meta', { property: 'schema:accessibilityHazard' }).txt(hazard);
  }
  meta.ele('meta', { property: 'schema:accessibilitySummary' }).txt(metadata.accessibility.summary);

  // manifest
  const manifestEl = root.ele('manifest');
  for (const item of manifest) {
    const attrs: Record<string, string> = {
      id: item.id,
      href: item.href,
      'media-type': item.mediaType,
    };
    if (item.properties && item.properties.length > 0) {
      attrs['properties'] = item.properties.join(' ');
    }
    manifestEl.ele('item', attrs);
  }

  // spine
  // 縦組み（右綴じ）書籍では page-progression-direction="rtl" を出力する。
  const spineEl = root.ele(
    'spine',
    pageProgressionDirection ? { 'page-progression-direction': pageProgressionDirection } : {},
  );
  for (const entry of spine) {
    spineEl.ele('itemref', {
      idref: entry.idref,
      ...(entry.linear ? {} : { linear: 'no' }),
    });
  }

  return root.end({ prettyPrint: true });
}
