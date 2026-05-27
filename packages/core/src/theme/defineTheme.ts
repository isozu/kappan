import type { ThemeLike } from '../types.js';

/**
 * `defineTheme` — テーマファクトリを定義する。
 *
 * テーマは `getAssets()` で EPUB 内に配置するアセット（CSS、フォント等）を返す。
 * 最小インターフェイス。`additionalCss` オプションや
 * `hooks.beforeChapter` 等の拡張は今後 minor 追加で導入する。
 *
 * 使い方：
 *
 * ```ts
 * export function saiun(options: SaiunOptions = {}) {
 *   return defineTheme({
 *     name: '@kappan/themes-saiun',
 *     version: '0.1.0',
 *     async getAssets() { ... },
 *   });
 * }
 * ```
 */
export interface DefineThemeInput {
  readonly name: string;
  readonly version: string;
  getAssets(): Promise<Map<string, Uint8Array>>;
}

export function defineTheme(input: DefineThemeInput): ThemeLike {
  return {
    name: input.name,
    version: input.version,
    getAssets: input.getAssets,
  };
}
