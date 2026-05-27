import { describe, expect, it } from 'vitest';
import { buildContainerXml } from './buildContainerXml.js';

describe('buildContainerXml', () => {
  it('emits a valid container.xml pointing to EPUB/package.opf', () => {
    const xml = buildContainerXml();
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('xmlns="urn:oasis:names:tc:opendocument:xmlns:container"');
    expect(xml).toContain('full-path="EPUB/package.opf"');
    expect(xml).toContain('media-type="application/oebps-package+xml"');
  });

  it('allows custom rootfile path', () => {
    const xml = buildContainerXml('OEBPS/content.opf');
    expect(xml).toContain('full-path="OEBPS/content.opf"');
  });
});
