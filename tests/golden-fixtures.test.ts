import { describe, it, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBook, loadConfig } from '@kappan/core';
import { compareToGolden } from './support/golden-runner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

interface Fixture {
  readonly name: string;
  readonly configPath: string;
  readonly goldenDir: string;
}

const fixtures: readonly Fixture[] = [
  {
    name: 'minimal-commonmark',
    configPath: path.join(ROOT, 'tests/fixtures/minimal-commonmark/kappan.config.ts'),
    goldenDir: path.join(ROOT, 'tests/golden/minimal-commonmark'),
  },
  {
    name: 'footnotes-and-html',
    configPath: path.join(ROOT, 'tests/fixtures/footnotes-and-html/kappan.config.ts'),
    goldenDir: path.join(ROOT, 'tests/golden/footnotes-and-html'),
  },
  {
    name: 'tech-book-yokogumi',
    configPath: path.join(ROOT, 'tests/fixtures/tech-book-yokogumi/kappan.config.ts'),
    goldenDir: path.join(ROOT, 'tests/golden/tech-book-yokogumi'),
  },
  // M2-A 縦組みフィクスチャ。
  {
    name: 'novel-tategumi',
    configPath: path.join(ROOT, 'tests/fixtures/novel-tategumi/kappan.config.ts'),
    goldenDir: path.join(ROOT, 'tests/golden/novel-tategumi'),
  },
];

const FIXED_DATE = new Date('2026-01-01T00:00:00Z');

let workDir: string;

beforeAll(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), 'kappan-golden-'));
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe.each(fixtures)('golden fixture: $name', (fixture) => {
  it('matches the golden output', async () => {
    const { config, configDir } = await loadConfig(fixture.configPath);
    const outputPath = path.join(workDir, `${fixture.name}.epub`);

    await buildBook({
      config,
      configDir,
      outputPath,
      now: FIXED_DATE,
    });

    await compareToGolden({
      epubPath: outputPath,
      goldenDir: fixture.goldenDir,
    });
  });
});
