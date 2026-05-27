import path from 'node:path';
import type { KappanConfig } from '../config/schema.js';
import type { Diagnostic, PluginContext } from '../types.js';
import type { Chapter } from './collectChapters.js';
import { renderChapter } from './markdownToXhtml.js';
import { processImages, loadImageResources } from './processImages.js';
import { createPluginContext } from '../plugin/context.js';
import { runOnSource, runOnMdast, runOnHast } from '../plugin/runHooks.js';

export interface BuildChapterOptions {
  readonly config: KappanConfig;
  readonly chapter: Chapter;
  /** プレビューやテストで diagnostic を蓄積したい場合に渡す */
  readonly diagnostics?: Diagnostic[];
  /**
   * プラグインコンテキスト。長寿命セッション（preview server など）で同じコンテキストを
   * 共有することで、プラグインの onInit を一度だけ呼び出して結果をキャッシュできる。
   * 省略時は内部で新規生成される（短命用途）。
   */
  readonly pluginContext?: PluginContext;
}

export interface BuildChapterResult {
  /** XHTML 文字列（プレビューでそのまま配信する形） */
  readonly xhtml: string;
  /** この章で参照された画像のローカルパス → バイト列 */
  readonly imageAssets: ReadonlyMap<string, Uint8Array>;
}

/**
 * 単一章だけを Markdown から XHTML に変換する。
 * preview server の差分ビルドで使う「最小単位の章ビルド」を提供する。
 *
 * ライブプレビューで章単位 HMR を実現するための API。
 *
 * 注意：本関数は onInit/onDispose を呼ばない。プラグインのライフサイクル全体を
 * 管理するのは呼び出し側の責務である（buildBook は内部で全フックを呼ぶが、
 * preview server は start/stop で1度ずつ呼ぶ）。
 */
export async function buildChapter(opts: BuildChapterOptions): Promise<BuildChapterResult> {
  const { config, chapter } = opts;
  const diagnostics = opts.diagnostics ?? [];
  const pluginCtx = opts.pluginContext ?? createPluginContext({ config, diagnostics });
  const plugins = config.plugins;

  const processed = await runOnSource(plugins, pluginCtx, {
    path: chapter.relativePath,
    content: chapter.markdown,
    frontmatter: {},
  });

  const rawXhtml = await renderChapter(processed.content, {
    title: chapter.title,
    language: config.metadata.language,
    stylesheetHref: '../styles/theme.css',
    unsafeHtml: config.unsafeHtml,
    async onMdast(tree) {
      await runOnMdast(plugins, pluginCtx, tree);
    },
    async onHast(tree) {
      await runOnHast(plugins, pluginCtx, tree);
    },
  });

  const imgResult = await processImages({
    xhtml: rawXhtml,
    chapterEpubPath: `content/${chapter.id}.xhtml`,
    markdownSourceDir: path.dirname(chapter.absolutePath),
  });
  const imageAssets = await loadImageResources(imgResult.images);

  return {
    xhtml: imgResult.xhtml,
    imageAssets,
  };
}
