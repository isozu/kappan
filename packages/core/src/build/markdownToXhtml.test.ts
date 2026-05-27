import { describe, it, expect } from 'vitest';
import { renderChapter } from './markdownToXhtml.js';

const BASE_OPTS = {
  title: 'Test',
  language: 'ja',
  stylesheetHref: '../styles/theme.css',
} as const;

describe('renderChapter — unsafeHtml: false (default, M0 互換)', () => {
  it('strips raw HTML from output', async () => {
    const md = 'Before\n\n<div class="note">RAW HTML</div>\n\nAfter\n';
    const xhtml = await renderChapter(md, { ...BASE_OPTS, unsafeHtml: false });
    expect(xhtml).not.toContain('<div class="note">');
    expect(xhtml).not.toContain('RAW HTML');
    expect(xhtml).toContain('Before');
    expect(xhtml).toContain('After');
  });

  it('emits XML declaration and html element with xhtml + epub namespaces', async () => {
    const xhtml = await renderChapter('# Hello', { ...BASE_OPTS, unsafeHtml: false });
    expect(xhtml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xhtml).toContain('xmlns="http://www.w3.org/1999/xhtml"');
    expect(xhtml).toContain('xmlns:epub="http://www.idpf.org/2007/ops"');
  });
});

describe('renderChapter — writingMode (M2-A 縦組み)', () => {
  it('adds body kappan-vertical-rl class for vertical-rl (dir="rtl" は付けない)', async () => {
    const xhtml = await renderChapter('# 縦書き\n\n本文です。', {
      ...BASE_OPTS,
      unsafeHtml: false,
      writingMode: 'vertical-rl',
    });
    // dir="rtl" は日本語縦組みには不要かつ有害（天付きが崩れる）なので付けない。
    // ページめくり方向は OPF spine の page-progression-direction="rtl" で制御する。
    expect(xhtml).not.toContain('dir="rtl"');
    expect(xhtml).toContain('class="kappan-vertical-rl"');
  });

  it('adds neither dir nor body class for horizontal-tb (golden 後方互換)', async () => {
    const xhtml = await renderChapter('# 横書き\n\n本文です。', {
      ...BASE_OPTS,
      unsafeHtml: false,
      writingMode: 'horizontal-tb',
    });
    expect(xhtml).not.toContain('dir="rtl"');
    expect(xhtml).not.toContain('kappan-vertical-rl');
  });

  it('omits dir/class when writingMode is unspecified (既定は横組み)', async () => {
    const xhtml = await renderChapter('# 既定', { ...BASE_OPTS, unsafeHtml: false });
    expect(xhtml).not.toContain('dir="rtl"');
    expect(xhtml).not.toContain('kappan-vertical-rl');
    // body は属性なしで出力される（M0 互換）
    expect(xhtml).toMatch(/<body>/);
  });
});

describe('renderChapter — unsafeHtml: "sanitized"', () => {
  it('keeps safe inline HTML elements', async () => {
    const md = 'A <strong>bold</strong> word.\n';
    const xhtml = await renderChapter(md, { ...BASE_OPTS, unsafeHtml: 'sanitized' });
    expect(xhtml).toContain('<strong>bold</strong>');
  });

  it('keeps safe block HTML like <div class="note">', async () => {
    const md = '<div class="note">important</div>\n';
    const xhtml = await renderChapter(md, { ...BASE_OPTS, unsafeHtml: 'sanitized' });
    expect(xhtml).toContain('<div');
    expect(xhtml).toContain('important');
  });

  it('strips <script> tags entirely', async () => {
    const md = 'Before\n\n<script>alert("xss")</script>\n\nAfter\n';
    const xhtml = await renderChapter(md, { ...BASE_OPTS, unsafeHtml: 'sanitized' });
    expect(xhtml).not.toContain('<script');
    expect(xhtml).not.toContain('alert');
  });

  it('strips javascript: hrefs', async () => {
    const md = '<a href="javascript:alert(1)">click</a>\n';
    const xhtml = await renderChapter(md, { ...BASE_OPTS, unsafeHtml: 'sanitized' });
    expect(xhtml).not.toContain('javascript:');
  });
});

describe('renderChapter — unsafeHtml: "trusted"', () => {
  it('passes raw HTML through unchanged', async () => {
    const md = '<div class="custom">trusted markup</div>\n';
    const xhtml = await renderChapter(md, { ...BASE_OPTS, unsafeHtml: 'trusted' });
    expect(xhtml).toContain('<div class="custom">');
    expect(xhtml).toContain('trusted markup');
  });

  it('does NOT strip <script> in trusted mode (user responsibility)', async () => {
    const md = '<script>x</script>\n';
    const xhtml = await renderChapter(md, { ...BASE_OPTS, unsafeHtml: 'trusted' });
    // trusted モードは sanitize しないので生のまま出る
    expect(xhtml).toContain('<script>');
  });
});

describe('renderChapter — GFM footnotes XHTML 化', () => {
  const SOURCE = `本文に脚注 [^a] と [^b] を入れる。

[^a]: 脚注 A の本文。
[^b]: 脚注 B の本文。
`;

  it('wraps footnotes in <aside epub:type="footnotes"> (sanitized mode)', async () => {
    const xhtml = await renderChapter(SOURCE, { ...BASE_OPTS, unsafeHtml: 'sanitized' });
    expect(xhtml).toContain('<aside');
    expect(xhtml).toContain('epub:type="footnotes"');
    expect(xhtml).not.toMatch(/<section[^>]*class="footnotes"/);
  });

  it('wraps footnotes in <aside epub:type="footnotes"> (default false mode)', async () => {
    const xhtml = await renderChapter(SOURCE, { ...BASE_OPTS, unsafeHtml: false });
    expect(xhtml).toContain('<aside');
    expect(xhtml).toContain('epub:type="footnotes"');
  });

  it('annotates each footnote <li> with epub:type="footnote"', async () => {
    const xhtml = await renderChapter(SOURCE, { ...BASE_OPTS, unsafeHtml: false });
    expect(xhtml).toMatch(/<li[^>]*id="user-content-fn-a"[^>]*epub:type="footnote"/);
    expect(xhtml).toMatch(/<li[^>]*id="user-content-fn-b"[^>]*epub:type="footnote"/);
  });

  it('annotates footnote reference <a data-footnote-ref> with epub:type="noteref"', async () => {
    const xhtml = await renderChapter(SOURCE, { ...BASE_OPTS, unsafeHtml: false });
    expect(xhtml).toMatch(/<a[^>]*data-footnote-ref="data-footnote-ref"[^>]*epub:type="noteref"/);
  });

  it('localizes the footnote heading to a visible 「脚注」 label (ja)', async () => {
    const xhtml = await renderChapter(SOURCE, { ...BASE_OPTS, unsafeHtml: false });
    // 見出しは id="footnote-label" を保持しつつ、ラベルは日本語・可視（sr-only を外す）。
    expect(xhtml).toMatch(/<h2[^>]*id="footnote-label"[^>]*>脚注<\/h2>/);
    expect(xhtml).not.toContain('sr-only');
    expect(xhtml).not.toContain('>Footnotes<');
    // 戻りリンクの aria-label も日本語化される。
    expect(xhtml).toContain('aria-label="本文に戻る"');
  });

  it('falls back to the English "Footnotes" label for non-ja languages', async () => {
    const xhtml = await renderChapter(SOURCE, {
      ...BASE_OPTS,
      language: 'en',
      unsafeHtml: false,
    });
    expect(xhtml).toMatch(/<h2[^>]*id="footnote-label"[^>]*>Footnotes<\/h2>/);
  });

  it('keeps data-footnote-ref attributes XHTML-valued (not value-less)', async () => {
    const xhtml = await renderChapter(SOURCE, { ...BASE_OPTS, unsafeHtml: false });
    // value-less data 属性は XHTML パーサで invalid。XML 互換の値付きに正規化される
    expect(xhtml).toMatch(/data-footnote-ref="data-footnote-ref"/);
    expect(xhtml).not.toMatch(/\sdata-footnote-ref(\s|>)/);
  });
});
