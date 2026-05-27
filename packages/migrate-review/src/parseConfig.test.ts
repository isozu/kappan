import { describe, expect, it } from 'vitest';
import { parseReviewConfig } from './parseConfig.js';

describe('parseReviewConfig', () => {
  it('maps booktitle to metadata.title', () => {
    const c = parseReviewConfig({ source: 'booktitle: My Book\nbookname: my-book' });
    expect(c.metadata.title).toBe('My Book');
  });

  it('falls back to bookname when booktitle is missing', () => {
    const c = parseReviewConfig({ source: 'bookname: simple-book' });
    expect(c.metadata.title).toBe('simple-book');
  });

  it('uses Untitled when both booktitle and bookname are missing', () => {
    const c = parseReviewConfig({ source: 'language: ja' });
    expect(c.metadata.title).toBe('Untitled');
  });

  it('handles aut as a single string', () => {
    const c = parseReviewConfig({ source: 'booktitle: T\naut: 山田太郎' });
    expect(c.metadata.creator).toEqual([{ name: '山田太郎', role: 'aut' }]);
  });

  it('handles aut as an array', () => {
    const c = parseReviewConfig({
      source: 'booktitle: T\naut: ["A", "B"]',
    });
    expect(c.metadata.creator).toEqual([
      { name: 'A', role: 'aut' },
      { name: 'B', role: 'aut' },
    ]);
  });

  it('merges multiple creator roles in order: aut, edt, trl', () => {
    const c = parseReviewConfig({
      source: `booktitle: T\naut: A\nedt: E\ntrl: T1`,
    });
    expect(c.metadata.creator.map((x) => x.role)).toEqual(['aut', 'edt', 'trl']);
  });

  it('converts ISBN to urn:isbn:* identifier', () => {
    const c = parseReviewConfig({
      source: `booktitle: T\nisbn: "978-4-12345-678-9"`,
    });
    expect(c.metadata.identifier).toBe('urn:isbn:9784123456789');
  });

  it('omits identifier when ISBN is absent', () => {
    const c = parseReviewConfig({ source: 'booktitle: T' });
    expect(c.metadata.identifier).toBeUndefined();
  });

  it('defaults language to ja', () => {
    const c = parseReviewConfig({ source: 'booktitle: T' });
    expect(c.metadata.language).toBe('ja');
  });

  it('lists ignored fields with reasons', () => {
    const c = parseReviewConfig({
      source: `booktitle: T\ntexstyle: foo\nunknown_x: 1`,
    });
    const keys = c.ignoredFields.map((f) => f.key);
    expect(keys).toContain('texstyle');
    expect(keys).toContain('unknown_x');
    const texEntry = c.ignoredFields.find((f) => f.key === 'texstyle');
    expect(texEntry?.reason).toContain('TeX');
  });

  it('transcribes stylesheet: as a theme additionalCss source (M2-B)', () => {
    const c = parseReviewConfig({
      source: `booktitle: T\nstylesheet: custom.css extra.css`,
    });
    // stylesheet はもはや ignored ではなく、stylesheets 配列に転記される
    expect(c.ignoredFields.map((f) => f.key)).not.toContain('stylesheet');
    expect(c.stylesheets).toEqual(['custom.css', 'extra.css']);
  });
});
