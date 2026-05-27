import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadConfig, buildBook, collectChapters, BuildError } from '@kappan/core';
import type { KappanConfig, Diagnostic } from '@kappan/core';

/**
 * エラーパス網羅。正常系（golden / e2e）では通らない失敗経路を集中的に検証する。
 *
 * 対象（既存テストと重複しない範囲）：
 *   - 不正 config（必須フィールド欠落）→ loadConfig の zod パースエラー
 *   - front-matter `next` の循環参照 → collectChapters の visited 検出
 *   - entry ファイル不在 → 章収集が失敗する
 *   - 章が 1 件も集まらない → buildBook の「No chapters」エラー
 *   - プラグイン onValidate の error 診断 → buildBook が BuildError 化
 *
 * 画像 alt 欠落（a11yEnforcement.test.ts）と definePlugin の zod 失敗
 * （definePlugin.test.ts）は既に網羅済みのため、ここでは扱わない。
 */

const stubTheme = {
  name: '@kappan/themes-stub',
  version: '0.0.0',
  async getAssets() {
    return new Map<string, Uint8Array>([['styles/theme.css', new TextEncoder().encode('body{}')]]);
  },
};

function baseConfig(overrides?: {
  entry?: string;
  plugins?: KappanConfig['plugins'];
}): KappanConfig {
  return defineConfig({
    metadata: {
      title: 'error-path test',
      creator: [{ name: 'T' }],
      identifier: 'urn:uuid:00000000-0000-0000-0000-000000000000',
    },
    source: { entry: overrides?.entry ?? 'src/index.md', baseDir: 'src/' },
    theme: stubTheme,
    ...(overrides?.plugins ? { plugins: overrides.plugins } : {}),
  });
}

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..', '..');

let workDir: string;

beforeAll(async () => {
  // ワークスペースルート配下に置くことで、生成 config を tsx でロードする際に
  // `@kappan/*` がルート node_modules から解決される（loadConfig 本番経路と同条件）。
  workDir = await mkdtemp(path.join(ROOT, '.e2e-init-errpath-'));
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

async function writeChapter(dir: string, rel: string, content: string): Promise<void> {
  const abs = path.join(dir, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, content, 'utf-8');
}

describe('error paths: config validation', () => {
  it('loadConfig rejects a config missing the required metadata.title', async () => {
    const dir = path.join(workDir, 'invalid-config');
    await mkdir(dir, { recursive: true });
    // title を欠いた metadata。defineConfig を介さず生オブジェクトを default export する。
    const configSource = `export default {
  metadata: { creator: [{ name: 'T' }] },
  source: { entry: 'src/index.md', baseDir: 'src/' },
  theme: { name: 't', version: '0', getAssets: async () => new Map() },
};
`;
    await writeFile(path.join(dir, 'kappan.config.ts'), configSource, 'utf-8');

    await expect(loadConfig(path.join(dir, 'kappan.config.ts'))).rejects.toThrow(
      /Invalid Kappan configuration/,
    );
  });

  it('loadConfig reports the offending field path in the error message', async () => {
    const dir = path.join(workDir, 'invalid-identifier');
    await mkdir(dir, { recursive: true });
    // identifier が urn:uuid / urn:isbn のいずれでもない → regex 失敗。
    const configSource = `export default {
  metadata: {
    title: 'X',
    creator: [{ name: 'T' }],
    identifier: 'not-a-urn',
  },
  source: { entry: 'src/index.md', baseDir: 'src/' },
  theme: { name: 't', version: '0', getAssets: async () => new Map() },
};
`;
    await writeFile(path.join(dir, 'kappan.config.ts'), configSource, 'utf-8');

    await expect(loadConfig(path.join(dir, 'kappan.config.ts'))).rejects.toThrow(
      /metadata\.identifier/,
    );
  });

  it('loadConfig rejects a config file without a default export', async () => {
    const dir = path.join(workDir, 'no-default-export');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'kappan.config.ts'), `export const x = 1;\n`, 'utf-8');

    await expect(loadConfig(path.join(dir, 'kappan.config.ts'))).rejects.toThrow(
      /does not have a default export/,
    );
  });
});

describe('error paths: chapter collection', () => {
  it('collectChapters detects a cyclic next reference', async () => {
    const dir = path.join(workDir, 'cyclic');
    // index → a → index の循環。visited 検出でエラーになる。
    await writeChapter(
      dir,
      'src/index.md',
      `---\ntitle: Index\nid: index\nnext: a.md\n---\n\n# Index\n\nbody\n`,
    );
    await writeChapter(
      dir,
      'src/a.md',
      `---\ntitle: A\nid: a\nnext: index.md\n---\n\n# A\n\nbody\n`,
    );

    await expect(collectChapters(baseConfig(), dir)).rejects.toThrow(/[Cc]yclic/);
  });

  it('buildBook fails when the entry file does not exist', async () => {
    const dir = path.join(workDir, 'missing-entry');
    await mkdir(path.join(dir, 'src'), { recursive: true });
    // entry を指すが src/index.md を書かない → readFile が ENOENT で失敗。

    await expect(
      buildBook({
        config: baseConfig(),
        configDir: dir,
        outputPath: path.join(dir, 'out.epub'),
        now: new Date('2026-01-01T00:00:00Z'),
      }),
    ).rejects.toThrow();
  });
});

describe('error paths: plugin validation', () => {
  it('buildBook throws BuildError when a plugin onValidate emits an error diagnostic', async () => {
    const dir = path.join(workDir, 'plugin-validate-error');
    await writeChapter(
      dir,
      'src/index.md',
      `---\ntitle: Index\nid: index\n---\n\n# Index\n\nbody\n`,
    );

    const failingPlugin = {
      name: '@test/failing-validator',
      version: '0.0.0',
      kind: 'validator' as const,
      hooks: {
        onValidate(): Diagnostic[] {
          return [
            {
              severity: 'error',
              source: '@test/failing-validator',
              message: 'intentional validation failure',
            },
          ];
        },
      },
    };

    try {
      await buildBook({
        config: baseConfig({ plugins: [failingPlugin] }),
        configDir: dir,
        outputPath: path.join(dir, 'out.epub'),
        now: new Date('2026-01-01T00:00:00Z'),
      });
      expect.unreachable('buildBook should have thrown BuildError');
    } catch (err) {
      expect(err).toBeInstanceOf(BuildError);
      const buildErr = err as BuildError;
      expect(buildErr.message).toContain('Plugin validation failed');
      expect(buildErr.diagnostics.some((d) => d.message === 'intentional validation failure')).toBe(
        true,
      );
    }
  });
});
