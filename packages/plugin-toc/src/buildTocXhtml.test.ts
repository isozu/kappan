import { describe, expect, it } from 'vitest';
import type { ChapterRecord, SectionRecord } from '@kappan/core';
import { buildTocXhtml } from './buildTocXhtml.js';

function chapterRecord(opts: {
  id: string;
  spineIndex: number;
  chapterNumber?: number;
  displayLabel?: string;
  rawTitle: string;
  numberedTitle?: string;
  sections?: SectionRecord[];
  kind?: 'chapter' | 'frontmatter' | 'backmatter' | 'appendix';
}): ChapterRecord {
  return {
    id: opts.id,
    path: `${opts.id}.md`,
    spineIndex: opts.spineIndex,
    kind: opts.kind ?? 'chapter',
    ...(opts.chapterNumber !== undefined ? { chapterNumber: opts.chapterNumber } : {}),
    displayLabel: opts.displayLabel ?? '',
    rawTitle: opts.rawTitle,
    numberedTitle: opts.numberedTitle ?? opts.rawTitle,
    sections: opts.sections ?? [],
  };
}

describe('buildTocXhtml', () => {
  const stdOpts = {
    title: '目次',
    language: 'ja',
    depth: 1 as const,
    includeNonChapter: false,
    selfId: 'gentoc',
  };

  it('renders a chapter-level TOC with numbered titles', () => {
    const records = [
      chapterRecord({
        id: 'ch01',
        spineIndex: 0,
        chapterNumber: 1,
        displayLabel: '第1章',
        rawTitle: 'はじめに',
        numberedTitle: '第1章　はじめに',
      }),
      chapterRecord({
        id: 'ch02',
        spineIndex: 1,
        chapterNumber: 2,
        displayLabel: '第2章',
        rawTitle: '本論',
        numberedTitle: '第2章　本論',
      }),
    ];
    const xhtml = buildTocXhtml(records, stdOpts);
    expect(xhtml).toContain('<title>目次</title>');
    expect(xhtml).toContain('<h1 class="toc-title">目次</h1>');
    expect(xhtml).toContain('epub:type="toc"');
    expect(xhtml).toContain('role="doc-toc"');
    expect(xhtml).toContain('<a href="ch01.xhtml">第1章　はじめに</a>');
    expect(xhtml).toContain('<a href="ch02.xhtml">第2章　本論</a>');
  });

  it('excludes self id from listing', () => {
    const records = [
      chapterRecord({
        id: 'gentoc',
        spineIndex: 0,
        rawTitle: '目次',
      }),
      chapterRecord({
        id: 'ch01',
        spineIndex: 1,
        chapterNumber: 1,
        rawTitle: 'はじめに',
        numberedTitle: '第1章　はじめに',
      }),
    ];
    const xhtml = buildTocXhtml(records, stdOpts);
    expect(xhtml).not.toContain('<a href="gentoc.xhtml">');
    expect(xhtml).toContain('<a href="ch01.xhtml">');
  });

  it('skips non-chapter kinds by default but includes them when includeNonChapter is true', () => {
    const records = [
      chapterRecord({
        id: 'preface',
        spineIndex: 0,
        kind: 'frontmatter',
        rawTitle: '凡例',
      }),
      chapterRecord({
        id: 'ch01',
        spineIndex: 1,
        chapterNumber: 1,
        rawTitle: 'はじめに',
        numberedTitle: '第1章　はじめに',
      }),
    ];
    const defaultXhtml = buildTocXhtml(records, stdOpts);
    expect(defaultXhtml).not.toContain('preface.xhtml');
    expect(defaultXhtml).toContain('ch01.xhtml');

    const withFront = buildTocXhtml(records, { ...stdOpts, includeNonChapter: true });
    expect(withFront).toContain('<a href="preface.xhtml">凡例</a>');
  });

  it('includes h2 sections when depth >= 2', () => {
    const records = [
      chapterRecord({
        id: 'ch01',
        spineIndex: 0,
        chapterNumber: 1,
        rawTitle: 'はじめに',
        numberedTitle: '第1章　はじめに',
        sections: [
          {
            anchorId: 'ch01-s1',
            level: 2,
            number: '1.1',
            title: '背景',
            numberedTitle: '1.1　背景',
          },
          {
            anchorId: 'ch01-s2',
            level: 3,
            number: '1.1.1',
            title: '詳細',
            numberedTitle: '1.1.1　詳細',
          },
          {
            anchorId: 'ch01-s3',
            level: 2,
            number: '1.2',
            title: '目的',
            numberedTitle: '1.2　目的',
          },
        ],
      }),
    ];
    const xhtml = buildTocXhtml(records, { ...stdOpts, depth: 2 });
    // h2 が出る
    expect(xhtml).toContain('<a href="ch01.xhtml#ch01-s1">1.1　背景</a>');
    expect(xhtml).toContain('<a href="ch01.xhtml#ch01-s3">1.2　目的</a>');
    // depth=2 では h3 はスキップ
    expect(xhtml).not.toContain('ch01-s2');
  });

  it('includes h3 sections when depth = 3', () => {
    const records = [
      chapterRecord({
        id: 'ch01',
        spineIndex: 0,
        chapterNumber: 1,
        rawTitle: 'はじめに',
        numberedTitle: '第1章　はじめに',
        sections: [
          {
            anchorId: 'ch01-s1',
            level: 2,
            number: '1.1',
            title: '背景',
            numberedTitle: '1.1　背景',
          },
          {
            anchorId: 'ch01-s2',
            level: 3,
            number: '1.1.1',
            title: '詳細',
            numberedTitle: '1.1.1　詳細',
          },
        ],
      }),
    ];
    const xhtml = buildTocXhtml(records, { ...stdOpts, depth: 3 });
    expect(xhtml).toContain('<a href="ch01.xhtml#ch01-s1">1.1　背景</a>');
    expect(xhtml).toContain('<a href="ch01.xhtml#ch01-s2">1.1.1　詳細</a>');
  });

  it('escapes HTML special characters in titles', () => {
    const records = [
      chapterRecord({
        id: 'ch01',
        spineIndex: 0,
        chapterNumber: 1,
        rawTitle: 'A & B',
        numberedTitle: '第1章　A & B <test>',
      }),
    ];
    const xhtml = buildTocXhtml(records, stdOpts);
    expect(xhtml).toContain('第1章　A &amp; B &lt;test&gt;');
    expect(xhtml).not.toContain('<test>');
  });
});
