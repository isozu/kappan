import { describe, expect, it } from 'vitest';
import { convertReviewFile } from './convertFile.js';
import type { ChapterEntry } from './parseCatalog.js';

const baseChapter: ChapterEntry = {
  originalName: 'chap01.re',
  mdName: 'chap01.md',
  id: 'chap01',
  next: 'chap02.md',
  section: 'CHAPS',
  chapterNumber: 1,
};

describe('convertReviewFile', () => {
  it('generates front-matter from chapter entry and title from first heading', () => {
    const r = convertReviewFile({
      source: `={intro} はじめに\n\n本文。`,
      chapter: baseChapter,
    });
    expect(r.markdown).toContain('title: はじめに');
    expect(r.markdown).toContain('id: chap01');
    expect(r.markdown).toContain('next: chap02.md');
  });

  it('uses chapter id as title when no heading present', () => {
    const r = convertReviewFile({
      source: `本文だけ。`,
      chapter: baseChapter,
    });
    expect(r.markdown).toContain('title: chap01');
  });

  it('omits next when chapter has no next', () => {
    const { next: _unused, ...withoutNext } = baseChapter;
    void _unused;
    const r = convertReviewFile({
      source: `= 終章`,
      chapter: withoutNext,
    });
    // chapterNumber は必ず含まれ、その直後に front-matter が閉じる
    expect(r.markdown).toMatch(/chapterNumber: 1\n---/);
    expect(r.markdown).not.toContain('next:');
  });

  it('emits chapterNumber from chapter entry', () => {
    const r = convertReviewFile({
      source: `= ch3`,
      chapter: { ...baseChapter, chapterNumber: 3 },
    });
    expect(r.markdown).toContain('chapterNumber: 3');
  });

  it('resolves image extension using imageIndex', () => {
    const idx = new Map<string, string>([
      ['diagram', '/abs/images/diagram.jpg'],
      ['diagram.jpg', '/abs/images/diagram.jpg'],
    ]);
    const r = convertReviewFile({
      source: `= ch\n\n//image[diagram][システム構成]`,
      chapter: baseChapter,
      imageIndex: idx,
    });
    expect(r.markdown).toContain('![システム構成](../images/diagram.jpg)');
  });

  it('collects unsupported notations with line numbers', () => {
    const r = convertReviewFile({
      source: `= ch\n\n本文 @<bogus>{x} と @<other>{y}`,
      chapter: baseChapter,
    });
    expect(r.unsupported.length).toBeGreaterThan(0);
    expect(r.unsupported[0]?.line).toBeGreaterThan(0);
    expect(r.unsupported[0]?.snippet).toContain('REVIEW-UNSUPPORTED');
  });
});
