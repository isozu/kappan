import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkDirective from 'remark-directive';
import remarkRehype from 'remark-rehype';
import rehypeFormat from 'rehype-format';
import rehypeStringify from 'rehype-stringify';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeRaw from 'rehype-raw';
import { visit } from 'unist-util-visit';
import type { Root as MdastRoot } from 'mdast';
import type { Root as HastRoot, Element, ElementContent } from 'hast';

const XHTML_DOCTYPE = `<?xml version="1.0" encoding="UTF-8"?>\n`;

/**
 * HTML 埋め込みの許可レベル（KappanConfig.unsafeHtml と一致）。
 *
 * - `false`（デフォルト）: 生 HTML を一切出力に含めない。
 * - `'sanitized'`: rehype-sanitize 経由で安全な要素・属性のみ通す。
 * - `'trusted'`: 入力 HTML を素通し（信頼できるソース専用、自己責任）。
 */
export type UnsafeHtmlMode = false | 'sanitized' | 'trusted';

export interface RenderChapterOptions {
  readonly title: string;
  readonly language: string;
  readonly stylesheetHref: string;
  /**
   * HTML 埋め込みの許可レベル。`KappanConfig.unsafeHtml` の値を渡す。
   * `buildBook` から自動的に渡されるが、`buildChapter` 経由のプレビュー等でも
   * 同じ値を渡す必要がある。
   */
  readonly unsafeHtml: UnsafeHtmlMode;
  /**
   * 組み方向。`'vertical-rl'` のとき `<html dir="rtl">` と
   * `<body class="kappan-vertical-rl">` を出力する。横組み（既定）では
   * 一切 class/dir を付けない（既存 golden の後方互換を守る）。
   * 実際の縦組みレイアウトはテーマ CSS（`body.kappan-vertical-rl { writing-mode: ... }`）が担う。
   */
  readonly writingMode?: 'horizontal-tb' | 'vertical-rl';
  /** mdast 構築直後に呼ばれる。プラグインがここで AST を変換できる */
  readonly onMdast?: (tree: MdastRoot) => Promise<void> | void;
  /** hast 構築直後に呼ばれる。プラグインがここで装飾を加えられる */
  readonly onHast?: (tree: HastRoot) => Promise<void> | void;
}

// remark-directive を有効化すると `:::name[label]{#id .class}` が
// `containerDirective` / `leafDirective` / `textDirective` ノードとして mdast に出る。
// これ自体は出力に何も足さない（hName 未設定のディレクティブは描画されない）。
// `plugin-admonition` / `plugin-column` などが onMdast でこれらを拾い、
// `data.hName` / `data.hProperties` を設定して `<aside>` 等に変換する。
const parseProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm, { singleTilde: false })
  .use(remarkDirective);

/**
 * Markdown 文字列を mdast にだけ変換する（プラグイン適用前の素の木）。
 *
 * `onMdastAllChapters` フックを実現するため、`buildBook` が
 * 章単位のレンダリングを「parse → 章ごと onMdast → 全章一括 onMdastAllChapters →
 * 章ごと続行（onHast 〜 stringify）」の 4 ステップに分解できるよう公開する。
 */
export function parseMarkdownToMdast(markdown: string): MdastRoot {
  const tree = parseProcessor.parse(markdown) as MdastRoot;
  healInlineDirectives(tree as unknown as DirectiveParent);
  return tree;
}

/**
 * remark-directive は `:::name`（containerDirective）だけでなく、行中の `:name`
 * （textDirective）と `::name`（leafDirective）も解釈する。Kappan が使うのは
 * **コンテナディレクティブのみ**で、行中の `:name` は意図しない解釈になる
 * （特に Pandoc-crossref 互換の `[@fig:id]` / `[@col:id]` の `:id` が
 * textDirective として食われ、参照記法が壊れる）。
 *
 * そこで parse 直後に、text / leaf ディレクティブを元のソース文字列に戻し
 * （`:name[label]{attrs}` を復元）、隣接する text ノードを連結して
 * `[@fig:id]` のような参照が 1 つの text ノードに収まるようにする。
 * コンテナディレクティブ（`:::`）はそのまま残し、子を再帰的に healing する。
 */
interface DirectiveNode {
  type: string;
  name?: string;
  attributes?: Record<string, string | null | undefined> | null;
  value?: string;
  children?: DirectiveNode[];
}
type DirectiveParent = DirectiveNode & { children: DirectiveNode[] };

function reconstructDirectiveSource(node: DirectiveNode): string {
  const marker = node.type === 'leafDirective' ? '::' : ':';
  let s = `${marker}${node.name ?? ''}`;
  if (node.children && node.children.length > 0) {
    s += `[${directiveChildrenToText(node.children)}]`;
  }
  const attrs = node.attributes;
  if (attrs) {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null) continue;
      if (k === 'id') parts.push(`#${v}`);
      else if (k === 'class') {
        for (const c of String(v).split(/\s+/).filter(Boolean)) parts.push(`.${c}`);
      } else parts.push(`${k}="${v}"`);
    }
    if (parts.length > 0) s += `{${parts.join(' ')}}`;
  }
  return s;
}

function directiveChildrenToText(nodes: readonly DirectiveNode[]): string {
  let s = '';
  for (const n of nodes) {
    if (n.type === 'text') s += n.value ?? '';
    else if (n.type === 'textDirective' || n.type === 'leafDirective')
      s += reconstructDirectiveSource(n);
    else if (n.children) s += directiveChildrenToText(n.children);
  }
  return s;
}

function healInlineDirectives(parent: DirectiveParent): void {
  const next: DirectiveNode[] = [];
  const pushText = (value: string): void => {
    const last = next[next.length - 1];
    if (last && last.type === 'text') last.value = (last.value ?? '') + value;
    else next.push({ type: 'text', value });
  };
  for (const child of parent.children) {
    if (child.type === 'textDirective' || child.type === 'leafDirective') {
      pushText(reconstructDirectiveSource(child));
      continue;
    }
    // containerDirective はそのまま残すが、子は healing する。
    if (child.children) healInlineDirectives(child as DirectiveParent);
    if (child.type === 'text') pushText(child.value ?? '');
    else next.push(child);
  }
  parent.children = next;
}

interface FootnoteLabels {
  /** 脚注セクションの見出しテキスト */
  readonly label: string;
  /** 各脚注の戻りリンク（↩）の aria-label */
  readonly backLabel: string;
}

/**
 * 言語コードから脚注ラベルを決める。日本語（`ja`）は「脚注」、それ以外は
 * mdast-util-to-hast の既定と同じ英語ラベルにフォールバックする。
 */
function footnoteLabelsFor(language: string): FootnoteLabels {
  if (language.toLowerCase().startsWith('ja')) {
    return { label: '脚注', backLabel: '本文に戻る' };
  }
  return { label: 'Footnotes', backLabel: 'Back to content' };
}

/**
 * EPUB 3.3 の XHTML で許容される要素・属性を含む拡張 sanitize スキーマ。
 *
 * GitHub 互換のデフォルトに加えて：
 *   - `epub:type` 属性（脚注セクション / aside 等のセマンティクス）
 *   - `aside`、`nav`、`figure`、`figcaption`、`mark`、`small`、`u`、`time`、`abbr` 等
 *   - `<a href="#...">` の内部リンク（脚注参照用、GFM 既定では protocol 制限あり）
 *
 * アクセシビリティ要件と EPUB 3.3 コア仕様で許される範囲に限定する。
 */
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    'aside',
    'nav',
    'figure',
    'figcaption',
    'mark',
    'small',
    'time',
    'abbr',
    'u',
    'cite',
    'wbr',
    'bdi',
    'bdo',
  ],
  attributes: {
    ...(defaultSchema.attributes ?? {}),
    '*': [...((defaultSchema.attributes ?? {})['*'] ?? []), 'epub:type', 'role'],
    aside: ['epub:type'],
    nav: ['epub:type'],
    section: [...((defaultSchema.attributes ?? {}).section ?? []), 'epub:type'],
    a: [...((defaultSchema.attributes ?? {}).a ?? []), 'epub:type'],
    time: ['dateTime'],
    abbr: ['title'],
  },
  // 脚注リンク（#user-content-fn-1 等）の内部リンクを許可する。
  // デフォルト schema は href を http/https/mailto 等の protocol に制限している
  // が、ハッシュ内部リンクは protocol を持たないので protocols.href から除外する
  // のではなく、href を allow list に既に含めているのでそのまま通る。
  //
  // clobberPrefix を空にする：デフォルトの 'user-content-' は ID を二重前置して
  // しまい、remark-gfm が既に付けたプレフィックスと衝突する（href の #user-content-fn-1
  // が指す先が #user-content-user-content-fn-1 になり、内部リンクが壊れる）。
  clobberPrefix: '',
  clobber: [],
};

/**
 * Markdown 1章 → XHTML 文字列。
 * CommonMark+GFM 基本記法を処理する。
 * プラグインの onMdast / onHast フックは opts 経由で受け取る。
 *
 * `unsafeHtml` モード：
 *   - `false`: remark-rehype に `allowDangerousHtml: false` を渡す
 *   - `'sanitized'`: `allowDangerousHtml: true` + `rehype-sanitize` を後段で挿入
 *   - `'trusted'`: `allowDangerousHtml: true` のみ（sanitize なし、自己責任）
 */
export async function renderChapter(markdown: string, opts: RenderChapterOptions): Promise<string> {
  // 1. Markdown → mdast（text/leaf ディレクティブの healing 込み）
  const mdast = parseMarkdownToMdast(markdown);

  // 2. プラグインの onMdast を呼ぶ
  if (opts.onMdast) await opts.onMdast(mdast);

  return renderMdastToXhtml(mdast, opts);
}

/**
 * 既に解析・前処理（onMdast 適用済み）の mdast を XHTML 文字列に変換する。
 *
 * `buildBook` のフローで、`onMdastAllChapters` フックを実行した後に
 * 各章を続行（mdast→hast→onHast→stringify）するために使う。
 */
export async function renderMdastToXhtml(
  mdast: MdastRoot,
  opts: RenderChapterOptions,
): Promise<string> {
  const allowDangerous = opts.unsafeHtml !== false;
  const fn = footnoteLabelsFor(opts.language);
  const mdastToHast = unified().use(remarkRehype, {
    allowDangerousHtml: allowDangerous,
    // GFM 脚注セクションの見出しラベルを言語に合わせる。mdast-util-to-hast の
    // 既定は英語 "Footnotes" ＋ class="sr-only"（視覚的に隠す）だが、Kappan は
    // 「脚注」を可視の章末見出しとして出す（リフロー型リーダーで区切りが分かるように）。
    // class は付けない（`id="footnote-label"` が常に残るのでテーマはそれで装飾する。
    // sanitized モードでは許可外 class が除去され空 class="" が残るのを避ける）。
    footnoteLabel: fn.label,
    footnoteLabelTagName: 'h2',
    footnoteLabelProperties: {},
    footnoteBackLabel: fn.backLabel,
  });

  // 3. mdast → hast
  let hast = (await mdastToHast.run(mdast)) as HastRoot;

  // 3a. unsafeHtml が有効なとき、生 HTML（type: 'raw' ノード）を hast 要素に
  // 展開する必要がある。remark-rehype の `allowDangerousHtml: true` は raw を
  // 通すだけで、parse5 を使って実 hast tree にするのは rehype-raw の役割。
  //
  // 'sanitized': rehype-raw で展開 → rehype-sanitize で安全な要素のみ残す
  // 'trusted': rehype-raw で展開のみ（sanitize なし、自己責任）
  //
  // 'false' のときは何もしない。`allowDangerousHtml: false` で raw ノードは
  // 生成されていない（remark-rehype が破棄済み）。
  if (opts.unsafeHtml === 'sanitized') {
    hast = unified().use(rehypeRaw).use(rehypeSanitize, sanitizeSchema).runSync(hast) as HastRoot;
  } else if (opts.unsafeHtml === 'trusted') {
    hast = unified().use(rehypeRaw).runSync(hast) as HastRoot;
  }

  // 4. <html> でラップ（onHast の前に行う）。
  //
  // reader-shim 等のプラグインは `onHast` で `<body>` 要素に class を付与する
  // 設計だが、従来は wrap が onHast の後だったため body が存在せず、reader-shim の
  // body class 付与が一度も発火していなかった（横組み時代からの潜在バグ）。
  // wrap を onHast の前に移すことで、プラグインが body/head を含む完全な hast tree を
  // 受け取れる。kinsoku（p/li 探索）等は body 内でも従来どおり動く。
  //
  // 縦組み時のみ body に kappan-vertical-rl class を付与する。
  // 横組み（既定）では一切付けず、既存 golden の XHTML を 1 バイトも変えない。
  //
  // NOTE: <html dir="rtl"> は設定しない。
  //   dir="rtl" は Unicode BidiAlgorithm のインライン方向制御（アラビア語/ヘブライ語用）
  //   であり、日本語縦組みとは無関係。設定するとブロック軸の block-start が右端になり、
  //   短い段落の文字が 地（ページ下端）に寄る致命的バグが発生する。
  //   ページめくり方向（右→左）は buildBook.ts の OPF spine で
  //   page-progression-direction="rtl" として正しく設定済み。
  const isVertical = opts.writingMode === 'vertical-rl';
  const htmlProperties: Record<string, string> = {
    xmlns: 'http://www.w3.org/1999/xhtml',
    'xmlns:epub': 'http://www.idpf.org/2007/ops',
    'xml:lang': opts.language,
    lang: opts.language,
  };
  const wrapped: HastRoot = {
    type: 'root',
    children: [
      {
        type: 'element',
        tagName: 'html',
        properties: htmlProperties,
        children: [
          {
            type: 'element',
            tagName: 'head',
            properties: {},
            children: [
              { type: 'element', tagName: 'meta', properties: { charset: 'utf-8' }, children: [] },
              {
                type: 'element',
                tagName: 'title',
                properties: {},
                children: [{ type: 'text', value: opts.title }],
              },
              {
                type: 'element',
                tagName: 'link',
                properties: { rel: 'stylesheet', type: 'text/css', href: opts.stylesheetHref },
                children: [],
              },
            ],
          },
          {
            type: 'element',
            tagName: 'body',
            properties: isVertical ? { className: ['kappan-vertical-rl'] } : {},
            children: hast.children.filter((n): n is ElementContent => n.type !== 'doctype'),
          },
        ],
      },
    ],
  };

  // 5. プラグインの onHast を呼ぶ（wrap 後の完全な hast tree。body/head を含む）。
  // reader-shim はここで body を visit して `reader-<profile>` class を付ける。
  if (opts.onHast) await opts.onHast(wrapped);

  // 6. GFM 脚注 `<section data-footnotes>` を `<aside epub:type="footnotes">` に
  // 書き換える。wrap 後の tree 全体に対して走査する。
  enhanceFootnotesSection(wrapped);

  // 7. hast → XHTML 文字列
  const html = await unified()
    .use(rehypeFormat)
    .use(rehypeStringify, {
      closeSelfClosing: true,
      closeEmptyElements: true,
      collapseEmptyAttributes: false,
      space: 'html',
      voids: [],
      // 生 HTML（type: 'raw' ノード）が許可されている場合はそのまま出力する。
      // sanitized モードでは rehype-sanitize が raw ノードを既に処理しているため、
      // ここでは無条件に true で良い。`false` だと <em>...</em> 等のリテラル文字列が
      // エスケープされてしまう。
      allowDangerousHtml: opts.unsafeHtml !== false,
    })
    .stringify(wrapped);

  return XHTML_DOCTYPE + xhtmlifyAttributes(String(html));
}

/**
 * GFM 脚注セクション（`<section class="footnotes" data-footnotes>`）を
 * EPUB 互換の `<aside epub:type="footnotes">` 構造に変換する。
 *
 * - 外側を `<section>` → `<aside epub:type="footnotes">` に置き換える
 * - 内部の `<h2 id="footnote-label">` はそのまま保持（ラベルは言語別・可視。
 *   テキストとクラスは remark-rehype の footnoteLabel オプションで設定済み）
 * - 各 `<li id="user-content-fn-N">` に `epub:type="footnote"` 属性を付与
 * - 既存の `data-footnotes` / `data-footnote-ref` / `data-footnote-backref` 属性は
 *   後段の `xhtmlifyDataAttributes` で XHTML 値付き化される
 *
 * EPUB 3.3 で `<section>` のままでも valid だが、`<aside epub:type="footnotes">`
 * とすることで Apple Books / Thorium / Kindle が脚注をポップアップ表示できる。
 */
function enhanceFootnotesSection(tree: HastRoot): void {
  visit(tree, 'element', (node: Element) => {
    if (node.tagName !== 'section') return;
    const props = node.properties ?? {};
    // remark-gfm の出力は `dataFootnotes: true`（hast property 形式）または
    // className に 'footnotes' を含む形で出る
    const isFootnoteSection =
      props['dataFootnotes'] === true ||
      props['dataFootnotes'] === '' ||
      (Array.isArray(props['className']) && props['className'].includes('footnotes'));
    if (!isFootnoteSection) return;

    // <section> → <aside>
    node.tagName = 'aside';
    node.properties = {
      ...props,
      'epub:type': 'footnotes',
    };

    // 内部の <li id="*fn-*"> を見つけて epub:type="footnote" を付与する。
    // rehype-sanitize の clobberPrefix が走るとid が "user-content-user-content-fn-*"
    // のように二重前置される場合があるため、`/fn-/` の包含で判定する。
    for (const child of node.children) {
      if (child.type !== 'element' || child.tagName !== 'ol') continue;
      for (const li of child.children) {
        if (li.type !== 'element' || li.tagName !== 'li') continue;
        const liProps = li.properties ?? {};
        const id = typeof liProps['id'] === 'string' ? liProps['id'] : undefined;
        if (id && /fn-/.test(id)) {
          li.properties = { ...liProps, 'epub:type': 'footnote' };
        }
      }
    }
  });

  // 脚注参照リンク（<a data-footnote-ref>）に epub:type="noteref" を付与する
  visit(tree, 'element', (node: Element) => {
    if (node.tagName !== 'a') return;
    const props = node.properties ?? {};
    if (props['dataFootnoteRef'] === true || props['dataFootnoteRef'] === '') {
      node.properties = { ...props, 'epub:type': 'noteref' };
    }
  });
}

function xhtmlifyAttributes(html: string): string {
  return convertAlignToStyle(xhtmlifyDataAttributes(xhtmlifyBooleanAttributes(html)));
}

/**
 * `data-*` 属性を XHTML 形式に正規化する。
 *
 * 2 つのケースに対応：
 *   1. 値なし（`<a data-footnote-ref>`）→ `data-footnote-ref="data-footnote-ref"`
 *   2. 空値（`<a data-footnote-ref="">`）→ `data-footnote-ref="data-footnote-ref"`
 *
 * remark-rehype は (1) を、rehype-raw 経由は (2) を出すため両方を扱う。
 * XHTML パーサは値なし属性を invalid と扱うので、boolean データ属性を XML 互換の
 * 自己名値形式に統一する。
 */
const DATA_ATTR_NO_VALUE_RE = /(\s)(data-[a-z][a-z0-9-]*)(?=\s|\/?>)/g;
const DATA_ATTR_EMPTY_VALUE_RE = /(\s)(data-[a-z][a-z0-9-]*)=""/g;

export function xhtmlifyDataAttributes(html: string): string {
  return html
    .replace(
      DATA_ATTR_NO_VALUE_RE,
      (_match, lead: string, attr: string) => `${lead}${attr}="${attr}"`,
    )
    .replace(
      DATA_ATTR_EMPTY_VALUE_RE,
      (_match, lead: string, attr: string) => `${lead}${attr}="${attr}"`,
    );
}

/**
 * HTML5 で許される boolean 属性の値なし表記（`<input checked>`）を
 * XHTML 互換の値付き表記（`<input checked="checked">`）に書き換える。
 *
 * EPUB 3 は XHTML パーサで処理されるため、boolean 属性に値が必須。
 */
const XHTML_BOOLEAN_ATTRS = [
  'checked',
  'disabled',
  'readonly',
  'required',
  'selected',
  'hidden',
  'multiple',
  'defer',
  'async',
  'autofocus',
  'autoplay',
  'controls',
  'loop',
  'muted',
  'open',
  'reversed',
  'novalidate',
  'formnovalidate',
];

const BOOLEAN_ATTR_RE = new RegExp(`(\\s)(${XHTML_BOOLEAN_ATTRS.join('|')})(?=\\s|/?>)`, 'g');

export function xhtmlifyBooleanAttributes(html: string): string {
  return html.replace(BOOLEAN_ATTR_RE, (_match, lead: string, attr: string) => {
    return `${lead}${attr}="${attr}"`;
  });
}

/**
 * GFM テーブルの `align="..."` 属性を XHTML5 互換の `style="text-align:..."` に変換する。
 * EPUBCheck が align 属性を XHTML5 で無効と判定するため。
 */
const ALIGN_ATTR_RE = /\balign="(left|center|right|justify)"/g;

export function convertAlignToStyle(html: string): string {
  return html.replace(ALIGN_ATTR_RE, (_match, value: string) => {
    return `style="text-align: ${value}"`;
  });
}
