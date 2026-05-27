import type { Root as MdastRoot } from 'mdast';
import type { Root as HastRoot } from 'hast';
import type { Diagnostic } from '../types.js';
import type {
  PluginContext,
  PluginDefinition,
  PluginEpubPackage,
  PluginSourceFile,
  GeneratedDocument,
} from './types.js';

/**
 * 設定で指定されたプラグイン配列に対して特定フックを順次実行する。
 *
 * 配列順がフック実行順を決める。
 * 同じフックを持つプラグインが衝突する場合、配列の前から順に適用される。
 */

export async function runOnInit(
  plugins: readonly PluginDefinition[],
  ctx: PluginContext,
): Promise<void> {
  for (const plugin of plugins) {
    if (plugin.hooks.onInit) {
      await plugin.hooks.onInit(ctx);
    }
  }
}

export async function runOnSource(
  plugins: readonly PluginDefinition[],
  ctx: PluginContext,
  source: PluginSourceFile,
): Promise<PluginSourceFile> {
  let current = source;
  for (const plugin of plugins) {
    if (plugin.hooks.onSource) {
      current = await plugin.hooks.onSource(current, ctx);
    }
  }
  return current;
}

export async function runOnMdast(
  plugins: readonly PluginDefinition[],
  ctx: PluginContext,
  tree: MdastRoot,
): Promise<void> {
  for (const plugin of plugins) {
    if (plugin.hooks.onMdast) {
      await plugin.hooks.onMdast(tree, ctx);
    }
  }
}

/**
 * `onMdastAllChapters` フックを順次実行する。
 *
 * すべての章の `onMdast` が完了した後、`onHast` が走る前に 1 度だけ呼ばれる。
 * 章をまたぐ相互参照解決（`[@chap:foo]` `[@sec:bar]` 等）に使う。
 *
 * `trees` は spine 順に並んだ章の mdast リスト。プラグインは木を直接書き換えてよい。
 */
export async function runOnMdastAllChapters(
  plugins: readonly PluginDefinition[],
  ctx: PluginContext,
  trees: readonly { readonly path: string; readonly tree: MdastRoot }[],
): Promise<void> {
  for (const plugin of plugins) {
    if (plugin.hooks.onMdastAllChapters) {
      await plugin.hooks.onMdastAllChapters(trees, ctx);
    }
  }
}

export async function runOnHast(
  plugins: readonly PluginDefinition[],
  ctx: PluginContext,
  tree: HastRoot,
): Promise<void> {
  for (const plugin of plugins) {
    if (plugin.hooks.onHast) {
      await plugin.hooks.onHast(tree, ctx);
    }
  }
}

/**
 * `onGenerate` フックを順次実行し、巻末ドキュメントを集めて返す。
 *
 * spine 構築前に呼ばれ、プラグインが生成した索引・奥付などを集約する。
 * 配列順がそのまま spine 追加順になる。
 */
export async function runOnGenerate(
  plugins: readonly PluginDefinition[],
  ctx: PluginContext,
): Promise<GeneratedDocument[]> {
  const docs: GeneratedDocument[] = [];
  for (const plugin of plugins) {
    if (plugin.hooks.onGenerate) {
      const result = await plugin.hooks.onGenerate(ctx);
      docs.push(...result);
    }
  }
  return docs;
}

export async function runOnDispose(plugins: readonly PluginDefinition[]): Promise<void> {
  for (const plugin of plugins) {
    if (plugin.hooks.onDispose) {
      await plugin.hooks.onDispose();
    }
  }
}

/**
 * `onPackage` フックを順次実行する。
 *
 * パッケージング層（OPF/NAV 構築後、ZIP 化前）でプラグインが
 * EpubPackage の読み出し専用 view を観察できる接点。
 * `plugin-okuduke` 等の奥付追加プラグインがここで動く想定。
 *
 * onPackage はパッケージ内容を変更しない（observation のみ）。
 * パッケージ内容の変更は将来のメジャー版で別フックとして導入を検討。
 */
export async function runOnPackage(
  plugins: readonly PluginDefinition[],
  ctx: PluginContext,
  pkg: PluginEpubPackage,
): Promise<void> {
  for (const plugin of plugins) {
    if (plugin.hooks.onPackage) {
      await plugin.hooks.onPackage(pkg, ctx);
    }
  }
}

/**
 * `onValidate` フックを順次実行し、結果を統合して Diagnostic 配列で返す。
 *
 * パッケージング後（実 EpubPackage が確定した時点）に呼ばれ、
 * プラグインが validation 結果を Diagnostic として返せる接点。
 */
export async function runOnValidate(
  plugins: readonly PluginDefinition[],
  ctx: PluginContext,
  pkg: PluginEpubPackage,
): Promise<Diagnostic[]> {
  const allDiagnostics: Diagnostic[] = [];
  for (const plugin of plugins) {
    if (plugin.hooks.onValidate) {
      const result = await plugin.hooks.onValidate(pkg, ctx);
      allDiagnostics.push(...result);
    }
  }
  return allDiagnostics;
}
