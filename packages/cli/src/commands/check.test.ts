import { describe, expect, it } from 'vitest';
import { runChecks } from './check.js';

/**
 * check のロジック本体（runChecks）を直接検証する。loadConfig / tsImport を経由しないので
 * 高速で、章ソースの健全性検査だけを純粋にテストできる。
 */

interface Ch {
  relativePath: string;
  id: string;
  markdown: string;
}

function ch(relativePath: string, id: string, markdown: string): Ch {
  return { relativePath, id, markdown };
}

describe('runChecks', () => {
  it('passes a clean single chapter', () => {
    const issues = runChecks([ch('index.md', 'index', '# ホーム\n\n本文。')]);
    expect(issues).toEqual([]);
  });

  it('flags missing alt text as an error', () => {
    const issues = runChecks([ch('index.md', 'index', '# ホーム\n\n![](images/x.png)')]);
    const errors = issues.filter((i) => i.severity === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('missing alt text');
  });

  it('accepts images that have alt text', () => {
    const issues = runChecks([ch('index.md', 'index', '# ホーム\n\n![図](images/x.png)')]);
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('warns on broken in-file anchor', () => {
    const issues = runChecks([ch('index.md', 'index', '# ホーム\n\n[link](#ghost)')]);
    expect(issues.some((i) => i.message.includes('internal anchor not found'))).toBe(true);
  });

  it('resolves an in-file anchor defined by a heading id', () => {
    const issues = runChecks([
      ch('index.md', 'index', '# ホーム\n\n## 節A {#sec-a}\n\n[link](#sec-a)'),
    ]);
    expect(issues.filter((i) => i.message.includes('anchor'))).toEqual([]);
  });

  it('resolves a valid cross-chapter anchor', () => {
    const issues = runChecks([
      ch('index.md', 'index', '# ホーム\n\n[次章](two.md#sec-a)'),
      ch('two.md', 'two', '# 第二章\n\n## 節A {#sec-a}\n\n本文。'),
    ]);
    expect(issues.filter((i) => i.message.includes('anchor'))).toEqual([]);
  });

  it('warns when a cross-chapter file is not in the spine', () => {
    const issues = runChecks([ch('index.md', 'index', '# ホーム\n\n[missing](ghost.md)')]);
    expect(issues.some((i) => i.message.includes('linked chapter not in spine'))).toBe(true);
  });

  it('warns when a cross-chapter anchor does not exist', () => {
    const issues = runChecks([
      ch('index.md', 'index', '# ホーム\n\n[次章](two.md#nope)'),
      ch('two.md', 'two', '# 第二章\n\n本文。'),
    ]);
    expect(issues.some((i) => i.message.includes('cross-chapter anchor not found'))).toBe(true);
  });

  it('warns on heading level jump (h1 -> h3)', () => {
    const issues = runChecks([ch('index.md', 'index', '# ホーム\n\n### 飛んだ見出し')]);
    expect(issues.some((i) => i.message.includes('skips a level'))).toBe(true);
  });

  it('warns when there is no h1', () => {
    const issues = runChecks([ch('index.md', 'index', '## 見出しだけ\n\n本文。')]);
    expect(issues.some((i) => i.message.includes('no h1 heading'))).toBe(true);
  });

  it('warns when there are multiple h1 headings', () => {
    const issues = runChecks([ch('index.md', 'index', '# 一\n\n# 二\n\n本文。')]);
    expect(issues.some((i) => i.message.includes('h1 headings'))).toBe(true);
  });

  it('ignores Re:VIEW-style notations and external links', () => {
    const issues = runChecks([
      ch(
        'index.md',
        'index',
        '# ホーム\n\n[外部](https://example.com) と [メール](mailto:a@b.com)。',
      ),
    ]);
    expect(issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(
      issues.filter((i) => i.message.includes('anchor') || i.message.includes('spine')),
    ).toEqual([]);
  });

  it('does not treat fenced code content as headings or images', () => {
    const md = '# ホーム\n\n```\n# not a heading\n![](not-an-image.png)\n```\n';
    const issues = runChecks([ch('index.md', 'index', md)]);
    expect(issues).toEqual([]);
  });
});
