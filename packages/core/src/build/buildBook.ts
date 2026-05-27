import { randomUUID } from 'node:crypto';
import {
  packageEpub,
  buildNavXhtml,
  type EpubPackage,
  type ManifestEntry,
  type SpineEntry,
  type Metadata,
  type AccessibilityMeta,
  type NavEntry,
} from '@kappan/epub-packager';
import type { KappanConfig } from '../config/schema.js';
import path from 'node:path';
import type { Diagnostic } from '../types.js';
import { collectChapters, type Chapter } from './collectChapters.js';
import { parseMarkdownToMdast, renderMdastToXhtml } from './markdownToXhtml.js';
import { processImages, loadImageResources, type ProcessedImage } from './processImages.js';
import {
  checkChapterAccessibility,
  inferAccessibilityFeatures,
  inferAccessModes,
} from '../validate/accessibility.js';
import { BuildError } from './errors.js';
import { createPluginContext } from '../plugin/context.js';
import {
  runOnInit,
  runOnSource,
  runOnMdast,
  runOnMdastAllChapters,
  runOnHast,
  runOnGenerate,
  runOnDispose,
  runOnPackage,
  runOnValidate,
} from '../plugin/runHooks.js';
import type { PluginEpubPackage } from '../plugin/types.js';

export interface BuildBookOptions {
  readonly config: KappanConfig;
  readonly configDir: string;
  readonly outputPath: string;
  /** ビルド時刻の固定（テスト・ゴールデンファイル用）。省略時は現在時刻 */
  readonly now?: Date;
  /** dc:identifier の固定（省略時は config.metadata.identifier、それも無ければ自動生成） */
  readonly identifierOverride?: string;
}

export interface BuildBookResult {
  readonly outputPath: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly chapters: readonly Chapter[];
}

/**
 * Kappan のメインエントリポイント。
 * Markdown → mdast → hast → XHTML → EPUB ZIP の全段をオーケストレーションする。
 *
 * 流れ：
 *   1. 章ファイルの収集（front-matter の next を辿る）
 *   2. テーマアセットの取得
 *   3. 各章の Markdown → XHTML 変換
 *   4. アクセシビリティ検証フック（W5 で追加）
 *   5. EPUB パッケージ構築 → ZIP
 */
export async function buildBook(opts: BuildBookOptions): Promise<BuildBookResult> {
  const { config, configDir, outputPath } = opts;
  const diagnostics: Diagnostic[] = [];
  const plugins = config.plugins;

  // 1. 章ファイルを集める
  const chapters = await collectChapters(config, configDir);
  if (chapters.length === 0) {
    throw new Error(`No chapters collected from entry "${config.source.entry}".`);
  }

  // 2. テーマアセット取得 + プラグインコンテキスト構築
  const themeAssets = await config.theme.getAssets();
  const pluginCtx = createPluginContext({ config, diagnostics });

  // 3. プラグインの onInit 実行
  await runOnInit(plugins, pluginCtx);

  try {
    // 4. 各章を XHTML へ変換 + 画像参照を EPUB 内パスに書き換え
    //
    // 2 パス構成：
    //   フェーズ 1 — 全章を mdast に解析し、章ごとに `onMdast` を適用
    //   フェーズ 2 — `onMdastAllChapters` を 1 度呼ぶ（章をまたぐ相互参照解決の接点）
    //   フェーズ 3 — 章ごとに hast 化〜stringify〜画像書き換え（並列）
    //
    // 以前は「章ごとに parse → render を Promise.all」だったが、章間で
    // 共有する情報（章番号、sec/eq 定義）を解決できなかった。
    // 並列実行は parse と render それぞれの内部で維持しつつ、章間調整の
    // バリアを 1 箇所に集約する。
    const allImages: ProcessedImage[] = [];

    // フェーズ 1：全章を並列に解析 + onSource + onMdast 適用
    const parsedChapters = await Promise.all(
      chapters.map(async (chapter) => {
        const processed = await runOnSource(plugins, pluginCtx, {
          path: chapter.relativePath,
          content: chapter.markdown,
          frontmatter: {},
        });
        const mdast = parseMarkdownToMdast(processed.content);
        await runOnMdast(plugins, pluginCtx, mdast);
        return { chapter, mdast, processedContent: processed.content };
      }),
    );

    // フェーズ 2：全章 mdast を一括で受け渡し、章をまたぐ参照を解決
    await runOnMdastAllChapters(
      plugins,
      pluginCtx,
      parsedChapters.map(({ chapter, mdast }) => ({
        path: chapter.relativePath,
        tree: mdast,
      })),
    );

    // フェーズ 3：章ごとに hast 化〜画像書き換え（並列）
    const renderedChapters = await Promise.all(
      parsedChapters.map(async ({ chapter, mdast }) => {
        const rawXhtml = await renderMdastToXhtml(mdast, {
          title: chapter.title,
          language: config.metadata.language,
          stylesheetHref: '../styles/theme.css',
          unsafeHtml: config.unsafeHtml,
          writingMode: config.writingMode,
          async onHast(tree) {
            await runOnHast(plugins, pluginCtx, tree);
          },
        });
        const imgResult = await processImages({
          xhtml: rawXhtml,
          chapterEpubPath: `content/${chapter.id}.xhtml`,
          markdownSourceDir: path.dirname(chapter.absolutePath),
        });
        allImages.push(...imgResult.images);
        return { chapter, xhtml: imgResult.xhtml };
      }),
    );

    // 4. アクセシビリティ検証（epub:type、ARIA landmark、contrast）
    const stylesheet = pickPrimaryStylesheet(themeAssets);
    for (const { chapter, xhtml } of renderedChapters) {
      diagnostics.push(
        ...checkChapterAccessibility({
          chapterRelativePath: chapter.relativePath,
          xhtml,
          ...(stylesheet !== undefined ? { stylesheet } : {}),
        }),
      );
    }
    const errors = diagnostics.filter((d) => d.severity === 'error');
    if (errors.length > 0) {
      throw new BuildError(
        `Accessibility check failed (${errors.length} error${errors.length === 1 ? '' : 's'})`,
        diagnostics,
      );
    }

    // 4b. プラグインの onGenerate を呼ぶ（巻末索引・奥付などを spine に追加）。
    // 全章の XHTML 確定後、manifest/spine 構築前に実行する。
    const generatedDocs = await runOnGenerate(plugins, pluginCtx);

    // 5. NAV ドキュメント生成（本文章 + 生成ドキュメントを含める）
    const navEntries: NavEntry[] = [
      ...renderedChapters.map(({ chapter }) => ({
        href: `content/${chapter.id}.xhtml`,
        title: chapter.title,
      })),
      ...generatedDocs.map((doc) => ({ href: doc.href, title: doc.title })),
    ];
    const navXhtml = buildNavXhtml(navEntries, config.metadata.language);

    // 6. manifest / spine 構築
    const manifest: ManifestEntry[] = [
      { id: 'nav', href: 'nav.xhtml', mediaType: 'application/xhtml+xml', properties: ['nav'] },
    ];
    const spine: SpineEntry[] = [];

    for (const { chapter, xhtml } of renderedChapters) {
      const props = detectContentProperties(xhtml);
      manifest.push({
        id: chapter.id,
        href: `content/${chapter.id}.xhtml`,
        mediaType: 'application/xhtml+xml',
        ...(props.length > 0 ? { properties: props } : {}),
      });
      spine.push({ idref: chapter.id, linear: true });
    }

    // 生成ドキュメント（索引など）を manifest / spine に追加
    for (const doc of generatedDocs) {
      const docProps = [...(doc.properties ?? []), ...detectContentProperties(doc.xhtml)];
      manifest.push({
        id: doc.id,
        href: doc.href,
        mediaType: 'application/xhtml+xml',
        ...(docProps.length > 0 ? { properties: [...new Set(docProps)] } : {}),
      });
      spine.push({ idref: doc.id, linear: true });
    }

    // テーマ CSS を manifest に追加
    const cssEntries: ManifestEntry[] = [];
    for (const assetPath of themeAssets.keys()) {
      if (assetPath.endsWith('.css')) {
        cssEntries.push({
          id: idFromPath(assetPath),
          href: assetPath,
          mediaType: 'text/css',
        });
      }
    }
    manifest.push(...cssEntries);

    // 画像リソースを先に読み込む（不在画像をスキップするため）
    const imageResources = await loadImageResources(allImages);

    // 表紙画像を別途読み込む（config.metadata.coverImage 指定時）
    const coverImage = await loadCoverImage(config, configDir, diagnostics);
    if (coverImage) {
      imageResources.set(coverImage.epubPath, coverImage.bytes);
    }

    // 画像を manifest に追加（重複排除）。実体が無い画像は除外する。
    // 表紙画像と同じパスがあれば properties=['cover-image'] を付与する。
    const imageEntries = new Map<string, ManifestEntry>();
    for (const img of allImages) {
      if (!imageResources.has(img.epubPath)) continue; // 画像ファイル不在のため除外
      if (!imageEntries.has(img.epubPath)) {
        const isCover = coverImage?.epubPath === img.epubPath;
        imageEntries.set(img.epubPath, {
          id: img.id,
          href: img.epubPath,
          mediaType: img.mediaType,
          ...(isCover ? { properties: ['cover-image'] } : {}),
        });
      }
    }
    // 表紙画像が本文に登場しない場合は独立 entry として追加
    if (coverImage && !imageEntries.has(coverImage.epubPath)) {
      imageEntries.set(coverImage.epubPath, {
        id: 'cover-image',
        href: coverImage.epubPath,
        mediaType: coverImage.mediaType,
        properties: ['cover-image'],
      });
    }
    manifest.push(...imageEntries.values());

    // 7. resources マップ（EPUB/ 配下に配置するファイル群）
    const resources = new Map<string, Uint8Array | string>();
    resources.set('nav.xhtml', navXhtml);
    for (const { chapter, xhtml } of renderedChapters) {
      resources.set(`content/${chapter.id}.xhtml`, xhtml);
    }
    for (const doc of generatedDocs) {
      resources.set(doc.href, doc.xhtml);
    }
    for (const [assetPath, content] of themeAssets) {
      resources.set(assetPath, content);
    }
    for (const [resPath, data] of imageResources) {
      resources.set(resPath, data);
    }

    // 8. metadata 構築（XHTML から accessibility features / accessModes を自動推定）
    const xhtmlList = renderedChapters.map((r) => r.xhtml);
    const metadata = buildMetadata(config, opts, {
      inferredFeatures: inferAccessibilityFeatures(xhtmlList),
      inferredAccessModes: inferAccessModes(xhtmlList),
    });

    // 9. パッケージ構築
    // 縦組みは右綴じ（page-progression-direction="rtl"）。横組みは属性を出さない。
    const pkg: EpubPackage = {
      metadata,
      manifest,
      spine,
      resources,
      ...(config.writingMode === 'vertical-rl' ? { pageProgressionDirection: 'rtl' as const } : {}),
    };

    // 9a. プラグインの onPackage を呼ぶ（observation のみ）
    const pluginPkg: PluginEpubPackage = {
      resources,
      metadata: {
        title: metadata.title,
        identifier: metadata.identifier,
        language: metadata.language,
      },
    };
    await runOnPackage(plugins, pluginCtx, pluginPkg);

    // 9b. プラグインの onValidate を呼ぶ（diagnostics を統合）
    const pluginDiagnostics = await runOnValidate(plugins, pluginCtx, pluginPkg);
    diagnostics.push(...pluginDiagnostics);
    const pluginValidationErrors = pluginDiagnostics.filter((d) => d.severity === 'error');
    if (pluginValidationErrors.length > 0) {
      throw new BuildError(
        `Plugin validation failed (${pluginValidationErrors.length} error${pluginValidationErrors.length === 1 ? '' : 's'})`,
        diagnostics,
      );
    }

    // 9c. ZIP 化
    await packageEpub({ pkg, outputPath });

    return { outputPath, diagnostics, chapters };
  } finally {
    // どのコードパスを通っても onDispose を呼ぶ（リソース解放を保証）
    await runOnDispose(plugins);
  }
}

interface MetadataAugment {
  readonly inferredFeatures: readonly string[];
  readonly inferredAccessModes: readonly string[];
}

function buildMetadata(
  config: KappanConfig,
  opts: BuildBookOptions,
  augment: MetadataAugment,
): Metadata {
  const now = opts.now ?? new Date();
  const isoDate = now.toISOString().slice(0, 10);
  const isoModified = now.toISOString().replace(/\.\d+Z$/, 'Z');

  const a11yInput = config.metadata.accessibility;
  // 推定値とユーザー指定値を組み合わせる。ユーザー指定が優先。
  const features = a11yInput?.features ?? augment.inferredFeatures;
  const accessibility: AccessibilityMeta = {
    features,
    accessModes: augment.inferredAccessModes,
    hazards: a11yInput?.hazards ?? ['none'],
    summary: a11yInput?.summary ?? generateAccessibilitySummary(features),
  };

  return {
    title: config.metadata.title,
    ...(config.metadata.subtitle !== undefined ? { subtitle: config.metadata.subtitle } : {}),
    creators: config.metadata.creator.map((c) => ({
      name: c.name,
      role: c.role,
      ...(c.fileAs !== undefined ? { fileAs: c.fileAs } : {}),
    })),
    language: config.metadata.language,
    ...(config.metadata.publisher !== undefined ? { publisher: config.metadata.publisher } : {}),
    identifier: opts.identifierOverride ?? config.metadata.identifier ?? `urn:uuid:${randomUUID()}`,
    date: config.metadata.date ?? isoDate,
    modified: isoModified,
    accessibility,
  };
}

function idFromPath(p: string): string {
  return p.replace(/[^a-zA-Z0-9]/g, '-').replace(/^-|-$/g, '');
}

/**
 * XHTML 内容から OPF manifest item に必要な properties を検出する（EPUB 3.3 §3.4.3.2）。
 *   - `mathml`：MathML（`<math>` 要素）を含む（OPF-014 回避）
 *   - `svg`：インライン SVG（`<svg>` 要素）を含む
 *   - `scripted`：`<script>` を含む
 */
function detectContentProperties(xhtml: string): string[] {
  const props: string[] = [];
  if (/<math[\s>]/.test(xhtml) || /<math:math[\s>]/.test(xhtml)) props.push('mathml');
  if (/<svg[\s>]/.test(xhtml)) props.push('svg');
  if (/<script[\s>]/.test(xhtml)) props.push('scripted');
  return props;
}

/**
 * テーマアセットから「主要 stylesheet」を選び出して文字列として返す。
 *
 * accessibility.ts の contrast チェックに渡すための簡易ヘルパ。優先順位：
 *   1. `styles/theme.css`
 *   2. `theme.css` を含む最初の .css ファイル
 *   3. 最初の .css ファイル
 *
 * テーマが追加で `additionalCss` を末尾に注入していても、override されている色は
 * 末尾出現が勝つので：root 直近の宣言を見ている本チェックは作者の override を尊重する。
 */
function pickPrimaryStylesheet(themeAssets: ReadonlyMap<string, Uint8Array>): string | undefined {
  const decode = (bytes: Uint8Array): string => new TextDecoder('utf-8').decode(bytes);
  const direct = themeAssets.get('styles/theme.css');
  if (direct) return decode(direct);
  for (const [name, bytes] of themeAssets) {
    if (name.endsWith('theme.css')) return decode(bytes);
  }
  for (const [name, bytes] of themeAssets) {
    if (name.endsWith('.css')) return decode(bytes);
  }
  return undefined;
}

const COVER_MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
};

interface CoverImage {
  readonly epubPath: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
}

async function loadCoverImage(
  config: KappanConfig,
  configDir: string,
  diagnostics: Diagnostic[],
): Promise<CoverImage | undefined> {
  const rel = config.metadata.coverImage;
  if (!rel) return undefined;
  const { readFile } = await import('node:fs/promises');
  const { existsSync } = await import('node:fs');
  // coverImage はプロジェクトルート（configDir）からの相対パスとして解決する
  const absolute = path.resolve(configDir, rel);
  if (!existsSync(absolute)) {
    diagnostics.push({
      severity: 'warning',
      source: 'build',
      message: `cover image not found: ${rel}`,
    });
    return undefined;
  }
  const ext = path.extname(absolute).toLowerCase();
  const extMediaType = COVER_MIME_BY_EXT[ext];
  if (!extMediaType) {
    diagnostics.push({
      severity: 'warning',
      source: 'build',
      message: `cover image has unsupported format: ${ext}`,
    });
    return undefined;
  }
  const bytes = new Uint8Array(await readFile(absolute));
  // マジックナンバーから実体形式を判定し、拡張子と一致するか確認する。
  // 拡張子と食い違う場合（例：cover.jpg の中身が PNG）は EPUBCheck OPF-029 を
  // 引き起こすため、実体側を優先して media-type を補正する。
  const detected = detectImageMediaType(bytes);
  const mediaType = detected ?? extMediaType;
  if (detected && detected !== extMediaType) {
    diagnostics.push({
      severity: 'warning',
      source: 'build',
      message:
        `cover image extension "${ext}" does not match actual format ` +
        `(${detected}); using detected media-type. ` +
        `Consider renaming the file to match its content.`,
    });
  }
  const basename = path.posix.basename(rel);
  return {
    epubPath: `images/${basename}`,
    mediaType,
    bytes,
  };
}

/**
 * 画像ファイルの先頭バイト列から実体形式を判定する。
 * 既知のフォーマット以外は undefined を返す（拡張子由来の MIME にフォールバックする想定）。
 */
function detectImageMediaType(bytes: Uint8Array): string | undefined {
  if (bytes.length >= 8) {
    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    ) {
      return 'image/png';
    }
  }
  if (bytes.length >= 3) {
    // JPEG: FF D8 FF
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return 'image/jpeg';
    }
  }
  if (bytes.length >= 6) {
    // GIF: 47 49 46 38 (GIF8)
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
      return 'image/gif';
    }
  }
  if (bytes.length >= 12) {
    // WebP: 52 49 46 46 ?? ?? ?? ?? 57 45 42 50 (RIFF....WEBP)
    if (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    ) {
      return 'image/webp';
    }
  }
  return undefined;
}

function generateAccessibilitySummary(features: readonly string[]): string {
  const parts: string[] = ['本書は次のアクセシビリティ機能を備えています：'];
  const labels: string[] = [];
  if (features.includes('structuralNavigation')) labels.push('構造的ナビゲーション');
  if (features.includes('tableOfContents')) labels.push('目次');
  if (features.includes('alternativeText')) labels.push('画像の代替テキスト');
  if (features.includes('MathML')) labels.push('数式のMathML表現');
  parts.push(labels.join('、'));
  parts.push('。');
  return parts.join('');
}
