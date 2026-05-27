import { describe, expect, it } from 'vitest';
import { parseYaml, YamlParseError } from './parseYaml.js';

describe('parseYaml', () => {
  it('parses simple key: value pairs', () => {
    const out = parseYaml(`bookname: my-book\nlanguage: ja\ndate: 2024-01-01`);
    expect(out).toEqual({ bookname: 'my-book', language: 'ja', date: '2024-01-01' });
  });

  it('parses inline arrays', () => {
    const out = parseYaml(`aut: ["著者A", "著者B"]`);
    expect(out).toEqual({ aut: ['著者A', '著者B'] });
  });

  it('parses multi-line block lists (catalog.yml style)', () => {
    const out = parseYaml(`CHAPS:\n  - chap01.re\n  - chap02.re\n  - chap03.re`);
    expect(out).toEqual({ CHAPS: ['chap01.re', 'chap02.re', 'chap03.re'] });
  });

  it('strips comments and ignores blank lines', () => {
    const out = parseYaml(`# top comment\nbookname: my-book # inline\n\nlanguage: ja`);
    expect(out).toEqual({ bookname: 'my-book', language: 'ja' });
  });

  it('handles quoted values with embedded quotes', () => {
    const out = parseYaml(`booktitle: "My \\"Quoted\\" Book"`);
    expect(out).toEqual({ booktitle: 'My "Quoted" Book' });
  });
});
