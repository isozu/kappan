#!/usr/bin/env node
/**
 * Kappan ベンチマーク骨格。
 *
 * パフォーマンス回帰テストのための計測スクリプト。
 * 計測項目を JSON に書き出し、しきい値判定は比較スクリプト側で行う。
 *
 * 用法:
 *   node tools/bench/run.mjs [--fixture <path>] [--iterations 10] [--output bench-results/<timestamp>.json]
 *
 * sibling script：
 *   - tools/bench/previewHmr.ts ... preview HMR reflect time（chokidar change → SSE 通知）の計測
 *   - 計測項目はそれぞれ別 JSON に出力する（CI ではどちらも収集して baseline.json と比較）
 */

import { performance } from 'node:perf_hooks';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, buildBook } from '@kappan/core';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..', '..');

function parseArgs(argv) {
  const args = {
    iterations: 10,
    fixture: 'tests/fixtures/minimal-commonmark/kappan.config.ts',
    output: null,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--iterations') args.iterations = Number(argv[++i]);
    else if (argv[i] === '--fixture') args.fixture = argv[++i];
    else if (argv[i] === '--output') args.output = argv[++i];
  }
  return args;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function stats(values) {
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / values.length;
  const sortedAsc = [...values].sort((a, b) => a - b);
  const p95Idx = Math.min(sortedAsc.length - 1, Math.floor(sortedAsc.length * 0.95));
  return {
    median: median(values),
    mean,
    min: sortedAsc[0],
    max: sortedAsc[sortedAsc.length - 1],
    p95: sortedAsc[p95Idx],
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const configPath = path.resolve(ROOT, args.fixture);
  const { config, configDir } = await loadConfig(configPath);

  const tmpRoot = path.join(tmpdir(), `kappan-bench-${Date.now()}`);
  await mkdir(tmpRoot, { recursive: true });

  const samples = [];
  console.error(`Running ${args.iterations} iterations on ${args.fixture}`);

  for (let i = 0; i < args.iterations; i++) {
    const outputPath = path.join(tmpRoot, `iter-${i}.epub`);
    const t0 = performance.now();
    await buildBook({
      config,
      configDir,
      outputPath,
      now: new Date('2026-01-01T00:00:00Z'),
    });
    const elapsed = performance.now() - t0;
    samples.push(elapsed);
    if (i === 0) {
      console.error(`  [warm-up]  ${elapsed.toFixed(1)} ms`);
    } else {
      console.error(`  iter ${String(i).padStart(2, '0')}: ${elapsed.toFixed(1)} ms`);
    }
  }

  await rm(tmpRoot, { recursive: true, force: true });

  // 最初の1回はウォームアップとして除外
  const measured = samples.slice(1);
  const summary = stats(measured);

  const report = {
    fixture: args.fixture,
    iterations: args.iterations,
    measuredIterations: measured.length,
    timestamp: new Date().toISOString(),
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    buildTimeMs: summary,
    rawSamplesMs: measured,
  };

  console.error('');
  console.error(`Build time (ms):`);
  console.error(`  median: ${summary.median.toFixed(1)}`);
  console.error(`  mean  : ${summary.mean.toFixed(1)}`);
  console.error(`  min   : ${summary.min.toFixed(1)}`);
  console.error(`  max   : ${summary.max.toFixed(1)}`);
  console.error(`  p95   : ${summary.p95.toFixed(1)}`);

  if (args.output) {
    const outPath = path.resolve(args.output);
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
