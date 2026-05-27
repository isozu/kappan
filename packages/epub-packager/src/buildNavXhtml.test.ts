import { describe, expect, it } from 'vitest';
import { buildNavXhtml } from './buildNavXhtml.js';

describe('buildNavXhtml', () => {
  it('emits a valid XHTML5 navigation document', () => {
    const xml = buildNavXhtml(
      [
        { href: 'content/ch01.xhtml', title: '第1章 はじめに' },
        { href: 'content/ch02.xhtml', title: '第2章 設計' },
      ],
      'ja',
    );

    expect(xml).toContain('xmlns="http://www.w3.org/1999/xhtml"');
    expect(xml).toContain('xmlns:epub="http://www.idpf.org/2007/ops"');
    expect(xml).toContain('xml:lang="ja"');
    expect(xml).toContain('epub:type="toc"');
  });

  it('lists all chapters in toc order', () => {
    const xml = buildNavXhtml(
      [
        { href: 'content/ch01.xhtml', title: '第1章' },
        { href: 'content/ch02.xhtml', title: '第2章' },
      ],
      'ja',
    );

    const firstIdx = xml.indexOf('第1章');
    const secondIdx = xml.indexOf('第2章');
    expect(firstIdx).toBeGreaterThan(0);
    expect(secondIdx).toBeGreaterThan(firstIdx);
  });

  it('includes a landmarks navigation when chapters exist', () => {
    const xml = buildNavXhtml([{ href: 'content/ch01.xhtml', title: '第1章' }], 'ja');
    expect(xml).toContain('epub:type="landmarks"');
    expect(xml).toContain('epub:type="bodymatter"');
  });
});
