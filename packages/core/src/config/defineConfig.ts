import { KappanConfigSchema, type KappanConfig, type KappanConfigInput } from './schema.js';

/**
 * defineConfig — `kappan.config.ts` で利用する型補完+検証関数。
 *
 * 入力をzodスキーマで検証し、デフォルト値を埋めた `KappanConfig` を返す。
 */
export function defineConfig(input: KappanConfigInput): KappanConfig {
  return KappanConfigSchema.parse(input);
}
