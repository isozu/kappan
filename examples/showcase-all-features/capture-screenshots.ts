#!/usr/bin/env node
/**
 * showcase-all-features の横組みレイアウトを画像化するスクリーンショットスクリプト。
 *
 * tests/reader-compatibility/scripts/thorium-headless.ts の方式を流用する：
 * puppeteer-core + ローカルにダウンロード済みの Chrome for Testing を使い、
 * 展開した EPUB を localhost HTTP で配信して各章を描画し、PNG を保存する。
 * file:// だと一部のヘッドレス環境で相対 stylesheet・MathML スタイルが CORS で
 * 読めないことがあるため、HTTP 配信にする（dev-vertical-css の実測知見）。
 *
 * shiki によるコードハイライト、図表番号、KaTeX 数式が見える横組み画面を
 * screenshots/ に出力する。all-features.png は README で参照するヒーロー画像（第1章）。
 *
 * 用法:
 *   node --import tsx examples/showcase-all-features/capture-screenshots.ts
 */

import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as unzipper from 'unzipper';

const MIME_TYPES: Record<string, string> = {
  '.xhtml': 'application/xhtml+xml',
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
  '.xml': 'application/xml',
  '.opf': 'application/oebps-package+xml',
};

async function startStaticServer(rootDir: string): Promise<{ server: Server; baseUrl: string }> {
  const server = createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]!);
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
const HERE = path.dirname(__filename);
const ROOT = path.resolve(HERE, '..', '..');

/** ~/.cache/puppeteer の最新 Chrome for Testing を探す（PUPPETEER_EXECUTABLE_PATH 優先）。 */
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
        path.join(cacheBase, latest, 'chrome-linux64', 'chrome'),
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

/** README が参照するヒーロー画像のファイル名（コードハイライトと図表番号が見える第1章）。 */
const HERO_CHAPTER = 'ch01.xhtml';
const HERO_NAME = 'all-features.png';

async function main(): Promise<void> {
  const puppeteer = (await import('puppeteer-core')).default;
  const workDir = await mkdtemp(path.join(tmpdir(), 'kappan-showcase-all-features-'));

  try {
    // 1. ショーケース（showcase-all-features）をその場でビルド
    const { buildBook, loadConfig } = await import('@kappan/core');
    const configPath = path.join(HERE, 'kappan.config.ts');
    const { config, configDir } = await loadConfig(configPath);
    const epubPath = path.join(workDir, 'showcase-all-features.epub');
    await buildBook({
      config,
      configDir,
      outputPath: epubPath,
      now: new Date('2026-01-01T00:00:00Z'),
    });
    console.error('[showcase-all-features] built EPUB for screenshots');

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
    if (chapters.length === 0) throw new Error('content XHTML がありません。');

    // 3. localhost HTTP で配信（file:// だと CSS/MathML が当たらない環境があるため）
    const { server, baseUrl } = await startStaticServer(extractDir);

    // 4. ブラウザ起動
    const executablePath = resolveChromeExecutable();
    const browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const outDir = path.join(HERE, 'screenshots');
    await mkdir(outDir, { recursive: true });

    try {
      for (const chapter of chapters) {
        const page = await browser.newPage();
        // 横組み技術書は紙面幅を想定した縦長ビューポートで撮る
        await page.setViewport({ width: 820, height: 1160, deviceScaleFactor: 2 });
        const url = `${baseUrl}/EPUB/content/${encodeURIComponent(chapter)}`;
        await page.goto(url, { waitUntil: 'networkidle0' });

        const base = chapter.replace(/\.xhtml$/, '');
        await page.screenshot({
          path: path.join(outDir, `${base}.png`) as `${string}.png`,
          fullPage: true,
        });
        // 第1章を README ヒーロー画像として別名でも保存
        if (chapter === HERO_CHAPTER) {
          await page.screenshot({
            path: path.join(outDir, HERO_NAME) as `${string}.png`,
            fullPage: true,
          });
        }
        await page.close();
        console.error(`[showcase-all-features] captured: ${base}.png`);
      }
    } finally {
      await browser.close();
      server.close();
    }

    console.error(
      `\n[showcase-all-features] ✅ ${chapters.length} 章 + ${HERO_NAME} を ` +
        `${path.relative(ROOT, outDir)} に保存しました。`,
    );
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
