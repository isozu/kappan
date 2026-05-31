export { defineConfig } from './config/defineConfig.js';
export { loadConfig, type LoadConfigResult } from './config/loadConfig.js';
export {
  KappanConfigSchema,
  MetadataSchema,
  CreatorSchema,
  AccessibilitySchema,
  SourceSchema,
  OutputSchema,
  UnsafeHtmlSchema,
  WritingModeSchema,
  RenditionSchema,
  type KappanConfig,
  type KappanConfigInput,
} from './config/schema.js';
export { defineTheme, type DefineThemeInput } from './theme/defineTheme.js';
export { buildBook, type BuildBookOptions, type BuildBookResult } from './build/buildBook.js';
export {
  buildChapter,
  type BuildChapterOptions,
  type BuildChapterResult,
} from './build/buildChapter.js';
export { collectChapters, type Chapter } from './build/collectChapters.js';
export { parseFrontmatter } from './build/frontmatter.js';
export {
  renderChapter,
  renderMdastToXhtml,
  parseMarkdownToMdast,
  type RenderChapterOptions,
} from './build/markdownToXhtml.js';
export { BuildError } from './build/errors.js';
export {
  checkChapterAccessibility,
  inferAccessibilityFeatures,
  inferAccessModes,
} from './validate/accessibility.js';
export {
  runEpubcheck,
  resolveEpubcheckJar,
  EpubcheckNotInstalledError,
  type EpubcheckResult,
  type EpubcheckIssue,
} from './validate/epubcheck.js';
export {
  runAce,
  normalizeAceReport,
  isAceStrictPass,
  AceNotInstalledError,
  AceIntegrationPendingError,
  type AceResult,
  type AceViolation,
  type AceImpact,
  type AceImpactCounts,
  type AceRawReport,
} from './validate/ace.js';
export type {
  Diagnostic,
  SourceFile,
  ChapterFrontmatter,
  ChapterKind,
  ThemeLike,
} from './types.js';
export { definePlugin, type DefinePluginInput } from './plugin/definePlugin.js';
export { createPluginContext } from './plugin/context.js';
export {
  buildChapterRegistry,
  CHAPTER_REGISTRY_CACHE_KEY,
  type ChapterMeta,
  type ChapterRecord,
  type ChapterRegistry,
  type ColumnRecord,
  type SectionRecord,
} from './plugin/chapterRegistry.js';
export {
  runOnInit,
  runOnSource,
  runOnMdast,
  runOnMdastAllChapters,
  runOnHast,
  runOnGenerate,
  runOnDispose,
  runOnPackage,
  runOnValidate,
} from './plugin/runHooks.js';
export type {
  PluginKind,
  PluginContext,
  PluginLogger,
  PluginCache,
  PluginHooks,
  PluginDefinition,
  PluginSourceFile,
  PluginEpubPackage,
  PluginValue,
  GeneratedDocument,
} from './plugin/types.js';
