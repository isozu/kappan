import { describe, expect, it } from 'vitest';
import { buildPackageOpf } from './buildPackageOpf.js';
import type { Metadata, ManifestEntry, SpineEntry } from './types.js';

const fixtureMetadata: Metadata = {
  title: 'テスト書籍',
  creators: [{ name: '山田 太郎', role: 'aut', fileAs: 'やまだたろう' }],
  language: 'ja',
  identifier: 'urn:uuid:00000000-0000-0000-0000-000000000000',
  date: '2026-01-01',
  modified: '2026-01-01T00:00:00Z',
  accessibility: {
    features: ['structuralNavigation', 'tableOfContents', 'alternativeText'],
    accessModes: ['textual', 'visual'],
    hazards: ['none'],
    summary: 'すべての見出しと画像にアクセシブルな記述があります。',
  },
};

const fixtureManifest: ManifestEntry[] = [
  { id: 'nav', href: 'nav.xhtml', mediaType: 'application/xhtml+xml', properties: ['nav'] },
  { id: 'ch01', href: 'content/ch01.xhtml', mediaType: 'application/xhtml+xml' },
  { id: 'css', href: 'styles/theme.css', mediaType: 'text/css' },
];

const fixtureSpine: SpineEntry[] = [{ idref: 'ch01', linear: true }];

describe('buildPackageOpf', () => {
  it('emits required EPUB 3.3 root attributes', () => {
    const opf = buildPackageOpf(fixtureMetadata, fixtureManifest, fixtureSpine);
    expect(opf).toContain('<package');
    expect(opf).toContain('version="3.0"');
    expect(opf).toContain('unique-identifier="pub-id"');
    expect(opf).toContain('xml:lang="ja"');
  });

  it('includes required Dublin Core elements with id reference', () => {
    const opf = buildPackageOpf(fixtureMetadata, fixtureManifest, fixtureSpine);
    expect(opf).toContain('<dc:identifier id="pub-id">');
    expect(opf).toContain('urn:uuid:00000000-0000-0000-0000-000000000000');
    expect(opf).toContain('<dc:title>テスト書籍</dc:title>');
    expect(opf).toContain('<dc:language>ja</dc:language>');
  });

  it('emits dcterms:modified as required by EPUB 3', () => {
    const opf = buildPackageOpf(fixtureMetadata, fixtureManifest, fixtureSpine);
    expect(opf).toContain('property="dcterms:modified"');
    expect(opf).toContain('2026-01-01T00:00:00Z');
  });

  it('emits page-progression-direction="rtl" for vertical writing (M2-A)', () => {
    const opf = buildPackageOpf(fixtureMetadata, fixtureManifest, fixtureSpine, 'rtl');
    expect(opf).toContain('<spine page-progression-direction="rtl">');
  });

  it('omits page-progression-direction when undefined (横組み後方互換)', () => {
    const opf = buildPackageOpf(fixtureMetadata, fixtureManifest, fixtureSpine);
    expect(opf).not.toContain('page-progression-direction');
    expect(opf).toContain('<spine>');
  });

  it('emits creator with role and file-as refinements', () => {
    const opf = buildPackageOpf(fixtureMetadata, fixtureManifest, fixtureSpine);
    expect(opf).toContain('<dc:creator id="creator-1">山田 太郎</dc:creator>');
    expect(opf).toContain('property="role"');
    expect(opf).toContain('property="file-as"');
    expect(opf).toContain('やまだたろう');
  });

  it('emits schema.org accessibility metadata', () => {
    const opf = buildPackageOpf(fixtureMetadata, fixtureManifest, fixtureSpine);
    expect(opf).toContain('property="schema:accessibilityFeature"');
    expect(opf).toContain('structuralNavigation');
    expect(opf).toContain('tableOfContents');
    expect(opf).toContain('property="schema:accessMode"');
    expect(opf).toContain('property="schema:accessibilityHazard"');
    expect(opf).toContain('property="schema:accessibilitySummary"');
  });

  it('emits manifest items with properties when set', () => {
    const opf = buildPackageOpf(fixtureMetadata, fixtureManifest, fixtureSpine);
    expect(opf).toMatch(
      /<item id="nav" href="nav.xhtml" media-type="application\/xhtml\+xml" properties="nav"\/>/,
    );
    expect(opf).toContain('<item id="ch01" href="content/ch01.xhtml"');
    expect(opf).toContain('<item id="css" href="styles/theme.css" media-type="text/css"');
  });

  it('emits spine with linear references', () => {
    const opf = buildPackageOpf(fixtureMetadata, fixtureManifest, fixtureSpine);
    expect(opf).toContain('<itemref idref="ch01"/>');
  });
});
