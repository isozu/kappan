import { describe, expect, it } from 'vitest';
import { buildTemplate } from './init.js';

describe('buildTemplate', () => {
  const ctx = { title: 'My Book', author: 'Author A' };

  it('tech-book template includes Saiun + 5 plugins and images dir', () => {
    const files = buildTemplate('tech-book', ctx);
    const byPath = new Map(files);
    const config = byPath.get('kappan.config.ts')!;
    expect(config).toContain("from '@kappan/themes-saiun'");
    expect(config).toContain('reviewCompat(');
    expect(config).toContain('figureNumbering(');
    expect(config).toContain('kinsoku(');
    expect(config).toContain('ruby(');
    expect(config).toContain('kenten(');
    expect(byPath.has('images/.gitkeep')).toBe(true);
    expect(byPath.has('src/index.md')).toBe(true);
    expect(byPath.has('src/chap01.md')).toBe(true);
  });

  it('novel template uses Mono (Sumi is M2-A) with ruby/kenten/kinsoku', () => {
    const files = buildTemplate('novel', ctx);
    const config = new Map(files).get('kappan.config.ts')!;
    expect(config).toContain("from '@kappan/themes-mono'");
    expect(config).toContain('mono()');
    expect(config).toContain('ruby()');
    expect(config).toContain('kenten()');
    expect(config).toContain('kinsoku()');
    // Sumi / 縦組みが将来扱いであることをコメントで明示
    expect(config).toContain('Sumi');
    expect(config).toContain('vertical-rl');
  });

  it('manual template uses Mono (Hibana is M2-A) with figureNumbering', () => {
    const files = buildTemplate('manual', ctx);
    const config = new Map(files).get('kappan.config.ts')!;
    expect(config).toContain("from '@kappan/themes-mono'");
    expect(config).toContain('figureNumbering()');
    expect(config).toContain('Hibana');
  });

  it('injects title and author into metadata', () => {
    const config = new Map(buildTemplate('tech-book', ctx)).get('kappan.config.ts')!;
    expect(config).toContain('"My Book"');
    expect(config).toContain('"Author A"');
  });

  it('first chapter front-matter chains to chap01 via next', () => {
    const index = new Map(buildTemplate('tech-book', ctx)).get('src/index.md')!;
    expect(index).toContain('next: chap01.md');
    expect(index).toMatch(/^---/);
  });
});
