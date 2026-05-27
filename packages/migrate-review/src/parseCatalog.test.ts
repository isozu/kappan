import { describe, expect, it } from 'vitest';
import { parseReviewCatalog } from './parseCatalog.js';

describe('parseReviewCatalog', () => {
  it('parses CHAPS-only catalog', () => {
    const c = parseReviewCatalog({
      source: `CHAPS:\n  - chap01.re\n  - chap02.re`,
    });
    expect(c.chapters).toHaveLength(2);
    expect(c.chapters[0]?.originalName).toBe('chap01.re');
    expect(c.chapters[0]?.mdName).toBe('chap01.md');
    expect(c.chapters[0]?.next).toBe('chap02.md');
    expect(c.chapters[1]?.next).toBeUndefined();
  });

  it('handles PREDEF, CHAPS, APPENDIX, POSTDEF in order', () => {
    const c = parseReviewCatalog({
      source: [
        'PREDEF:',
        '  - preface.re',
        'CHAPS:',
        '  - chap01.re',
        'APPENDIX:',
        '  - appendix.re',
        'POSTDEF:',
        '  - colophon.re',
      ].join('\n'),
    });
    expect(c.chapters.map((x) => x.originalName)).toEqual([
      'preface.re',
      'chap01.re',
      'appendix.re',
      'colophon.re',
    ]);
    expect(c.chapters[0]?.section).toBe('PREDEF');
    expect(c.chapters[1]?.section).toBe('CHAPS');
    expect(c.chapters[3]?.section).toBe('POSTDEF');
  });

  it('connects next chain across sections', () => {
    const c = parseReviewCatalog({
      source: [
        'PREDEF:',
        '  - preface.re',
        'CHAPS:',
        '  - chap01.re',
        'POSTDEF:',
        '  - colophon.re',
      ].join('\n'),
    });
    expect(c.chapters[0]?.next).toBe('chap01.md');
    expect(c.chapters[1]?.next).toBe('colophon.md');
    expect(c.chapters[2]?.next).toBeUndefined();
  });

  it('handles single-chapter project', () => {
    const c = parseReviewCatalog({ source: `CHAPS:\n  - only.re` });
    expect(c.chapters).toHaveLength(1);
    expect(c.chapters[0]?.next).toBeUndefined();
  });

  it('reports unknown sections with M2 hint', () => {
    const c = parseReviewCatalog({
      source: `CHAPS:\n  - chap01.re\nOTHER:\n  - other.re`,
    });
    expect(c.ignoredSections.some((s) => s.includes('OTHER'))).toBe(true);
    expect(c.ignoredSections.some((s) => s.includes('M3'))).toBe(true);
    // OTHER は CHAPS にフラット化しないため chap01.re のみ
    expect(c.chapters).toHaveLength(1);
  });

  it('PART without nested titles is treated as a single part (M2-D)', () => {
    const c = parseReviewCatalog({
      source: ['CHAPS:', '  - chap01.re', 'PART:', '  - part-foo.re'].join('\n'),
    });
    // PART 配下の章も含めて順序通り収集される
    expect(c.chapters.map((x) => x.originalName)).toEqual(['chap01.re', 'part-foo.re']);
    // part-foo.re には part=1, partTitle="Part 1" が付与される
    expect(c.chapters[1]?.part).toBe(1);
    expect(c.chapters[1]?.partTitle).toBe('Part 1');
    // 通常の CHAPS 章は part 未設定
    expect(c.chapters[0]?.part).toBeUndefined();
    // PART が ignoredSections に並ばないこと（正規対応のため）
    expect(c.ignoredSections.some((s) => s.startsWith('PART'))).toBe(false);
    expect(c.parts).toHaveLength(1);
    expect(c.parts[0]?.title).toBe('Part 1');
    expect(c.parts[0]?.chapterCount).toBe(1);
  });

  it('handles nested PART (第N部) with part numbers and titles (M2-D)', () => {
    const c = parseReviewCatalog({
      source: [
        'CHAPS:',
        '  - chap01.re',
        'PART:',
        '  第1部:',
        '    - p1a.re',
        '    - p1b.re',
        '  第2部:',
        '    - p2a.re',
      ].join('\n'),
    });
    expect(c.chapters.map((x) => x.originalName)).toEqual([
      'chap01.re',
      'p1a.re',
      'p1b.re',
      'p2a.re',
    ]);
    expect(c.chapters[1]?.part).toBe(1);
    expect(c.chapters[1]?.partTitle).toBe('第1部');
    expect(c.chapters[2]?.part).toBe(1);
    expect(c.chapters[3]?.part).toBe(2);
    expect(c.chapters[3]?.partTitle).toBe('第2部');
    // parts 配列でも各部の章数を保つ
    expect(c.parts.map((p) => [p.number, p.title, p.chapterCount])).toEqual([
      [1, '第1部', 2],
      [2, '第2部', 1],
    ]);
    // PART は M2-D で正規対応のため ignoredSections に並ばない
    expect(c.ignoredSections.some((s) => s.includes('PART'))).toBe(false);
  });

  it('returns empty parts array when no PART present', () => {
    const c = parseReviewCatalog({ source: `CHAPS:\n  - chap01.re` });
    expect(c.parts).toEqual([]);
    expect(c.chapters[0]?.part).toBeUndefined();
  });

  it('numbers chapters starting from 1 in catalog order', () => {
    const c = parseReviewCatalog({
      source: [
        'PREDEF:',
        '  - preface.re',
        'CHAPS:',
        '  - chap01.re',
        '  - chap02.re',
        'POSTDEF:',
        '  - colophon.re',
      ].join('\n'),
    });
    expect(c.chapters.map((x) => x.chapterNumber)).toEqual([1, 2, 3, 4]);
  });

  it('preserves .re → .md extension swap', () => {
    const c = parseReviewCatalog({ source: `CHAPS:\n  - my.chap.re` });
    expect(c.chapters[0]?.mdName).toBe('my.chap.md');
  });

  it('sanitizes id from filename', () => {
    const c = parseReviewCatalog({ source: `CHAPS:\n  - chap_01.re` });
    expect(c.chapters[0]?.id).toBe('chap_01');
  });

  it('returns empty list when no sections present', () => {
    const c = parseReviewCatalog({ source: `# empty catalog\n` });
    expect(c.chapters).toEqual([]);
  });
});
