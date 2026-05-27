#!/usr/bin/env node
/**
 * 縦組みレイアウトのヘッドレス検証スクリプト（M2-A）。
 *
 * Thorium reader は公式にヘッドレス起動を提供しないため、その描画エンジンに近い
 * Chromium（Chrome for Testing）をヘッドレスで起動し、縦組みフィクスチャの
 * content XHTML を `getBoundingClientRect` でレイアウト検証する。
 * RDD §11.3 の「Thorium 近似」検証層に相当する（実フォントでの最終目視はユーザー領域）。
 *
 * 展開した EPUB は **localhost HTTP サーバ**で配信して開く。`file://` だと一部の
 * ヘッドレス環境（Playwright MCP 等）でスタイルシートの cssRules が CORS で読めず、
 * 縦組み CSS が当たらないまま検証が偽陽性になることがあるため（dev-vertical-css の
 * 実測知見）。HTTP 配信なら相対 stylesheet・画像も含めて確実にロードされる。
 *
 * 検証項目（計画 Phase 3/4 の受け入れ基準のうち、座標で機械検証できるもの）：
 *   1. body が writing-mode: vertical-rl（本文が縦に流れる：段落の高さ > 幅）
 *   2. 本文が右→左へ流れる（後続段落が先行段落より左にある）
 *   3. コードブロック `<pre>` は横組み（writing-mode: horizontal-tb、RDD §4.2.2 必須）
 *   4. ルビ `<rt>` が親文字の右側に出る
 *      （縦組みの ruby-position は Chromium/Blink では `over` が右側配置になる。
 *       旧ドラフトの `right` は脱落するため、CSS 値ではなく **座標**で検証する＝
 *       テーマ CSS の値の違いに依存しない頑健な assert）。
 *
 * 各章のスクリーンショットを results/<fixture>/thorium/ に保存する。
 *
 * ブラウザは puppeteer-core + ローカルにダウンロード済みの Chrome for Testing を使う
 * （`@daisy/ace-axe-runner-puppeteer` 経由で導入されるバイナリ）。CI では
 * `PUPPETEER_EXECUTABLE_PATH` で明示できる。
 *
 * 用法:
 *   node --import tsx tests/reader-compatibility/scripts/thorium-headless.ts \
 *     [--fixture tests/fixtures/novel-tategumi/kappan.config.ts] \
 *     [--epub path/to/prebuilt.epub] \
 *     [--out tests/reader-compatibility/results/novel-tategumi/thorium] \
 *     [--no-screenshot]
 *
 * デフォルトは novel-tategumi フィクスチャをその場でビルドして検証する。
 * `--epub` を渡すとビルド済み EPUB を直接検証する。
 * 検証失敗時は exit code 1（CI ゲートになる）。
 */

import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as unzipper from 'unzipper';

/** content XHTML を配信するときの MIME（縦組み CSS が確実に当たるよう正しい型を返す）。 */
const MIME_TYPES: Record<string, string> = {
  '.xhtml': 'application/xhtml+xml',
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
  '.xml': 'application/xml',
  '.opf': 'application/oebps-package+xml',
};

/** 展開済み EPUB ディレクトリを localhost で配信する静的サーバを起動し、base URL を返す。 */
async function startStaticServer(rootDir: string): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]!);
    // パストラバーサル防止：rootDir 配下に正規化されることを保証
    const resolved = path.normalize(path.join(rootDir, urlPath));
    if (!resolved.startsWith(rootDir)) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }
    readFile(resolved)
      .then((buf) => {
        const ext = path.extname(resolved).toLowerCase();
        res.setHeader('Content-Type', MIME_TYPES[ext] ?? 'application/octet-stream');
        res.end(buf);
      })
      .catch(() => {
        res.statusCode = 404;
        res.end('Not found');
      });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const addr = server.address();
  if (!addr || typeof addr === 'string')
    throw new Error('HTTP サーバのアドレス取得に失敗しました。');
  return { server, baseUrl: `http://127.0.0.1:${addr.port}` };
}

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..', '..', '..');

interface Args {
  readonly fixture: string;
  readonly epub: string | null;
  readonly out: string;
  readonly screenshot: boolean;
}

function parseArgs(argv: string[]): Args {
  const args = {
    fixture: 'tests/fixtures/novel-tategumi/kappan.config.ts',
    epub: null as string | null,
    out: 'tests/reader-compatibility/results/novel-tategumi/thorium',
    screenshot: true,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--fixture') args.fixture = argv[++i]!;
    else if (argv[i] === '--epub') args.epub = argv[++i]!;
    else if (argv[i] === '--out') args.out = argv[++i]!;
    else if (argv[i] === '--no-screenshot') args.screenshot = false;
  }
  return args;
}

/**
 * ローカルにダウンロード済みの Chrome for Testing 実行ファイルを探す。
 * `PUPPETEER_EXECUTABLE_PATH` が最優先。次に ~/.cache/puppeteer の最新版。
 */
function resolveChromeExecutable(): string {
  const fromEnv = process.env['PUPPETEER_EXECUTABLE_PATH'];
  if (fromEnv && existsSync(fromEnv)) return fromEnv;

  const home = process.env['HOME'] ?? '';
  const cacheBase = path.join(home, '.cache', 'puppeteer', 'chrome');
  if (existsSync(cacheBase)) {
    const versions = readdirSync(cacheBase)
      .filter((d) => /^(mac|linux|win)/.test(d))
      .sort();
    const latest = versions[versions.length - 1];
    if (latest) {
      const candidates = [
        // macOS arm64 / x64
        path.join(
          cacheBase,
          latest,
          'chrome-mac-arm64',
          'Google Chrome for Testing.app',
          'Contents',
          'MacOS',
          'Google Chrome for Testing',
        ),
        path.join(
          cacheBase,
          latest,
          'chrome-mac-x64',
          'Google Chrome for Testing.app',
          'Contents',
          'MacOS',
          'Google Chrome for Testing',
        ),
        // Linux
        path.join(cacheBase, latest, 'chrome-linux64', 'chrome'),
        // Windows
        path.join(cacheBase, latest, 'chrome-win64', 'chrome.exe'),
      ];
      for (const c of candidates) {
        if (existsSync(c)) return c;
      }
    }
  }

  throw new Error(
    'Chrome for Testing が見つかりません。`PUPPETEER_EXECUTABLE_PATH` で実行ファイルを指定するか、' +
      '`npx @puppeteer/browsers install chrome@stable` でダウンロードしてください。',
  );
}

/** EPUB を temp ディレクトリへ展開し、展開先のルートパスを返す。 */
async function unzipEpub(epubPath: string, destDir: string): Promise<void> {
  const directory = await unzipper.Open.file(epubPath);
  for (const file of directory.files) {
    if (file.type !== 'File') continue;
    const outPath = path.join(destDir, file.path);
    await mkdir(path.dirname(outPath), { recursive: true });
    const buf = await file.buffer();
    await writeFile(outPath, buf);
  }
}

interface ChapterCheck {
  readonly file: string;
  readonly bodyWritingMode: string;
  readonly verticalFlow: boolean; // 段落が縦（高さ > 幅）
  readonly rightToLeft: boolean | null; // 後続段落が左にある（段落 2 つ以上で判定）
  readonly preHorizontal: boolean | null; // pre が横組み（pre が無ければ null）
  readonly rubyOnRight: boolean | null; // rt が親文字の右（ruby が無ければ null）
}

const FAILURES: string[] = [];

function expect(cond: boolean, label: string): void {
  if (!cond) FAILURES.push(label);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  // puppeteer-core を動的 import（@daisy/ace-axe-runner-puppeteer 経由で導入済み）。
  const puppeteer = (await import('puppeteer-core')).default;

  const workDir = await mkdtemp(path.join(tmpdir(), 'kappan-thorium-'));
  let epubPath = args.epub ? path.resolve(ROOT, args.epub) : null;

  try {
    // 1. EPUB を用意（--epub 未指定ならフィクスチャをその場でビルド）
    if (!epubPath) {
      const { buildBook, loadConfig } = await import('@kappan/core');
      const configPath = path.resolve(ROOT, args.fixture);
      const { config, configDir } = await loadConfig(configPath);
      epubPath = path.join(workDir, 'fixture.epub');
      await buildBook({
        config,
        configDir,
        outputPath: epubPath,
        now: new Date('2026-01-01T00:00:00Z'),
      });
      console.error(`[thorium-headless] built fixture EPUB: ${args.fixture}`);
    }

    // 2. 展開
    const extractDir = path.join(workDir, 'extracted');
    await mkdir(extractDir, { recursive: true });
    await unzipEpub(epubPath, extractDir);

    const contentDir = path.join(extractDir, 'EPUB', 'content');
    if (!existsSync(contentDir)) {
      throw new Error(`content ディレクトリが見つかりません: ${contentDir}`);
    }
    const chapters = readdirSync(contentDir)
      .filter((f) => f.endsWith('.xhtml'))
      .sort();
    if (chapters.length === 0) throw new Error('検証対象の content XHTML がありません。');

    // 3. 展開先を localhost HTTP で配信（file:// だと一部環境で CSS が当たらないため）
    const { server, baseUrl } = await startStaticServer(extractDir);

    // 4. ブラウザ起動
    const executablePath = resolveChromeExecutable();
    const browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const outDir = path.resolve(ROOT, args.out);
    if (args.screenshot) await mkdir(outDir, { recursive: true });

    const results: ChapterCheck[] = [];
    try {
      for (const chapter of chapters) {
        const page = await browser.newPage();
        await page.setViewport({ width: 800, height: 600 });
        const url = `${baseUrl}/EPUB/content/${encodeURIComponent(chapter)}`;
        await page.goto(url, { waitUntil: 'networkidle0' });

        const check = await page.evaluate(() => {
          // tsx/esbuild は名前付き関数式に `__name(...)` ヘルパ呼び出しを挿入するが、
          // ブラウザコンテキストには存在しないため、評価関数の先頭で no-op を定義する。
          (globalThis as unknown as { __name?: unknown }).__name ??= (f: unknown) => f;
          const round = (n: number) => Math.round(n);
          const rectOf = (el: Element) => {
            const b = el.getBoundingClientRect();
            return { x: round(b.x), y: round(b.y), w: round(b.width), h: round(b.height) };
          };

          const bodyWritingMode = getComputedStyle(document.body).writingMode;

          // 本文段落（pre 内・ruby を含まない直接の p）。narrative/dialogue いずれも対象。
          const paras = Array.from(document.querySelectorAll('body > p, body > div > p'));
          const paraRects = paras.map(rectOf).filter((r) => r.w > 0 && r.h > 0);

          // 縦流れ：最初の意味のある段落で高さ > 幅
          const verticalFlow = paraRects.length > 0 && paraRects[0]!.h > paraRects[0]!.w;

          // 右→左：段落が 2 つ以上あるとき、後続段落の x が先行段落より小さい
          let rightToLeft: boolean | null = null;
          if (paraRects.length >= 2) {
            // 最も右にある段落（先頭）と最も左にある段落の x を比較
            const xs = paraRects.map((r) => r.x);
            rightToLeft = Math.min(...xs) < Math.max(...xs);
          }

          // pre は横組み
          const pre = document.querySelector('pre');
          const preHorizontal = pre ? getComputedStyle(pre).writingMode === 'horizontal-tb' : null;

          // ruby: rt が親文字（ruby の最初のテキスト相当領域）の右側
          const ruby = document.querySelector('ruby');
          let rubyOnRight: boolean | null = null;
          if (ruby) {
            const rt = ruby.querySelector('rt');
            if (rt) {
              const rubyRect = rectOf(ruby);
              const rtRect = rectOf(rt);
              // 縦組みでは rt は親文字の右（x が大きい側）に出る。
              // Chromium では ruby-position: over がこれを実現する（旧 right は脱落）。
              // CSS 値ではなく座標で判定し、テーマ CSS の値差に依存しないようにする。
              rubyOnRight = rtRect.x + rtRect.w / 2 >= rubyRect.x + rubyRect.w / 2;
            }
          }

          return { bodyWritingMode, verticalFlow, rightToLeft, preHorizontal, rubyOnRight };
        });

        results.push({ file: chapter, ...check });

        if (args.screenshot) {
          await page.screenshot({
            path: path.join(outDir, `${chapter.replace(/\.xhtml$/, '')}.png`) as `${string}.png`,
            fullPage: true,
          });
        }
        await page.close();
      }
    } finally {
      await browser.close();
      server.close();
    }

    // 4. 集約検証
    console.error('[thorium-headless] レイアウト検証結果:');
    for (const r of results) {
      console.error(
        `  ${r.file}: writing-mode=${r.bodyWritingMode} vertical=${r.verticalFlow} ` +
          `rtl=${r.rightToLeft ?? 'n/a'} pre横=${r.preHorizontal ?? 'n/a'} ` +
          `ruby右=${r.rubyOnRight ?? 'n/a'}`,
      );
    }

    // すべての章で body が縦組み
    expect(
      results.every((r) => r.bodyWritingMode === 'vertical-rl'),
      'すべての章で body の writing-mode が vertical-rl ではない',
    );
    // すべての章で本文が縦に流れる
    expect(
      results.every((r) => r.verticalFlow),
      'いずれかの章で本文が縦に流れていない（段落の高さ <= 幅）',
    );
    // 段落が 2 つ以上ある章では右→左の流れ
    expect(
      results.filter((r) => r.rightToLeft !== null).every((r) => r.rightToLeft === true),
      'いずれかの章で本文が右→左に流れていない',
    );
    // pre を含む章では横組み
    const withPre = results.filter((r) => r.preHorizontal !== null);
    expect(withPre.length > 0, 'コードブロック（pre）を含む章が無く、横組み内包を検証できていない');
    expect(
      withPre.every((r) => r.preHorizontal === true),
      'いずれかの章で pre が横組み（horizontal-tb）になっていない',
    );
    // ruby を含む章では rt が右
    const withRuby = results.filter((r) => r.rubyOnRight !== null);
    expect(withRuby.length > 0, 'ルビを含む章が無く、ルビ右配置を検証できていない');
    expect(
      withRuby.every((r) => r.rubyOnRight === true),
      'いずれかの章でルビ（rt）が親文字の右側に出ていない',
    );

    if (FAILURES.length > 0) {
      console.error('\n[thorium-headless] ❌ 縦組みレイアウト検証に失敗:');
      for (const f of FAILURES) console.error(`  - ${f}`);
      process.exitCode = 1;
      return;
    }
    console.error(
      `\n[thorium-headless] ✅ 縦組みレイアウト検証 PASS（${results.length} 章）` +
        (args.screenshot ? ` / screenshot: ${path.relative(ROOT, outDir)}` : ''),
    );
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
