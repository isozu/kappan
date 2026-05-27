import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { tsImport } from 'tsx/esm/api';
import { KappanConfigSchema, type KappanConfig } from './schema.js';

export interface LoadConfigResult {
  readonly config: KappanConfig;
  readonly configPath: string;
  readonly configDir: string;
}

/**
 * loadConfig — `kappan.config.ts` を tsx 経由でロードし、スキーマ検証して返す。
 *
 * tsx は esbuild ベースの TypeScript ローダーで、ESM ネイティブの動的 import を提供する。
 * Node.js の `--import tsx` フラグなしで `.ts` を読み込める。
 */
export async function loadConfig(configPath: string): Promise<LoadConfigResult> {
  const absolutePath = path.resolve(configPath);
  const configDir = path.dirname(absolutePath);

  const mod = (await tsImport(pathToFileURL(absolutePath).href, import.meta.url)) as {
    default?: unknown;
  };

  if (!mod.default) {
    throw new Error(
      `Configuration file ${configPath} does not have a default export. ` +
        `Use \`export default defineConfig({ ... })\`.`,
    );
  }

  const parsed = KappanConfigSchema.safeParse(mod.default);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid Kappan configuration:\n${issues}`);
  }

  return {
    config: parsed.data,
    configPath: absolutePath,
    configDir,
  };
}
