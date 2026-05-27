import type { Diagnostic } from '../types.js';
import type { KappanConfig } from '../config/schema.js';
import type { PluginContext, PluginLogger, PluginCache } from './types.js';

/**
 * `PluginContext` の標準実装を組み立てる。
 *
 * `diagnostics` 配列に発行された Diagnostic が蓄積される。
 * 呼び出し側（buildBook）がこれを参照してエラー判定とレポート出力に使う。
 */
export interface CreateContextOptions {
  readonly config: KappanConfig;
  readonly diagnostics: Diagnostic[];
}

export function createPluginContext(opts: CreateContextOptions): PluginContext {
  const logger = createLogger();
  const cache = createCache();

  return {
    config: opts.config,
    logger,
    cache,
    emit(diagnostic) {
      opts.diagnostics.push(diagnostic);
    },
  };
}

function createLogger(): PluginLogger {
  const prefix = '[kappan]';
  return {
    debug(message) {
      if (process.env['KAPPAN_DEBUG'] === '1') {
        console.error(`${prefix} debug: ${message}`);
      }
    },
    info(message) {
      console.error(`${prefix} ${message}`);
    },
    warn(message) {
      console.error(`${prefix} warn: ${message}`);
    },
    error(message) {
      console.error(`${prefix} error: ${message}`);
    },
  };
}

function createCache(): PluginCache {
  const store = new Map<string, unknown>();
  return {
    get<T>(key: string): T | undefined {
      return store.get(key) as T | undefined;
    },
    set<T>(key: string, value: T): void {
      store.set(key, value);
    },
    delete(key: string): boolean {
      return store.delete(key);
    },
  };
}
