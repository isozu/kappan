import type { z } from 'zod';
import type { PluginDefinition, PluginKind, PluginHooks } from './types.js';
import { BuildError } from '../build/errors.js';

/**
 * プラグイン定義のための入力。
 *
 * `schema` を指定すると、プラグインのオプションが ADR-0005 で凍結された
 * ランタイム検証を通過する。検証失敗時は `BuildError` 化されて投げられ、
 * 設定読み込み段階で停止する（ビルド前に検出できる）。
 */
export interface DefinePluginInput<TOptions> {
  readonly name: string;
  readonly version: string;
  readonly kind: PluginKind;
  /**
   * 任意：オプションを検証する zod スキーマ。
   * 指定されると `definePlugin` の戻り値ファクトリ呼び出し時に parse() が実行される。
   * 失敗時は `BuildError`（diagnostics 付き）として投げられる。
   */
  readonly schema?: z.ZodType<TOptions>;
  hooks(options: TOptions): PluginHooks;
}

/**
 * `definePlugin` — プラグインファクトリを定義する。
 *
 * 使い方：
 *
 * ```ts
 * export const myPlugin = definePlugin({
 *   name: '@kappan/plugin-example',
 *   version: '0.1.0',
 *   kind: 'transform',
 *   schema: z.object({ verbose: z.boolean().default(false) }),
 *   hooks: (options) => ({
 *     onMdast(tree, ctx) {
 *       if (options.verbose) ctx.logger.info('processing');
 *     },
 *   }),
 * });
 *
 * // 利用側
 * import { myPlugin } from '@kappan/plugin-example';
 * plugins: [myPlugin({ verbose: true })]
 * ```
 *
 * 設計判断：
 *   - 戻り値はファクトリ関数で、optionsを取って PluginDefinition を返す
 *   - これにより、設定ファイル中で `myPlugin(options)` と書く規約が一貫する
 *   - `plugins: [...]` 配列順がフック実行順となる
 *   - schema があれば options を parse、無ければそのまま hooks() に渡す
 */
export function definePlugin<TOptions = void>(
  input: DefinePluginInput<TOptions>,
): (options?: TOptions) => PluginDefinition {
  return (options) => {
    let resolvedOptions: TOptions;
    if (input.schema) {
      const parsed = input.schema.safeParse(options);
      if (!parsed.success) {
        throw new BuildError(
          `Plugin "${input.name}" options validation failed`,
          parsed.error.issues.map((issue) => ({
            severity: 'error' as const,
            source: input.name,
            message: `${issue.path.join('.')}: ${issue.message}`,
          })),
        );
      }
      resolvedOptions = parsed.data;
    } else {
      resolvedOptions = (options ?? (undefined as TOptions)) as TOptions;
    }
    return {
      name: input.name,
      version: input.version,
      kind: input.kind,
      hooks: input.hooks(resolvedOptions),
    };
  };
}
