#!/usr/bin/env node
/**
 * Preview HMR reflect time bench。
 *
 * preview server を起動し、章 md を touch → SSE で `chapter-updated` イベントが
 * 飛んでくるまでの経過時間を計測する。
 *
 * 「HMR 反映時間中央値 100ms 以内」を理想とし、目安としては 200ms 以下を目標とする。
 *
 * 用法:
 *   node --import tsx tools/bench/previewHmr.ts [--fixture <kappan.config.ts>] [--iterations 10]
 */

import { performance } from 'node:perf_hooks';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { request } from 'node:http';
import { loadConfig } from '@kappan/core';
import { PreviewServer } from '../../packages/cli/src/preview/server.js';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..', '..');

interface Args {
  readonly fixture: string;
  readonly iterations: number;
  readonly output: string | null;
}

function parseArgs(argv: string[]): Args {
  const args = {
    iterations: 10,
    fixture: 'tests/fixtures/tech-book-yokogumi/kappan.config.ts',
    output: null as string | null,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--iterations') args.iterations = Number(argv[++i]);
    else if (argv[i] === '--fixture') args.fixture = argv[++i]!;
    else if (argv[i] === '--output') args.output = argv[++i]!;
  }
  return args;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function stats(values: number[]): {
  median: number;
  mean: number;
  min: number;
  max: number;
  p95: number;
} {
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / values.length;
  const sortedAsc = [...values].sort((a, b) => a - b);
  const p95Idx = Math.min(sortedAsc.length - 1, Math.floor(sortedAsc.length * 0.95));
  return {
    median: median(values),
    mean,
    min: sortedAsc[0]!,
    max: sortedAsc[sortedAsc.length - 1]!,
    p95: sortedAsc[p95Idx]!,
  };
}

interface SseEvent {
  readonly type?: string;
  readonly chapterId?: string;
  readonly lastBuildAt?: string;
}

class SseClient {
  private buffer = '';
  private aborter = new AbortController();
  private listeners: Array<(e: SseEvent) => void> = [];

  constructor(private url: string) {}

  async connect(): Promise<void> {
    const u = new URL(this.url);
    return new Promise((resolve, reject) => {
      const req = request(
        {
          hostname: u.hostname,
          port: u.port,
          path: u.pathname + u.search,
          headers: { Accept: 'text/event-stream' },
          signal: this.aborter.signal,
        },
        (res) => {
          res.setEncoding('utf-8');
          res.on('data', (chunk: string) => this.onData(chunk));
          res.on('error', reject);
          resolve();
        },
      );
      req.on('error', reject);
      req.end();
    });
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    let idx: number;
    while ((idx = this.buffer.indexOf('\n\n')) !== -1) {
      const block = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 2);
      const dataLine = block.split('\n').find((l) => l.startsWith('data: '));
      if (!dataLine) continue;
      const json = dataLine.slice('data: '.length).trim();
      if (json.length === 0) continue;
      try {
        const event = JSON.parse(json) as SseEvent;
        for (const fn of this.listeners) fn(event);
      } catch {
        // ignore non-JSON keepalive comments
      }
    }
  }

  on(fn: (e: SseEvent) => void): void {
    this.listeners.push(fn);
  }

  close(): void {
    this.aborter.abort();
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const configPath = path.resolve(ROOT, args.fixture);
  const loaded = await loadConfig(configPath);

  // free port (固定値で良いが衝突しないように高い番号を)
  const port = 5500 + Math.floor(Math.random() * 100);

  const server = new PreviewServer({
    config: loaded.config,
    configDir: loaded.configDir,
    configPath: loaded.configPath,
    port,
    host: '127.0.0.1',
  });
  await server.start();

  // 計測対象は「最初の章ファイル」とする（src/index.md など）
  const targetMd = path.resolve(
    loaded.configDir,
    loaded.config.source.baseDir,
    '..',
    'src',
    'index.md',
  );
  let actualTargetMd = targetMd;
  try {
    await readFile(actualTargetMd);
  } catch {
    // entry の絶対パスを直接使う
    actualTargetMd = path.resolve(loaded.configDir, loaded.config.source.entry);
  }
  const originalContent = await readFile(actualTargetMd, 'utf-8');

  const sse = new SseClient(`http://127.0.0.1:${port}/__sse`);
  const eventTimes: { resolve: (t: number) => void; chapterId?: string }[] = [];
  sse.on((event) => {
    if (event.type === 'chapter-updated' || event.type === 'full-reload') {
      const t = performance.now();
      const pending = eventTimes.shift();
      pending?.resolve(t);
    }
  });
  await sse.connect();
  // ウォームアップ：初期接続のスナップショットイベントを消費
  await new Promise((r) => setTimeout(r, 200));

  const samples: number[] = [];
  console.error(`Running ${args.iterations} preview-HMR iterations on ${args.fixture}`);

  try {
    for (let i = 0; i < args.iterations; i++) {
      // marker を追加して書き戻す → chokidar の change イベント発火
      const marker = `\n<!-- bench-marker ${i} ${Date.now()} -->\n`;
      const newContent = originalContent + marker;
      const pending: { resolve: (t: number) => void } = {} as { resolve: (t: number) => void };
      const promise = new Promise<number>((resolve) => {
        pending.resolve = resolve;
      });
      eventTimes.push(pending);
      const t0 = performance.now();
      await writeFile(actualTargetMd, newContent, 'utf-8');
      const t1 = await Promise.race([
        promise,
        new Promise<number>((_, reject) =>
          setTimeout(() => reject(new Error('timeout after 5s')), 5000),
        ),
      ]);
      const elapsed = t1 - t0;
      samples.push(elapsed);
      console.error(`  iter ${String(i).padStart(2, '0')}: ${elapsed.toFixed(1)} ms`);
      // 少しクールダウン
      await new Promise((r) => setTimeout(r, 100));
    }
  } finally {
    // 元の内容に戻して shutdown
    await writeFile(actualTargetMd, originalContent, 'utf-8');
    sse.close();
    await server.stop();
  }

  // 最初の1回はウォームアップ扱いで除外
  const measured = samples.slice(1);
  const summary = stats(measured);

  const report = {
    fixture: args.fixture,
    metric: 'previewHmrReflectTimeMs',
    iterations: args.iterations,
    measuredIterations: measured.length,
    timestamp: new Date().toISOString(),
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    previewHmrReflectTimeMs: summary,
    rawSamplesMs: measured,
  };

  console.error('');
  console.error(`Preview HMR reflect time (ms):`);
  console.error(`  median: ${summary.median.toFixed(1)}`);
  console.error(`  mean  : ${summary.mean.toFixed(1)}`);
  console.error(`  min   : ${summary.min.toFixed(1)}`);
  console.error(`  max   : ${summary.max.toFixed(1)}`);
  console.error(`  p95   : ${summary.p95.toFixed(1)}`);
  if (summary.median > 200) {
    console.error(`  ⚠ median > 200ms (M1 target).`);
  } else {
    console.error(`  ✓ median <= 200ms (M1 target).`);
  }

  if (args.output) {
    const outPath = path.resolve(args.output);
    const { mkdir } = await import('node:fs/promises');
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify(report, null, 2));
    console.error(`\nReport written to ${outPath}`);
  } else {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
