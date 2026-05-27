import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { watch, type FSWatcher } from 'chokidar';
import {
  buildChapter,
  collectChapters,
  loadConfig,
  createPluginContext,
  runOnInit,
  runOnDispose,
  BuildError,
  type Chapter,
  type KappanConfig,
  type Diagnostic,
  type PluginContext,
} from '@kappan/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface PreviewServerOptions {
  readonly config: KappanConfig;
  readonly configDir: string;
  /** 設定ファイル自身のパス（config 変更検知に使う） */
  readonly configPath: string;
  readonly port: number;
  readonly host: string;
}

interface ChapterCache {
  readonly chapter: Chapter;
  readonly xhtml: string;
  readonly imageAssets: ReadonlyMap<string, Uint8Array>;
}

interface BuildErrorPayload {
  readonly message: string;
  readonly diagnostics: readonly Diagnostic[];
  readonly chapterId?: string;
  readonly file?: string;
}

/**
 * Kappan preview server。
 * ADR 0006 に基づく軽量実装：自前 HTTP + chokidar + SSE。
 *
 * 主な機能：
 *  - ビルド失敗時にエラー詳細を SSE で配信（client がオーバーレイ表示）
 *  - `lastBuildAt: ISO timestamp` を毎イベントに含める
 *  - diagnostics（warning/info 含む）を `diagnostics` イベントで配信
 *  - 章ナビ＋本文の 2 ペインは client.html 側で既に持っているので維持
 */
export class PreviewServer {
  private opts: PreviewServerOptions;
  private chapters: Chapter[] = [];
  private cache = new Map<string, ChapterCache>();
  private sseClients = new Set<ServerResponse>();
  private watcher?: FSWatcher;
  private server?: ReturnType<typeof createServer>;
  private themeCache?: Map<string, Uint8Array>;
  private pluginCtx?: PluginContext;
  private diagnostics: Diagnostic[] = [];
  private lastBuildAt: string = new Date(0).toISOString();
  private lastBuildError: BuildErrorPayload | null = null;

  constructor(opts: PreviewServerOptions) {
    this.opts = opts;
  }

  async start(): Promise<void> {
    // 共有 PluginContext を1度だけ生成し、onInit を1度だけ呼ぶ
    this.pluginCtx = createPluginContext({
      config: this.opts.config,
      diagnostics: this.diagnostics,
    });
    await runOnInit(this.opts.config.plugins, this.pluginCtx);

    await this.refreshChapters();
    await this.buildAll();

    this.server = createServer((req, res) => this.handle(req, res));
    await new Promise<void>((resolve) => {
      this.server!.listen(this.opts.port, this.opts.host, resolve);
    });

    // ソースディレクトリと config ファイルの両方を監視する
    const sourceDir = path.resolve(this.opts.configDir, this.opts.config.source.baseDir);
    this.watcher = watch([sourceDir, this.opts.configPath], {
      ignored: (p) => /(^|[/\\])\../.test(p),
      persistent: true,
      ignoreInitial: true,
    });
    this.watcher.on('change', (filePath: string) => void this.onChange(filePath));
    this.watcher.on('add', (filePath: string) => void this.onChange(filePath));

    const url = `http://${this.opts.host}:${this.opts.port}`;
    console.log(`✓ Kappan preview server running at ${url}`);
    console.log(`  Watching: ${this.opts.config.source.baseDir} and config file`);
    console.log(`  Ctrl+C to stop`);
  }

  async stop(): Promise<void> {
    await this.watcher?.close();
    for (const client of this.sseClients) {
      client.end();
    }
    this.sseClients.clear();
    if (this.server) {
      await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    }
    // プラグインの onDispose を呼ぶ
    if (this.pluginCtx) {
      await runOnDispose(this.opts.config.plugins);
    }
  }

  private async refreshChapters(): Promise<void> {
    this.chapters = await collectChapters(this.opts.config, this.opts.configDir);
  }

  private async buildAll(): Promise<void> {
    // バッチビルドは個別章のエラーがあっても他章を巻き込まない方が良いが、
    // 章間 ID マップ等の整合性のためまとめてビルドする現状の挙動を維持する。
    // 失敗章は cache に残らない（直前ビルドの内容は残らない）。
    let firstError: unknown = null;
    let errorChapterId: string | undefined;
    for (const chapter of this.chapters) {
      try {
        await this.buildOne(chapter);
      } catch (err) {
        if (!firstError) {
          firstError = err;
          errorChapterId = chapter.id;
        }
      }
    }
    await this.loadTheme();
    if (firstError) {
      throw normalizeBuildErr(firstError, errorChapterId);
    }
  }

  private async loadTheme(): Promise<void> {
    this.themeCache = await this.opts.config.theme.getAssets();
  }

  private async buildOne(chapter: Chapter): Promise<void> {
    const result = await buildChapter({
      config: this.opts.config,
      chapter,
      ...(this.pluginCtx !== undefined ? { pluginContext: this.pluginCtx } : {}),
    });
    this.cache.set(chapter.id, {
      chapter,
      xhtml: result.xhtml,
      imageAssets: result.imageAssets,
    });
  }

  private touchBuildTimestamp(): void {
    this.lastBuildAt = new Date().toISOString();
  }

  private async onChange(filePath: string): Promise<void> {
    const absPath = path.resolve(filePath);

    // 設定ファイル自身の変更：config を読み直して全章再ビルド
    if (absPath === path.resolve(this.opts.configPath)) {
      try {
        const reloaded = await loadConfig(this.opts.configPath);
        // 既存プラグインの onDispose を呼んで、新しい構成で onInit する
        if (this.pluginCtx) {
          await runOnDispose(this.opts.config.plugins);
        }
        this.opts = { ...this.opts, config: reloaded.config };
        this.pluginCtx = createPluginContext({
          config: this.opts.config,
          diagnostics: this.diagnostics,
        });
        await runOnInit(this.opts.config.plugins, this.pluginCtx);
        await this.refreshChapters();
        await this.buildAll();
        this.touchBuildTimestamp();
        this.lastBuildError = null;
        this.notifyClients({ type: 'full-reload' });
        this.broadcastDiagnostics();
      } catch (err) {
        this.handleBuildFailure(err, undefined, 'config reload failed');
      }
      return;
    }

    const matched = this.chapters.find((c) => c.absolutePath === absPath);
    if (matched) {
      // 既存章の編集
      try {
        await this.refreshChapters(); // front-matter の next 変更を取り込む
        const refreshed = this.chapters.find((c) => c.absolutePath === absPath);
        if (refreshed) {
          await this.buildOne(refreshed);
          this.touchBuildTimestamp();
          this.lastBuildError = null;
          this.notifyClients({ type: 'chapter-updated', chapterId: refreshed.id });
          this.broadcastDiagnostics();
        }
      } catch (err) {
        this.handleBuildFailure(err, matched.id, undefined);
      }
    } else {
      // 新規ファイル or 順序変更
      try {
        await this.refreshChapters();
        await this.buildAll();
        this.touchBuildTimestamp();
        this.lastBuildError = null;
        this.notifyClients({ type: 'full-reload' });
        this.broadcastDiagnostics();
      } catch (err) {
        this.handleBuildFailure(err, undefined, undefined);
      }
    }
  }

  private handleBuildFailure(
    err: unknown,
    chapterId: string | undefined,
    prefix: string | undefined,
  ): void {
    const normalized = normalizeBuildErr(err, chapterId);
    const message = prefix ? `${prefix}: ${normalized.message}` : normalized.message;
    this.lastBuildError = { ...normalized, message };
    this.touchBuildTimestamp();
    this.notifyClients({
      type: 'error',
      message,
      diagnostics: normalized.diagnostics,
      ...(chapterId !== undefined ? { chapterId } : {}),
      ...(normalized.file !== undefined ? { file: normalized.file } : {}),
    });
  }

  private broadcastDiagnostics(): void {
    // 蓄積された diagnostics をクライアントに送る（warning/info も含めて UI 表示）
    if (this.diagnostics.length === 0 && !this.lastBuildError) return;
    this.notifyClients({ type: 'diagnostics', diagnostics: [...this.diagnostics] });
  }

  private notifyClients(event: Record<string, unknown>): void {
    const payload = { ...event, lastBuildAt: this.lastBuildAt };
    const message = `data: ${JSON.stringify(payload)}\n\n`;
    for (const client of this.sseClients) {
      client.write(message);
    }
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const pathname = url.pathname;

    try {
      if (pathname === '/') {
        await this.serveIndex(res);
      } else if (pathname === '/__sse') {
        this.serveSse(req, res);
      } else if (pathname === '/__client.js') {
        await this.serveStatic(res, 'client.js', 'application/javascript');
      } else if (pathname === '/api/chapters') {
        this.serveChapterList(res);
      } else if (pathname === '/api/status') {
        this.serveStatus(res);
      } else if (pathname.startsWith('/content/')) {
        const chapterId = pathname.replace('/content/', '').replace(/\.xhtml$/, '');
        this.serveChapter(res, chapterId);
      } else if (pathname.startsWith('/styles/')) {
        const assetName = pathname.replace(/^\//, '');
        this.serveThemeAsset(res, assetName);
      } else if (pathname.startsWith('/images/')) {
        const assetName = pathname.replace(/^\/content\/?/, '').replace(/^\//, '');
        this.serveImage(res, assetName);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end((err as Error).message);
    }
  }

  private async serveIndex(res: ServerResponse): Promise<void> {
    const html = await readFile(path.join(__dirname, 'client.html'), 'utf-8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  }

  private serveSse(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(': connected\n\n');
    // 接続直後に現在の状態を1度送る（オーバーレイが残っている場合等のため）
    const initial: Record<string, unknown> = {
      type: 'snapshot',
      lastBuildAt: this.lastBuildAt,
      diagnostics: [...this.diagnostics],
    };
    if (this.lastBuildError) initial['error'] = this.lastBuildError;
    res.write(`data: ${JSON.stringify(initial)}\n\n`);
    this.sseClients.add(res);
    req.on('close', () => {
      this.sseClients.delete(res);
    });
  }

  private async serveStatic(res: ServerResponse, name: string, mime: string): Promise<void> {
    const filePath = path.join(__dirname, name);
    const data = await readFile(filePath);
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  }

  private serveChapterList(res: ServerResponse): void {
    const list = this.chapters.map((c) => ({ id: c.id, title: c.title }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(list));
  }

  private serveStatus(res: ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        lastBuildAt: this.lastBuildAt,
        diagnostics: this.diagnostics,
        error: this.lastBuildError,
      }),
    );
  }

  private serveChapter(res: ServerResponse, chapterId: string): void {
    const entry = this.cache.get(chapterId);
    if (!entry) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Chapter not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/xhtml+xml; charset=utf-8' });
    res.end(entry.xhtml);
  }

  private serveThemeAsset(res: ServerResponse, name: string): void {
    if (!this.themeCache) {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.end('Theme not loaded');
      return;
    }
    const data = this.themeCache.get(name);
    if (!data) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Asset not found');
      return;
    }
    const mime = name.endsWith('.css') ? 'text/css' : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(Buffer.from(data));
  }

  private serveImage(res: ServerResponse, name: string): void {
    for (const entry of this.cache.values()) {
      const img = entry.imageAssets.get(name);
      if (img) {
        const ext = path.extname(name).toLowerCase();
        const mime =
          ext === '.png'
            ? 'image/png'
            : ext === '.jpg' || ext === '.jpeg'
              ? 'image/jpeg'
              : 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': mime });
        res.end(Buffer.from(img));
        return;
      }
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Image not found');
  }
}

function normalizeBuildErr(err: unknown, chapterId?: string): BuildErrorPayload {
  if (err instanceof BuildError) {
    return {
      message: err.message,
      diagnostics: err.diagnostics,
      ...(chapterId !== undefined ? { chapterId } : {}),
    };
  }
  const e = err as Error & { stack?: string };
  return {
    message: e?.message ?? String(err),
    diagnostics: [],
    ...(chapterId !== undefined ? { chapterId } : {}),
  };
}
