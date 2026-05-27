import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBook, loadConfig } from '@kappan/core';
import { buildTemplate, type InitTemplate } from '../../packages/cli/src/commands/init.js';
import { extractEpub } from '../support/epub-extractor.js';

/**
 * E2E：`kappan init` テンプレート → `buildBook` の通しシナリオ。
 *
 * 各 init テンプレート（tech-book / novel / manual）が生成する kappan.config.ts と
 * Markdown 章で、実際にビルドが通り、EPUB が出力され、診断にエラーが無いことを検証する。
 *
 * EPUBCheck 自体は重い（Java 起動）ため CI の epubcheck ジョブに委ねる。ここでは
 * ビルド成功＋a11y 等の diagnostics エラー 0 件＋EPUB 構造の最低限まで確認する。
 *
 * 重要：テンプレートの config.ts は `@kappan/*` を import するため、ワークスペース
 * ルート配下の一時ディレクトリに展開し、ルート node_modules から解決できるようにする。
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..', '..');

const FIXED_DATE = new Date('2026-01-01T00:00:00Z');
const FIXED_ID = 'urn:uuid:00000000-0000-4000-8000-000000000000';

const templates: readonly InitTemplate[] = ['tech-book', 'novel', 'manual'];

let workRoot: string;

beforeAll(async () => {
  // ルート配下に置くことで生成 config の `@kappan/*` import が解決できる。
  workRoot = await mkdtemp(path.join(ROOT, '.e2e-init-'));
});

afterAll(async () => {
  await rm(workRoot, { recursive: true, force: true });
});

describe.each(templates)('init→build e2e: %s', (template) => {
  it('builds a valid EPUB with no diagnostic errors', async () => {
    const projectDir = path.join(workRoot, template);
    const files = buildTemplate(template, { title: 'E2E Book', author: 'E2E Author' });
    for (const [relPath, content] of files) {
      const abs = path.join(projectDir, relPath);
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, content, 'utf-8');
    }

    const configPath = path.join(projectDir, 'kappan.config.ts');
    const { config, configDir } = await loadConfig(configPath);

    const outputPath = path.join(projectDir, 'dist', `${template}.epub`);
    const result = await buildBook({
      config,
      configDir,
      outputPath,
      now: FIXED_DATE,
      identifierOverride: FIXED_ID,
    });

    expect(existsSync(outputPath), 'EPUB file should be written').toBe(true);

    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errors, `unexpected build errors: ${JSON.stringify(errors)}`).toHaveLength(0);

    // index.md + chap01.md の 2 章が収集されている（front-matter の next で連結）。
    expect(result.chapters).toHaveLength(2);
    expect(result.chapters.map((c) => c.id)).toEqual(['index', 'chap01']);

    // EPUB 構造の最低限：mimetype は非圧縮先頭、OPF・nav・両章が含まれる。
    const entries = await extractEpub(outputPath);
    const byPath = new Map(entries.map((e) => [e.path, e]));

    const mimetype = byPath.get('mimetype');
    expect(mimetype?.content).toBe('application/epub+zip');
    expect(mimetype?.compressionMethod).toBe('store');

    expect(byPath.has('META-INF/container.xml')).toBe(true);
    expect(entries.some((e) => e.path.endsWith('.opf'))).toBe(true);
    expect(byPath.has('EPUB/nav.xhtml')).toBe(true);
    expect(byPath.has('EPUB/content/index.xhtml')).toBe(true);
    expect(byPath.has('EPUB/content/chap01.xhtml')).toBe(true);
  });
});
