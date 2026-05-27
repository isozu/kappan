import type { Root as MdastRoot } from 'mdast';
import type { Root as HastRoot } from 'hast';
import type { Diagnostic } from '../types.js';
import type { KappanConfig } from '../config/schema.js';

/**
 * プラグイン種別。5 分類に対応。
 */
export type PluginKind =
  | 'syntax' // micromark 拡張層
  | 'transform' // mdast 変換層
  | 'typography' // hast 変換層
  | 'packager' // パッケージング後処理
  | 'validator'; // バリデータ

/**
 * 章ファイルのソース表現（フック onSource 用）。
 */
export interface PluginSourceFile {
  readonly path: string;
  readonly content: string;
  readonly frontmatter: Record<string, unknown>;
}

/**
 * パッケージング前の EPUB 表現（フック onPackage 用）。
 * @kappan/epub-packager の EpubPackage を読み出し専用で公開する形。
 */
export interface PluginEpubPackage {
  readonly resources: ReadonlyMap<string, Uint8Array | string>;
  readonly metadata: {
    readonly title: string;
    readonly identifier: string;
    readonly language: string;
  };
}

/**
 * プラグインに渡されるコンテキスト（PluginContext）。
 *
 * 最小実装：
 *   - config: 読み出し専用の設定
 *   - logger: コンソール出力
 *   - cache: プラグイン横断のキー値ストア
 *   - emit: Diagnostic を発行する
 */
export interface PluginContext {
  readonly config: KappanConfig;
  readonly logger: PluginLogger;
  readonly cache: PluginCache;
  readonly emit: (diagnostic: Diagnostic) => void;
}

export interface PluginLogger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface PluginCache {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
  delete(key: string): boolean;
}

/**
 * プラグインのライフサイクルフック。
 * すべてオプショナルで、必要な段階だけ実装する。
 */
export interface PluginHooks {
  onInit?(ctx: PluginContext): Promise<void> | void;
  onSource?(
    source: PluginSourceFile,
    ctx: PluginContext,
  ): Promise<PluginSourceFile> | PluginSourceFile;
  onMdast?(tree: MdastRoot, ctx: PluginContext): Promise<void> | void;
  /**
   * 全章の mdast を一括で受け取るフック。
   *
   * 章ごとの `onMdast` がすべて完了した後、`onHast` が走る前に 1 度だけ呼ばれる。
   * 第二パスで章をまたぐ相互参照（`[@chap:foo]` `[@sec:bar]` `[@eq:baz]`）を
   * 解決するための拡張点。
   *
   * `trees` は章の出現順（spine 順）で並んだリストで、各要素はチャプターの
   * 相対パスと mdast ツリーのペア。要素の `tree` を変更すれば後段の `onHast`
   * や XHTML 生成に反映される。
   *
   * 既存プラグインへの影響：オプショナルなので未実装でも動作変更なし。
   */
  onMdastAllChapters?(
    trees: readonly { readonly path: string; readonly tree: MdastRoot }[],
    ctx: PluginContext,
  ): Promise<void> | void;
  onHast?(tree: HastRoot, ctx: PluginContext): Promise<void> | void;
  /**
   * 巻末ドキュメント（索引・奥付など）を生成して spine に追加するフック。
   *
   * 全章の `onHast` が完了し XHTML が確定した後、manifest / spine 構築前に
   * 1 度呼ばれる。返した各ドキュメントは spine 末尾（linear）に追加され、
   * manifest と resources にも登録される。
   *
   * `plugin-jp-index` が巻末索引 `<nav epub:type="index">` を追加するために使う。
   * 未実装プラグインには影響しない。
   */
  onGenerate?(
    ctx: PluginContext,
  ): Promise<readonly GeneratedDocument[]> | readonly GeneratedDocument[];
  onPackage?(pkg: PluginEpubPackage, ctx: PluginContext): Promise<void> | void;
  onValidate?(
    pkg: PluginEpubPackage,
    ctx: PluginContext,
  ): Promise<readonly Diagnostic[]> | readonly Diagnostic[];
  onDispose?(): Promise<void> | void;
}

/**
 * `onGenerate` フックがプラグインから返す巻末ドキュメント。
 *
 * spine の末尾（linear）に章として追加される。索引・奥付・参考文献などに使う。
 */
export interface GeneratedDocument {
  /** spine / manifest 用の一意 id（英数・ハイフン） */
  readonly id: string;
  /** EPUB 内パス（例 "content/index.xhtml"）。content/ 配下を推奨 */
  readonly href: string;
  /** NAV 目次に出すタイトル */
  readonly title: string;
  /** XHTML 文字列（完全な XHTML 文書） */
  readonly xhtml: string;
  /** manifest の properties（例 ["nav"] 相当の独自値はここでは付けない） */
  readonly properties?: readonly string[];
}

/**
 * プラグイン定義。`definePlugin()` の戻り値が解決された後の形。
 */
export interface PluginDefinition {
  readonly name: string;
  readonly version: string;
  readonly kind: PluginKind;
  readonly hooks: PluginHooks;
}

/**
 * 設定で利用できるプラグイン値。
 * プラグインは `pluginFactory(options)` の結果として `PluginDefinition` を返す。
 */
export type PluginValue = PluginDefinition;
