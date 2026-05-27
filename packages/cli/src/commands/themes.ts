import path from 'node:path';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { Command, Option } from 'clipanion';

/**
 * `kappan themes` — 公式テーマの一覧とプレビューを提供する。
 *
 * 公式テーマ 5 種：
 *   - mono     ★ 提供済み：黒墨ベース、最小ノイズ、汎用横組み
 *   - saiun    ★ 提供済み：青系アクセント、明朝＋サンセリフ、技術書向け
 *   - sumi     ☆ 予定：縦組み専用、和文小説向け
 *   - kohaku   ☆ 予定：暖色アクセント、ノンフィクション向け
 *   - hibana   ☆ 予定：彩度高め、実用書・マンガ向け
 *
 * 現状は mono / saiun のみ実装。他は ☆（skeleton 状態）として表示。
 */
export class ThemesListCommand extends Command {
  static override paths = [['themes', 'list'], ['themes']];

  static override usage = Command.Usage({
    description: 'List the official Kappan themes.',
    examples: [['List all themes', 'kappan themes list']],
  });

  async execute(): Promise<number> {
    const themes = listThemes();
    this.context.stdout.write(`Kappan Official Themes\n\n`);
    this.context.stdout.write(`  Status legend:  ★ available   ☆ planned (skeleton)\n\n`);
    const nameWidth = Math.max(...themes.map((t) => t.name.length));
    for (const t of themes) {
      const sym = t.status === 'available' ? '★' : '☆';
      const pad = ' '.repeat(nameWidth - t.name.length);
      this.context.stdout.write(`  ${sym}  ${t.name}${pad}   ${t.summary}\n`);
    }
    this.context.stdout.write(`\nUse 'kappan themes preview <name>' to open a preview.\n`);
    return 0;
  }
}

/**
 * `kappan themes preview <name>` — そのテーマ単独で表示できる小さな HTML を
 * 一時 HTTP サーバで提供する。テーマの CSS が「テーマ本来の見た目」を出すための
 * 最小プレビュー。
 */
export class ThemesPreviewCommand extends Command {
  static override paths = [['themes', 'preview']];

  static override usage = Command.Usage({
    description: 'Open a preview HTML for a specific theme in your browser.',
    examples: [
      ['Preview saiun', 'kappan themes preview saiun'],
      ['Preview mono on a different port', 'kappan themes preview mono --port 5174'],
    ],
  });

  name = Option.String({ required: true });

  port = Option.String('--port,-p', '5180');
  host = Option.String('--host', '127.0.0.1');

  async execute(): Promise<number> {
    const themes = listThemes();
    const theme = themes.find((t) => t.name === this.name);
    if (!theme) {
      this.context.stderr.write(
        `✗ Unknown theme "${this.name}". Available: ${themes.map((t) => t.name).join(', ')}\n`,
      );
      return 2;
    }
    if (theme.status !== 'available') {
      this.context.stderr.write(
        `✗ Theme "${this.name}" is still a skeleton (planned for M2-A or later).\n`,
      );
      return 2;
    }

    const assets = await loadThemeAssets(theme);
    if (assets === null) {
      this.context.stderr.write(
        `✗ Could not load theme assets for "${this.name}" — package not installed?\n`,
      );
      return 3;
    }

    const host = this.host;
    const port = Number.parseInt(this.port, 10);

    const html = renderPreviewHtml(theme, assets);
    const server = createServer((req, res) => {
      const url = req.url ?? '/';
      if (url === '/' || url === '/index.html') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(html);
        return;
      }
      const stripped = url.replace(/^\/+/, '');
      const asset = assets.files.get(stripped);
      if (asset) {
        res.writeHead(200, { 'content-type': contentTypeFor(stripped) });
        res.end(asset);
        return;
      }
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
    });

    await new Promise<void>((resolve) => server.listen(port, host, resolve));
    this.context.stdout.write(
      `✓ Theme preview for '${theme.name}' running at http://${host}:${port}/\n` +
        `  Press Ctrl+C to stop.\n`,
    );

    await new Promise<void>((resolve) => {
      const stop = () => {
        server.close(() => resolve());
      };
      process.once('SIGINT', stop);
      process.once('SIGTERM', stop);
    });
    return 0;
  }
}

interface ThemeInfo {
  readonly name: string;
  readonly status: 'available' | 'planned';
  readonly summary: string;
  /** 実装済みテーマの動的 import パス（@kappan/themes-*）。planned なら undefined */
  readonly importSpecifier?: string;
  /** ファクトリ関数名（例 'mono', 'saiun'） */
  readonly factoryName?: string;
}

export function listThemes(): readonly ThemeInfo[] {
  return [
    {
      name: 'mono',
      status: 'available',
      summary: 'Minimal black on white, works for any genre. (M0)',
      importSpecifier: '@kappan/themes-mono',
      factoryName: 'mono',
    },
    {
      name: 'saiun',
      status: 'available',
      summary: 'Blue accent, mincho + sans-serif. For tech books. (M1-D)',
      importSpecifier: '@kappan/themes-saiun',
      factoryName: 'saiun',
    },
    {
      name: 'sumi',
      status: 'planned',
      summary: 'Vertical writing, ink-wash novel theme. (M2-A)',
    },
    {
      name: 'kohaku',
      status: 'planned',
      summary: 'Warm accent, non-fiction theme. (M2-A)',
    },
    {
      name: 'hibana',
      status: 'planned',
      summary: 'Vivid accent, manga / practical theme. (M2-A)',
    },
  ];
}

interface LoadedThemeAssets {
  readonly files: Map<string, Uint8Array>;
}

async function loadThemeAssets(theme: ThemeInfo): Promise<LoadedThemeAssets | null> {
  if (!theme.importSpecifier || !theme.factoryName) return null;
  try {
    const mod = (await import(theme.importSpecifier)) as Record<string, unknown>;
    const factory = mod[theme.factoryName];
    if (typeof factory !== 'function') return null;
    const instance = (factory as () => unknown)() as {
      getAssets: () => Promise<Map<string, Uint8Array>>;
    };
    const files = await instance.getAssets();
    return { files };
  } catch {
    return null;
  }
}

function renderPreviewHtml(theme: ThemeInfo, assets: LoadedThemeAssets): string {
  const links: string[] = [];
  for (const key of assets.files.keys()) {
    if (key.endsWith('.css')) {
      links.push(`<link rel="stylesheet" href="/${escapeAttr(key)}" />`);
    }
  }

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8" />
<title>Kappan Theme Preview — ${escapeHtml(theme.name)}</title>
${links.join('\n')}
<style>
  body { padding: 2rem; max-width: 48rem; margin: 0 auto; }
  .kappan-preview-meta { color: #888; font-size: 0.85rem; margin-bottom: 2rem; }
</style>
</head>
<body>
<p class="kappan-preview-meta">
  Kappan theme preview — <strong>${escapeHtml(theme.name)}</strong>
  · <small>${escapeHtml(theme.summary)}</small>
</p>

<h1>テーマ <code>${escapeHtml(theme.name)}</code> のプレビュー</h1>

<p>
  これは <code>kappan themes preview ${escapeHtml(theme.name)}</code> によって
  生成された一時 HTML です。本物の章ファイルではなく、テーマの CSS が当たった
  ときの見た目を確認するための最小サンプルです。
</p>

<h2>本文サンプル（明朝が当たるはずです）</h2>

<p>
  Kappan（活版）は、Markdown を入力として日本語組版・アクセシビリティ・モダンタイポグラフィを
  満たす商業品質の EPUB 3.3 を生成する次世代ツールです。AST 中心主義、Web 標準準拠、
  日本語組版のファーストクラス対応、アクセシビリティの非妥協、徹底した仕上がり品質を理念に置きます。
</p>

<p>
  ルビ：<ruby>活版<rt>かっぱん</rt></ruby>。圏点：<span class="kenten">重要</span>。
  強調：<strong>太字</strong> と <em>斜体</em>。打ち消し：<del>古い情報</del>。
</p>

<h3>見出し（H3）</h3>

<p>段落の見え方を確認します。行間と字間がテーマの個性です。</p>

<h2>コードブロック</h2>

<pre><code class="language-typescript">export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
</code></pre>

<h2>引用と注意</h2>

<blockquote>
  <p>最良のツールは、書き手が道具のことを忘れて文章に集中できるものである。</p>
</blockquote>

<h2>テーマ詳細</h2>

<ul>
  <li>パッケージ：<code>${escapeHtml(theme.importSpecifier ?? '—')}</code></li>
  <li>状態：<strong>${escapeHtml(theme.status)}</strong></li>
  <li>CSS ファイル数：<strong>${assets.files.size}</strong></li>
</ul>

</body>
</html>
`;
}

function contentTypeFor(filename: string): string {
  if (filename.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filename.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (filename.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filename.endsWith('.png')) return 'image/png';
  if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) return 'image/jpeg';
  if (filename.endsWith('.svg')) return 'image/svg+xml';
  if (filename.endsWith('.woff2')) return 'font/woff2';
  return 'application/octet-stream';
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return c;
    }
  });
}

function escapeAttr(s: string): string {
  return s.replace(/[<>"]/g, (c) =>
    c === '<' ? '%3C' : c === '>' ? '%3E' : c === '"' ? '%22' : c,
  );
}

// path / existsSync / readFile / 一部の import は将来的な「ファイルベース theme manifest」のために残置。
void path;
void existsSync;
void readFile;
