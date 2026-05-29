import { describe, expect, it } from 'vitest';
import { transformReviewSource } from './transform.js';

describe('Re:VIEW inline notations', () => {
  it('converts @<code>{...} to backtick code', () => {
    expect(transformReviewSource('インライン @<code>{const x = 1} を含む。')).toContain(
      '`const x = 1`',
    );
  });

  it('converts @<tt>{...} to backtick code', () => {
    expect(transformReviewSource('@<tt>{file.txt}')).toContain('`file.txt`');
  });

  it('converts @<b>{...} to bold', () => {
    expect(transformReviewSource('@<b>{重要}')).toContain('**重要**');
  });

  it('converts @<strong>{...} to bold', () => {
    expect(transformReviewSource('@<strong>{very}')).toContain('**very**');
  });

  it('converts @<i>{...} to italic', () => {
    expect(transformReviewSource('@<i>{italic}')).toContain('*italic*');
  });

  it('converts @<em>{...} to italic', () => {
    expect(transformReviewSource('@<em>{emphasis}')).toContain('*emphasis*');
  });

  it('converts @<del>{...} to strike-through', () => {
    expect(transformReviewSource('@<del>{deleted}')).toContain('~~deleted~~');
  });

  it('converts @<u>{...} to underline attribute syntax', () => {
    expect(transformReviewSource('@<u>{x}')).toContain('[x]{.underline}');
  });

  it('converts @<kw>{...} to kw attribute syntax', () => {
    expect(transformReviewSource('@<kw>{Kappan}')).toContain('[Kappan]{.kw}');
  });

  it('converts @<ruby>{漢字,かんじ} to pipe ruby', () => {
    expect(transformReviewSource('@<ruby>{活版,かっぱん}')).toContain('{活版|かっぱん}');
  });

  it('converts @<href>{URL,text} to markdown link', () => {
    expect(transformReviewSource('@<href>{https://example.com,公式サイト}')).toContain(
      '[公式サイト](https://example.com)',
    );
  });

  it('converts @<href>{URL} to bare link', () => {
    expect(transformReviewSource('@<href>{https://example.com}')).toContain(
      '[https://example.com](https://example.com)',
    );
  });

  it('converts @<fn>{id} to footnote reference', () => {
    expect(transformReviewSource('@<fn>{note1}')).toContain('[^note1]');
  });

  it('converts @<bou>{text} to kenten attribute syntax', () => {
    expect(transformReviewSource('@<bou>{重要}')).toContain('[重要]{.kenten}');
  });

  it('converts @<tcy>{text} to tcy attribute syntax (vertical-in-horizontal)', () => {
    expect(transformReviewSource('@<tcy>{20}')).toContain('[20]{.tcy}');
  });

  it('converts @<m>{...} to inline code (KaTeX integration in M2)', () => {
    expect(transformReviewSource('数式 @<m>{x^2 + y^2 = z^2} を考える')).toContain(
      '`x^2 + y^2 = z^2`',
    );
  });

  it('accepts @<ami>{text} as plain text (背景塗りは M2)', () => {
    const out = transformReviewSource('@<ami>{強調語}');
    expect(out).toContain('強調語');
    expect(out).not.toContain('REVIEW-UNSUPPORTED');
  });

  it('accepts @<balloon>{text} as plain text (吹き出しは M2)', () => {
    const out = transformReviewSource('@<balloon>{セリフ}');
    expect(out).toContain('セリフ');
    expect(out).not.toContain('REVIEW-UNSUPPORTED');
  });

  it('keeps unsupported inline tags with a warning comment', () => {
    const out = transformReviewSource('@<bogus>{x}');
    expect(out).toContain('REVIEW-UNSUPPORTED');
  });
});

describe('Re:VIEW block notations', () => {
  it('converts //list[id][caption]{ ... //} to fenced code', () => {
    const input = `//list[ex1][サンプル]{
const x = 1;
//}`;
    const out = transformReviewSource(input);
    expect(out).toContain('```');
    expect(out).toContain('const x = 1;');
    expect(out).toContain('**サンプル**');
    expect(out).toContain('list-ex1');
  });

  it('converts //emlist[caption][lang]{ ... //} with language', () => {
    const input = `//emlist[snippet][typescript]{
const x: number = 1;
//}`;
    const out = transformReviewSource(input);
    expect(out).toContain('```typescript');
    expect(out).toContain('const x: number = 1;');
  });

  it('converts //cmd{ ... //} to shell fence', () => {
    const out = transformReviewSource(`//cmd{
ls -la
//}`);
    expect(out).toContain('```shell');
    expect(out).toContain('ls -la');
  });

  it('converts //quote{ ... //} to markdown quote', () => {
    const out = transformReviewSource(`//quote{
引用文
複数行
//}`);
    expect(out).toContain('> 引用文');
    expect(out).toContain('> 複数行');
  });

  it('converts //note{ ... //} to a :::note directive', () => {
    const out = transformReviewSource(`//note{
本文
//}`);
    expect(out).toContain(':::note');
    expect(out).toContain('本文');
    expect(out).toContain(':::');
  });

  it('converts //tip with title to a :::tip[title] directive', () => {
    const out = transformReviewSource(`//tip[ヒント]{
便利
//}`);
    expect(out).toContain(':::tip[ヒント]');
  });

  it('converts //warning to a :::warning directive', () => {
    const out = transformReviewSource(`//warning{
注意
//}`);
    expect(out).toContain(':::warning');
  });

  it('converts //column[caption] to a :::column directive with a #col: id', () => {
    const out = transformReviewSource(`//column[なぜ速いのか]{
コラム本文
//}`);
    expect(out).toContain(':::column[なぜ速いのか]{#col:');
    expect(out).toContain('コラム本文');
  });

  it('converts //image[id][caption] to markdown image with images/ path', () => {
    const out = transformReviewSource('//image[diagram1][システム構成]');
    expect(out).toContain('![システム構成](images/diagram1.png)');
  });

  it('converts //footnote[id][text] to GFM footnote definition', () => {
    const out = transformReviewSource('//footnote[fn1][本文中の補足]');
    expect(out).toContain('[^fn1]: 本文中の補足');
  });

  it('converts ={id} heading to markdown with id attribute', () => {
    expect(transformReviewSource('={ch01} 第1章')).toContain('# 第1章 {#ch01}');
  });

  it('converts =={id} to h2', () => {
    expect(transformReviewSource('=={s1} 節題')).toContain('## 節題 {#s1}');
  });

  it('converts heading without id', () => {
    expect(transformReviewSource('= タイトル')).toContain('# タイトル');
  });

  it('does not transform inline notations inside fenced code', () => {
    const input = '```\n@<code>{x}\n```';
    const out = transformReviewSource(input);
    expect(out).toContain('@<code>{x}');
    expect(out).not.toContain('`x`');
  });

  it('preserves plain markdown unchanged', () => {
    const input = '# 普通の Markdown\n\n本文。';
    expect(transformReviewSource(input)).toBe('# 普通の Markdown\n\n本文。');
  });
});
