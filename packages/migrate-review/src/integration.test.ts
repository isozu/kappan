import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const FIXTURES = path.join(REPO_ROOT, 'tests', 'fixtures', 'review-projects');

const fixtures = [
  {
    name: 'minimal-review',
    expectedChapters: 1,
    expectsImages: false,
    maxUnsupported: 0,
    maxIgnoredConfigFields: 0,
  },
  {
    name: 'typical-review',
    expectedChapters: 4,
    expectsImages: true,
    maxUnsupported: 0,
    maxIgnoredConfigFields: 0,
  },
  {
    name: 'real-world-review',
    expectedChapters: 5,
    expectsImages: true,
    maxUnsupported: 5, // M1-C 受け入れ基準
    maxIgnoredConfigFields: 5,
  },
] as const;

let workDir: string;

beforeAll(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), 'kappan-migrate-int-'));
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe.each(fixtures)('integration: $name', (fx) => {
  let outDir: string;

  it('runs migrate without throwing', async () => {
    outDir = path.join(workDir, fx.name);
    const result = await migrate({
      sourceDir: path.join(FIXTURES, fx.name),
      outDir,
      force: true,
    });
    expect(result.filesConverted).toBe(fx.expectedChapters);
  });

  it('produces expected file structure', async () => {
    expect(existsSync(path.join(outDir, 'kappan.config.ts'))).toBe(true);
    expect(existsSync(path.join(outDir, 'migration-report.md'))).toBe(true);
    expect(existsSync(path.join(outDir, 'src'))).toBe(true);
    const srcFiles = await readdir(path.join(outDir, 'src'));
    expect(srcFiles.length).toBe(fx.expectedChapters);
    if (fx.expectsImages) {
      expect(existsSync(path.join(outDir, 'images'))).toBe(true);
    }
  });

  it('generates a migration report with 3-tier M1/M2/M3 sections', async () => {
    const report = await readFile(path.join(outDir, 'migration-report.md'), 'utf-8');
    expect(report).toContain('# Kappan Migration Report');
    expect(report).toContain('## Summary');
    expect(report).toContain('Files converted:');
    // 3 段階ライン（M2-D で PART 正規対応のため節タイトルが「M1 / M2 で対応した内容」に変更）
    expect(report).toContain('## ✅ M1 / M2 で対応した内容');
    expect(report).toContain('## ⏳ M2 で対応予定');
    expect(report).toContain('## 🔜 M3 で対応予定');
    expect(report).toContain('## Next Steps');
  });

  it('keeps unsupported count within acceptance threshold', async () => {
    const result = await migrate({
      sourceDir: path.join(FIXTURES, fx.name),
      outDir: path.join(workDir, fx.name + '-counts'),
      force: true,
    });
    expect(
      result.unsupported.length,
      `unsupported notations should be ≤ ${fx.maxUnsupported}`,
    ).toBeLessThanOrEqual(fx.maxUnsupported);
    expect(
      result.ignoredFields.length,
      `ignored config fields should be ≤ ${fx.maxIgnoredConfigFields}`,
    ).toBeLessThanOrEqual(fx.maxIgnoredConfigFields);
  });

  it('generated kappan.config.ts includes reviewCompat, figureNumbering, kinsoku plugins', async () => {
    const cfg = await readFile(path.join(outDir, 'kappan.config.ts'), 'utf-8');
    expect(cfg).toContain('@kappan/plugin-review-compat');
    expect(cfg).toContain('@kappan/plugin-figure-numbering');
    expect(cfg).toContain('@kappan/plugin-kinsoku');
    expect(cfg).toMatch(
      /plugins:\s*\[\s*reviewCompat\(\),\s*figureNumbering\(\),\s*kinsoku\(\)\s*\]/,
    );
  });

  it('chapter front-matter contains chapterNumber from catalog order', async () => {
    const srcFiles = (await readdir(path.join(outDir, 'src'))).sort();
    const first = await readFile(path.join(outDir, 'src', srcFiles[0]!), 'utf-8');
    expect(first).toMatch(/chapterNumber:\s*\d+/);
  });

  it('first chapter has front-matter linking to next when applicable', async () => {
    const srcFiles = (await readdir(path.join(outDir, 'src'))).sort();
    const first = await readFile(path.join(outDir, 'src', srcFiles[0]!), 'utf-8');
    expect(first.startsWith('---')).toBe(true);
    if (fx.expectedChapters > 1) {
      expect(first).toContain('next:');
    }
  });

  it('dry-run mode does not write files', async () => {
    const dryOutDir = path.join(workDir, fx.name + '-dry');
    await migrate({
      sourceDir: path.join(FIXTURES, fx.name),
      outDir: dryOutDir,
      dryRun: true,
      force: true,
    });
    expect(existsSync(dryOutDir)).toBe(false);
  });
});

describe('PART section first-class support (M2-D)', () => {
  let synthDir: string;
  let outDir: string;

  beforeAll(async () => {
    synthDir = await mkdtemp(path.join(tmpdir(), 'kappan-part-fx-'));
    const fs = await import('node:fs/promises');
    await fs.writeFile(
      path.join(synthDir, 'config.yml'),
      'bookname: part-book\nbooktitle: PART テスト\n',
    );
    await fs.writeFile(
      path.join(synthDir, 'catalog.yml'),
      [
        'CHAPS:',
        '  - intro.re',
        'PART:',
        '  第1部:',
        '    - p1a.re',
        '    - p1b.re',
        '  第2部:',
        '    - p2a.re',
        '',
      ].join('\n'),
    );
    await fs.writeFile(path.join(synthDir, 'intro.re'), '= 序');
    await fs.writeFile(path.join(synthDir, 'p1a.re'), '= 第1部 章A');
    await fs.writeFile(path.join(synthDir, 'p1b.re'), '= 第1部 章B');
    await fs.writeFile(path.join(synthDir, 'p2a.re'), '= 第2部 章A');
  });

  afterAll(async () => {
    await rm(synthDir, { recursive: true, force: true });
  });

  it('emits part / partTitle in chapter front-matter (M2-D)', async () => {
    outDir = await mkdtemp(path.join(tmpdir(), 'kappan-part-out-'));
    try {
      const result = await migrate({ sourceDir: synthDir, outDir, force: true });
      // すべての章が変換される（PART 配下も含む）
      expect(result.filesConverted).toBe(4);
      // PART 配下の章には part / partTitle が出る
      const p1a = await readFile(path.join(outDir, 'src', 'p1a.md'), 'utf-8');
      expect(p1a).toContain('part: 1');
      expect(p1a).toContain('partTitle: 第1部');
      const p2a = await readFile(path.join(outDir, 'src', 'p2a.md'), 'utf-8');
      expect(p2a).toContain('part: 2');
      expect(p2a).toContain('partTitle: 第2部');
      // 通常 CHAPS の章には part が出ない
      const intro = await readFile(path.join(outDir, 'src', 'intro.md'), 'utf-8');
      expect(intro).not.toMatch(/^part:/m);
      // レポートの「M1 / M2 で対応した内容」に PART 構造が記録される
      const report = await readFile(path.join(outDir, 'migration-report.md'), 'utf-8');
      expect(report).toContain('PART ネスト構造を正規変換');
      expect(report).toContain('第1部');
      expect(report).toContain('第2部');
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });
});

describe('cover image auto-detection', () => {
  let synthDir: string;
  let outDir: string;

  beforeAll(async () => {
    synthDir = await mkdtemp(path.join(tmpdir(), 'kappan-cover-fx-'));
    const fs = await import('node:fs/promises');
    await fs.writeFile(
      path.join(synthDir, 'config.yml'),
      'bookname: cover-book\nbooktitle: 表紙テスト\n',
    );
    await fs.writeFile(path.join(synthDir, 'catalog.yml'), 'CHAPS:\n  - chap01.re\n');
    await fs.writeFile(path.join(synthDir, 'chap01.re'), '= タイトル\n\n本文。');
    await fs.mkdir(path.join(synthDir, 'images'), { recursive: true });
    await fs.writeFile(path.join(synthDir, 'images', 'cover.jpg'), 'fake-jpeg-bytes');
  });

  afterAll(async () => {
    await rm(synthDir, { recursive: true, force: true });
  });

  it('auto-sets metadata.coverImage when images/cover.jpg exists', async () => {
    outDir = await mkdtemp(path.join(tmpdir(), 'kappan-cover-out-'));
    try {
      await migrate({ sourceDir: synthDir, outDir, force: true });
      const cfg = await readFile(path.join(outDir, 'kappan.config.ts'), 'utf-8');
      expect(cfg).toContain('coverImage: "images/cover.jpg"');
    } finally {
      await rm(outDir, { recursive: true, force: true });
    }
  });
});

describe('migrate option semantics', () => {
  it('throws when output directory exists and force is false', async () => {
    const out = path.join(workDir, 'minimal-review'); // already created above
    await expect(
      migrate({
        sourceDir: path.join(FIXTURES, 'minimal-review'),
        outDir: out,
        force: false,
      }),
    ).rejects.toThrow();
  });

  it('throws when no .re files found', async () => {
    const emptyDir = await mkdtemp(path.join(tmpdir(), 'kappan-migrate-empty-'));
    try {
      await expect(migrate({ sourceDir: emptyDir })).rejects.toThrow(/No .re files/);
    } finally {
      await rm(emptyDir, { recursive: true, force: true });
    }
  });

  it('throws when catalog.yml missing', async () => {
    const noCatalogDir = await mkdtemp(path.join(tmpdir(), 'kappan-migrate-nocatalog-'));
    try {
      await (
        await import('node:fs/promises')
      ).writeFile(path.join(noCatalogDir, 'chap01.re'), '= test');
      await expect(migrate({ sourceDir: noCatalogDir })).rejects.toThrow(/catalog.yml/);
    } finally {
      await rm(noCatalogDir, { recursive: true, force: true });
    }
  });
});
