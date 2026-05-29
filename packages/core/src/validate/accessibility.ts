import type { Diagnostic } from '../types.js';

/**
 * 各章 XHTML に対するアクセシビリティ検証。
 *
 * 必須化される項目：
 *   - 画像 alt 属性の必須化
 *   - 見出し階層の連続性検証（h1の後にh3が来るような飛びを検出）
 *
 * 追加項目：
 *   - epub:type 属性のロケーション妥当性（noteref は <a> のみ、footnote は <li> のみ等）
 *   - ARIA landmark 推奨（章本体の最上位要素に role="main" 等）
 *   - 色コントラスト比（テーマ stylesheet を渡された場合のみ。WCAG 2.1 AA 4.5:1）
 *
 * `role="presentation"` を持つ画像は alt が空でも許可する（装飾画像）。
 */

const IMG_RE = /<img\s+([^>]*?)\s*(?:\/>|><\/img>)/g;
const ALT_RE = /\balt="([^"]*)"/;
const SRC_RE = /\bsrc="([^"]*)"/;
const ROLE_RE = /\brole="([^"]*)"/;
const HEADING_RE = /<h([1-6])\b/g;
// epub:type の現れる要素を捕捉する。タグ名と epub:type 値を取り出す。
const EPUB_TYPE_RE = /<([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*?)\bepub:type="([^"]+)"/g;

export interface AccessibilityCheckOptions {
  readonly chapterRelativePath: string;
  readonly xhtml: string;
  /**
   * テーマの主要 stylesheet（theme.css）の文字列。コントラスト比検査に使う。
   * 未指定なら contrast チェックは skip する（optional）。
   */
  readonly stylesheet?: string;
  /**
   * 章が「nav.xhtml」かどうか。nav の場合は role="main" を推奨しない。
   */
  readonly isNav?: boolean;
}

export function checkChapterAccessibility(opts: AccessibilityCheckOptions): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  diagnostics.push(...checkImageAlt(opts));
  diagnostics.push(...checkHeadingHierarchy(opts));
  diagnostics.push(...checkEpubTypeLocation(opts));
  diagnostics.push(...checkAriaLandmarks(opts));
  if (opts.stylesheet !== undefined) {
    diagnostics.push(...checkContrastFromStylesheet(opts));
  }
  return diagnostics;
}

function checkImageAlt(opts: AccessibilityCheckOptions): Diagnostic[] {
  const out: Diagnostic[] = [];
  IMG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = IMG_RE.exec(opts.xhtml)) !== null) {
    const attrs = match[1] ?? '';
    const src = attrs.match(SRC_RE)?.[1] ?? '<unknown>';
    const role = attrs.match(ROLE_RE)?.[1];
    const altMatch = attrs.match(ALT_RE);

    if (role === 'presentation') {
      // 装飾画像は alt が空文字でも許可する
      continue;
    }

    if (!altMatch) {
      out.push({
        severity: 'error',
        source: '@kappan/core:a11y',
        message:
          `Image is missing alt attribute (src=${src}). ` +
          `Add alt text, or set role="presentation" for purely decorative images.`,
        range: nullRange(opts.chapterRelativePath),
      });
      continue;
    }

    if (altMatch[1] === '') {
      out.push({
        severity: 'error',
        source: '@kappan/core:a11y',
        message:
          `Image alt attribute is empty (src=${src}). ` +
          `Provide descriptive text, or mark as decorative with role="presentation".`,
        range: nullRange(opts.chapterRelativePath),
      });
    }
  }
  return out;
}

function checkHeadingHierarchy(opts: AccessibilityCheckOptions): Diagnostic[] {
  const out: Diagnostic[] = [];
  HEADING_RE.lastIndex = 0;
  let previousLevel = 0;
  let match: RegExpExecArray | null;
  while ((match = HEADING_RE.exec(opts.xhtml)) !== null) {
    const level = Number.parseInt(match[1] ?? '0', 10);
    if (previousLevel > 0 && level > previousLevel + 1) {
      out.push({
        severity: 'warning',
        source: '@kappan/core:a11y',
        message:
          `Heading level skipped: h${previousLevel} → h${level}. ` +
          `Use h${previousLevel + 1} instead, or add an intermediate heading.`,
        range: nullRange(opts.chapterRelativePath),
      });
    }
    previousLevel = level;
  }
  return out;
}

/**
 * epub:type 値ごとの「現れて良い要素」を表現する。
 *
 * EPUB Structural Semantics Vocabulary（https://www.w3.org/publishing/epub32/epub-packages.html#sec-epub-type）
 * のうち、Kappan の出力で実際に使うものに限定して定義する。固定レイアウト系は除外。
 */
const ALLOWED_TAGS_BY_TYPE: Record<string, ReadonlySet<string>> = {
  // 脚注セクション全体
  footnotes: new Set(['aside', 'section']),
  // 個々の脚注エントリ
  footnote: new Set(['li', 'aside']),
  // 脚注への参照リンク
  noteref: new Set(['a']),
  // 目次
  toc: new Set(['nav']),
  'page-list': new Set(['nav']),
  landmarks: new Set(['nav']),
  // 章本体（縦組みでも本書 body に出る想定）
  chapter: new Set(['section', 'article']),
  preface: new Set(['section', 'article']),
  introduction: new Set(['section', 'article']),
  bibliography: new Set(['section', 'aside']),
  glossary: new Set(['section', 'aside']),
  // コラム・補足囲み（plugin-column / plugin-admonition）。本文から切り離して
  // 読める傍流コンテンツ。EPUB Structural Semantics Vocabulary の `sidebar`。
  sidebar: new Set(['aside']),
  index: new Set(['section', 'nav']),
  appendix: new Set(['section', 'article']),
  cover: new Set(['section', 'img']),
  titlepage: new Set(['section']),
  colophon: new Set(['section', 'aside']),
};

function checkEpubTypeLocation(opts: AccessibilityCheckOptions): Diagnostic[] {
  const out: Diagnostic[] = [];
  EPUB_TYPE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = EPUB_TYPE_RE.exec(opts.xhtml)) !== null) {
    const tag = (match[1] ?? '').toLowerCase();
    const rawTypes = match[3] ?? '';
    // epub:type は空白区切りで複数値を取りうる
    for (const t of rawTypes.split(/\s+/).filter((s) => s.length > 0)) {
      const allowed = ALLOWED_TAGS_BY_TYPE[t];
      if (!allowed) {
        // 未知の epub:type は info（ベンダー拡張やタイポを検出するが、強くは警告しない）
        out.push({
          severity: 'info',
          source: '@kappan/core:a11y',
          message:
            `Unknown epub:type value "${t}" on <${tag}>. ` +
            `Confirm it is from the EPUB Structural Semantics Vocabulary.`,
          range: nullRange(opts.chapterRelativePath),
        });
        continue;
      }
      if (!allowed.has(tag)) {
        out.push({
          severity: 'warning',
          source: '@kappan/core:a11y',
          message:
            `epub:type="${t}" found on <${tag}>; ` +
            `expected one of <${[...allowed].join('> / <')}>. ` +
            `Reading systems may render this incorrectly.`,
          range: nullRange(opts.chapterRelativePath),
        });
      }
    }
  }
  return out;
}

/**
 * ARIA landmark の推奨。本章の章本体に明示的な `role="main"` または `<main>` 要素が
 * 無い場合に hint を出す。スクリーンリーダー利用者にとって章本体の出だしを
 * 識別する起点になる。
 *
 * nav.xhtml（目次）は対象外。
 */
function checkAriaLandmarks(opts: AccessibilityCheckOptions): Diagnostic[] {
  if (opts.isNav) return [];
  const xhtml = opts.xhtml;
  const hasMain = /<main\b/.test(xhtml) || /role="main"/.test(xhtml);
  // 章本体らしい構造（少なくとも h1 が存在する）を持つ場合のみ推奨する。
  if (!hasMain && /<h1\b/.test(xhtml)) {
    return [
      {
        severity: 'hint',
        source: '@kappan/core:a11y',
        message:
          `No <main> element or role="main" landmark detected. ` +
          `Adding a main landmark helps assistive tech identify the body of the chapter.`,
        range: nullRange(opts.chapterRelativePath),
      },
    ];
  }
  return [];
}

/**
 * テーマ stylesheet を読んで、本文と背景色のコントラスト比が WCAG 2.1 AA を満たすか
 * 簡易チェックする。CSS パーサは持たないため、CSS カスタムプロパティ（--*-text と
 * --*-bg）と body の `color` / `background` 宣言のみを対象にする。現実的な
 * 範囲では「テーマ作者が壊した時の早期検出」目的。本格チェックは ACE 側の役目。
 */
function checkContrastFromStylesheet(opts: AccessibilityCheckOptions): Diagnostic[] {
  if (!opts.stylesheet) return [];
  const cssVars = extractCssVariables(opts.stylesheet);
  const fg = resolveColor(cssVars, opts.stylesheet, [
    /\bbody\s*\{[^}]*?color\s*:\s*([^;}]+)/i,
    // CSS カスタムプロパティ命名規約：--*-text を本文色とみなす
    /var\(--[a-z0-9-]*text\)/i,
  ]);
  const bg = resolveColor(cssVars, opts.stylesheet, [
    /\bbody\s*\{[^}]*?background(?:-color)?\s*:\s*([^;}]+)/i,
    /var\(--[a-z0-9-]*bg\)/i,
  ]);
  if (!fg || !bg) return [];
  const ratio = contrastRatio(fg, bg);
  if (ratio === null) return [];
  if (ratio < 4.5) {
    return [
      {
        severity: 'warning',
        source: '@kappan/core:a11y',
        message:
          `Body text contrast ratio ${ratio.toFixed(2)}:1 is below WCAG 2.1 AA (4.5:1). ` +
          `Foreground=${formatRgb(fg)}, background=${formatRgb(bg)}. ` +
          `Consider darkening text or lightening background.`,
        range: nullRange(opts.chapterRelativePath),
      },
    ];
  }
  return [];
}

function nullRange(file: string) {
  return {
    file,
    start: { line: 0, column: 0 },
    end: { line: 0, column: 0 },
  };
}

/* ============================== color helpers ============================== */

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function extractCssVariables(css: string): Map<string, string> {
  const out = new Map<string, string>();
  // :root { --foo: #bar; } を抽出する。複数 :root も処理。
  const ROOT_RE = /:root\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = ROOT_RE.exec(css)) !== null) {
    const body = m[1] ?? '';
    const VAR_RE = /(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);?/g;
    let v: RegExpExecArray | null;
    while ((v = VAR_RE.exec(body)) !== null) {
      out.set(v[1]!, (v[2] ?? '').trim());
    }
  }
  return out;
}

function resolveColor(
  vars: Map<string, string>,
  css: string,
  patterns: readonly RegExp[],
): Rgb | null {
  for (const pat of patterns) {
    const m = css.match(pat);
    if (!m) continue;
    const raw = (m[1] ?? m[0]).trim();
    const c = parseColor(raw, vars);
    if (c) return c;
  }
  return null;
}

function parseColor(value: string, vars: Map<string, string>): Rgb | null {
  let v = value.trim();
  // var(--foo) 再帰解決
  const varMatch = v.match(/var\((--[a-zA-Z0-9-]+)\)/);
  if (varMatch) {
    const resolved = vars.get(varMatch[1]!);
    if (!resolved) return null;
    return parseColor(resolved, vars);
  }
  // #rgb / #rrggbb
  const hex = v.match(/^#([0-9a-fA-F]{3,8})/);
  if (hex) {
    const h = hex[1]!;
    if (h.length === 3) {
      return {
        r: parseInt(h[0]! + h[0]!, 16),
        g: parseInt(h[1]! + h[1]!, 16),
        b: parseInt(h[2]! + h[2]!, 16),
      };
    }
    if (h.length === 6 || h.length === 8) {
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
      };
    }
  }
  // rgb(...) / rgba(...)
  const rgb = v.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) {
    return {
      r: Number.parseInt(rgb[1]!, 10),
      g: Number.parseInt(rgb[2]!, 10),
      b: Number.parseInt(rgb[3]!, 10),
    };
  }
  // 名前付き色は最小限のサポート
  const named: Record<string, Rgb> = {
    black: { r: 0, g: 0, b: 0 },
    white: { r: 255, g: 255, b: 255 },
    red: { r: 255, g: 0, b: 0 },
    green: { r: 0, g: 128, b: 0 },
    blue: { r: 0, g: 0, b: 255 },
    gray: { r: 128, g: 128, b: 128 },
    grey: { r: 128, g: 128, b: 128 },
    transparent: { r: 255, g: 255, b: 255 }, // 透明は白扱い（保守的）
  };
  const lower = v.toLowerCase();
  return named[lower] ?? null;
}

function relativeLuminance({ r, g, b }: Rgb): number {
  // WCAG 2.x: sRGB → 線形 → 重み付け
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(fg: Rgb, bg: Rgb): number | null {
  const lfg = relativeLuminance(fg);
  const lbg = relativeLuminance(bg);
  const lighter = Math.max(lfg, lbg);
  const darker = Math.min(lfg, lbg);
  return (lighter + 0.05) / (darker + 0.05);
}

function formatRgb({ r, g, b }: Rgb): string {
  return `rgb(${r}, ${g}, ${b})`;
}

/* ============================== exports for tests ============================== */

/**
 * テスト用に色解析・コントラスト計算を export する。
 *
 * 通常のビルドパイプラインは `checkChapterAccessibility` だけを使う想定。
 */
export const __internal = {
  parseColor,
  contrastRatio,
  relativeLuminance,
  extractCssVariables,
};

/**
 * accessibilityFeature の自動推定。
 * 「自動・半自動で保証する」項目に対応する。
 */
export function inferAccessibilityFeatures(xhtmlList: readonly string[]): readonly string[] {
  const features = new Set<string>(['tableOfContents', 'structuralNavigation']);

  for (const xhtml of xhtmlList) {
    // 画像があり、すべて alt 付き（または role=presentation） → alternativeText
    IMG_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    let hasImages = false;
    let allHaveAlt = true;
    while ((match = IMG_RE.exec(xhtml)) !== null) {
      hasImages = true;
      const attrs = match[1] ?? '';
      const role = attrs.match(ROLE_RE)?.[1];
      const altMatch = attrs.match(ALT_RE);
      if (role !== 'presentation' && (!altMatch || altMatch[1] === '')) {
        allHaveAlt = false;
      }
    }
    if (hasImages && allHaveAlt) {
      features.add('alternativeText');
    }

    // MathML が含まれる → MathML feature
    if (/<math\b/.test(xhtml)) {
      features.add('MathML');
    }
  }

  return [...features];
}

/**
 * accessMode の自動推定。XHTML 内のコンテンツから視覚要素の有無を判定する。
 */
export function inferAccessModes(xhtmlList: readonly string[]): readonly string[] {
  const modes = new Set<string>(['textual']);
  for (const xhtml of xhtmlList) {
    if (/<img\b/.test(xhtml) || /<svg\b/.test(xhtml)) {
      modes.add('visual');
    }
  }
  return [...modes];
}
