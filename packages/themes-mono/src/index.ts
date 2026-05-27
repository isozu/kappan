import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineTheme } from '@kappan/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ASSETS_DIR = path.resolve(__dirname, '..', 'assets');

/**
 * Mono テーマ — 公式テーマ。装飾を最小化したベースライン。
 *
 * Mono は「カスタムテーマの出発点」。
 * `defineTheme()` API 経由で実装される。
 */
export function mono(_options: Record<string, never> = {}) {
  return defineTheme({
    name: '@kappan/themes-mono',
    version: '0.3.0',
    async getAssets() {
      const assets = new Map<string, Uint8Array>();
      const resetBytes = await readFile(path.join(ASSETS_DIR, 'reset.css'));
      const themeBytes = await readFile(path.join(ASSETS_DIR, 'theme.css'));
      assets.set('styles/reset.css', new Uint8Array(resetBytes));
      assets.set('styles/theme.css', new Uint8Array(themeBytes));
      return assets;
    },
  });
}
