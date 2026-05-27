import { create } from 'xmlbuilder2';

/**
 * `META-INF/container.xml` を生成する。
 * EPUB 3.3 では rootfile が `EPUB/package.opf` を指す。
 */
export function buildContainerXml(rootfilePath = 'EPUB/package.opf'): string {
  const doc = create({ version: '1.0', encoding: 'UTF-8' }).ele('container', {
    version: '1.0',
    xmlns: 'urn:oasis:names:tc:opendocument:xmlns:container',
  });
  doc.ele('rootfiles').ele('rootfile', {
    'full-path': rootfilePath,
    'media-type': 'application/oebps-package+xml',
  });
  return doc.end({ prettyPrint: true });
}
