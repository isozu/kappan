import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { mkdtemp, readFile, readdir, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from '@kappan/migrate-review';

/**
 * Migrate→Markdown golden 比較。
 *
 * Re:VIEW プロジェクトを Kappan に変換した直後の `src/*.md` と `kappan.config.ts` を
 * `tests/golden/migrated-{minimal,typical,real-world}-review/` 配下の golden ファイルと
 * 比較する。`migration-report.md` は日時を含むため比較対象外。
 *
 * 更新方法：`UPDATE_MIGRATED_GOLDEN=1 pnpm test` で golden を再生成する。
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const FIXTURES = path.join(ROOT, 'tests', 'fixtures', 'review-projects');
const GOLDEN = path.join(ROOT, 'tests', 'golden');

const SHOULD_UPDATE = process.env['UPDATE_MIGRATED_GOLDEN'] === '1';

interface MigratedFixture {
  readonly name: string;
  readonly source: string;
  readonly goldenDir: string;
}

const fixtures: readonly MigratedFixture[] = [
  {
    name: 'migrated-minimal-review',
    source: path.join(FIXTURES, 'minimal-review'),
    goldenDir: path.join(GOLDEN, 'migrated-minimal-review'),
  },
  {
    name: 'migrated-typical-review',
    source: path.join(FIXTURES, 'typical-review'),
    goldenDir: path.join(GOLDEN, 'migrated-typical-review'),
  },
  {
    name: 'migrated-real-world-review',
    source: path.join(FIXTURES, 'real-world-review'),
    goldenDir: path.join(GOLDEN, 'migrated-real-world-review'),
  },
];

let workDir: string;

beforeAll(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), 'kappan-migrated-golden-'));
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe.each(fixtures)('migrate golden: $name', (fx) => {
  it('produces Markdown chapters and config.ts matching the golden snapshot', async () => {
    const outDir = path.join(workDir, fx.name);
    await migrate({ sourceDir: fx.source, outDir, force: true });

    // 比較対象：kappan.config.ts + src/*.md（migration-report.md は除外）
    const actualEntries = await collectEntries(outDir);

    if (SHOULD_UPDATE) {
      await writeGoldenDir(fx.goldenDir, actualEntries);
      return;
    }

    if (!existsSync(fx.goldenDir) || (await readdir(fx.goldenDir)).length === 0) {
      throw new Error(
        `Golden directory missing or empty: ${fx.goldenDir}\n` +
          `Run with UPDATE_MIGRATED_GOLDEN=1 to generate it.`,
      );
    }

    const goldenEntries = await collectEntries(fx.goldenDir);

    const actualPaths = actualEntries.map((e) => e.relPath).sort();
    const goldenPaths = goldenEntries.map((e) => e.relPath).sort();
    expect(actualPaths, `entry list differs for ${fx.name}`).toEqual(goldenPaths);

    for (const actual of actualEntries) {
      const expected = goldenEntries.find((g) => g.relPath === actual.relPath);
      expect(expected, `golden missing for ${actual.relPath}`).toBeDefined();
      expect(actual.content, `content differs for ${actual.relPath} in ${fx.name}`).toBe(
        expected!.content,
      );
    }
  });
});

interface Entry {
  readonly relPath: string;
  readonly content: string;
}

/**
 * `kappan.config.ts` と `src/*.md` を収集する（migration-report.md と images/ は除外）。
 */
async function collectEntries(dir: string): Promise<Entry[]> {
  const out: Entry[] = [];

  const cfgPath = path.join(dir, 'kappan.config.ts');
  if (existsSync(cfgPath)) {
    out.push({ relPath: 'kappan.config.ts', content: await readFile(cfgPath, 'utf-8') });
  }

  const srcDir = path.join(dir, 'src');
  if (existsSync(srcDir)) {
    const files = (await readdir(srcDir)).filter((f) => f.endsWith('.md')).sort();
    for (const f of files) {
      out.push({
        relPath: `src/${f}`,
        content: await readFile(path.join(srcDir, f), 'utf-8'),
      });
    }
  }

  out.sort((a, b) => a.relPath.localeCompare(b.relPath));
  return out;
}

async function writeGoldenDir(goldenDir: string, entries: readonly Entry[]): Promise<void> {
  await rm(goldenDir, { recursive: true, force: true });
  await mkdir(goldenDir, { recursive: true });
  for (const entry of entries) {
    const target = path.join(goldenDir, entry.relPath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, entry.content);
  }
}
