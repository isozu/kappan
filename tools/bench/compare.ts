#!/usr/bin/env node
/**
 * ベンチマーク比較・回帰判定スクリプト。
 *
 * 統計手法：
 *   - 各ベンチマークの中央値を主指標
 *   - 平均値・標準偏差・min/max/p95 を副指標
 *   - 環境要因による外れ値を IQR の 1.5 倍ルールで除外
 *   - Welch's t-test を用いて p 値 0.05 以下で警告
 *   - FAIL は「median 15% 以上の劣化」かつ「統計的有意（p<0.05）」の両方を要求する。
 *     効果量だけ大きく有意でないもの（極小ベンチの run-to-run ノイズ）は WARN に留め、
 *     CI をブロックしない。
 *
 * 用法:
 *   tsx tools/bench/compare.ts --baseline bench-main.json --candidate bench-pr.json
 *
 * 出力:
 *   - PASS: 統計的有意な劣化なし
 *   - WARN: median 5% 以上劣化 / p < 0.05 / 有意でない大きな median 差（exit 0、CI コメント想定）
 *   - FAIL: 有意な median 15% 以上劣化 or p < 0.01（exit 1）
 */

import { readFile } from 'node:fs/promises';

interface BenchReport {
  fixture: string;
  iterations: number;
  measuredIterations: number;
  timestamp: string;
  node: string;
  platform: string;
  buildTimeMs: {
    median: number;
    mean: number;
    min: number;
    max: number;
    p95: number;
  };
  rawSamplesMs: number[];
}

interface CompareArgs {
  baseline: string;
  candidate: string;
  warnThreshold: number; // 単発計測の警告しきい値（デフォルト 0.05 = 5%）
  failThreshold: number; // 累積劣化の失敗しきい値（デフォルト 0.15 = 15%）
  alpha: number; // Welch's t-test の有意水準（デフォルト 0.05）
}

function parseArgs(argv: string[]): CompareArgs {
  const args: CompareArgs = {
    baseline: '',
    candidate: '',
    warnThreshold: 0.05,
    failThreshold: 0.15,
    alpha: 0.05,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--baseline') args.baseline = argv[++i] ?? '';
    else if (a === '--candidate') args.candidate = argv[++i] ?? '';
    else if (a === '--warn-threshold') args.warnThreshold = Number(argv[++i]);
    else if (a === '--fail-threshold') args.failThreshold = Number(argv[++i]);
    else if (a === '--alpha') args.alpha = Number(argv[++i]);
  }
  if (!args.baseline || !args.candidate) {
    console.error('Usage: tsx tools/bench/compare.ts --baseline X.json --candidate Y.json');
    process.exit(2);
  }
  return args;
}

/**
 * IQR の 1.5 倍ルールで外れ値を除外する。
 * 「環境要因による外れ値は IQR の 1.5 倍ルールで除外」する方針。
 */
function removeOutliers(samples: number[]): number[] {
  if (samples.length < 4) return samples;
  const sorted = [...samples].sort((a, b) => a - b);
  const q1Idx = Math.floor(sorted.length * 0.25);
  const q3Idx = Math.floor(sorted.length * 0.75);
  const q1 = sorted[q1Idx]!;
  const q3 = sorted[q3Idx]!;
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  return samples.filter((v) => v >= lo && v <= hi);
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function variance(xs: number[]): number {
  const m = mean(xs);
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
}

/**
 * Welch's t-test の t 統計量と自由度を返す。
 * 等分散を仮定しない 2 標本 t 検定。
 */
function welchsTTest(a: number[], b: number[]): { t: number; df: number; pValue: number } {
  const ma = mean(a);
  const mb = mean(b);
  const va = variance(a);
  const vb = variance(b);
  const na = a.length;
  const nb = b.length;
  const se = Math.sqrt(va / na + vb / nb);
  const t = (mb - ma) / se;
  // Welch–Satterthwaite の自由度
  const df = (va / na + vb / nb) ** 2 / ((va / na) ** 2 / (na - 1) + (vb / nb) ** 2 / (nb - 1));
  // p 値（両側）を t 分布の近似で求める。標準正規近似（df > 30 で十分実用的）
  const pValue = 2 * (1 - normalCdf(Math.abs(t)));
  return { t, df, pValue };
}

/**
 * 標準正規分布の累積分布関数の近似（Abramowitz & Stegun 26.2.17）。
 * 簡易実装で十分な精度を持つ。
 */
function normalCdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  const xAbs = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + p * xAbs);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-xAbs * xAbs);
  return 0.5 * (1 + sign * y);
}

async function loadReport(p: string): Promise<BenchReport> {
  const raw = await readFile(p, 'utf-8');
  return JSON.parse(raw) as BenchReport;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseline = await loadReport(args.baseline);
  const candidate = await loadReport(args.candidate);

  const baselineSamples = removeOutliers(baseline.rawSamplesMs);
  const candidateSamples = removeOutliers(candidate.rawSamplesMs);

  const baselineMedian = baseline.buildTimeMs.median;
  const candidateMedian = candidate.buildTimeMs.median;
  const change = (candidateMedian - baselineMedian) / baselineMedian;
  const changePct = (change * 100).toFixed(2);

  const tTest = welchsTTest(baselineSamples, candidateSamples);
  const significant = tTest.pValue < args.alpha;

  console.log('Benchmark comparison:');
  console.log(`  Fixture     : ${baseline.fixture}`);
  console.log(
    `  Baseline    : median ${baselineMedian.toFixed(1)} ms (n=${baselineSamples.length})`,
  );
  console.log(
    `  Candidate   : median ${candidateMedian.toFixed(1)} ms (n=${candidateSamples.length})`,
  );
  console.log(`  Change      : ${change >= 0 ? '+' : ''}${changePct}%`);
  console.log(`  t-statistic : ${tTest.t.toFixed(3)} (df=${tTest.df.toFixed(1)})`);
  console.log(`  p-value     : ${tTest.pValue.toFixed(4)} (α=${args.alpha})`);

  // 判定
  //
  // median 由来の FAIL は「効果量（≥failThreshold）」と「統計的有意（p<alpha）」の両方を要求する。
  // 極小ベンチ（小サンプル × 高分散）では同等コードでも median が 15% 以上振れることがあり、
  // 効果量だけで FAIL にすると誤検知が頻発する。Welch's t-test の p 値でノイズと実回帰を分ける。
  let status: 'PASS' | 'WARN' | 'FAIL' = 'PASS';
  const reasons: string[] = [];

  if (change >= args.failThreshold && significant) {
    status = 'FAIL';
    reasons.push(
      `median regression ${changePct}% ≥ ${(args.failThreshold * 100).toFixed(0)}% (p=${tTest.pValue.toFixed(4)})`,
    );
  } else if (significant && change > 0 && tTest.pValue < args.alpha / 5) {
    status = 'FAIL';
    reasons.push(`statistically significant regression (p=${tTest.pValue.toFixed(4)})`);
  } else if (change >= args.failThreshold) {
    // 効果量は大きいが有意でない（ノイズの可能性が高い）→ ブロックせず警告に留める
    status = 'WARN';
    reasons.push(
      `median regression ${changePct}% ≥ ${(args.failThreshold * 100).toFixed(0)}% but not statistically significant (p=${tTest.pValue.toFixed(4)})`,
    );
  } else if (change >= args.warnThreshold) {
    status = 'WARN';
    reasons.push(`median regression ${changePct}% ≥ ${(args.warnThreshold * 100).toFixed(0)}%`);
  } else if (significant && change > 0) {
    status = 'WARN';
    reasons.push(`statistically significant change (p=${tTest.pValue.toFixed(4)})`);
  }

  console.log('');
  console.log(`Verdict: ${status}`);
  if (reasons.length > 0) console.log(`  Reasons: ${reasons.join('; ')}`);

  if (status === 'FAIL') process.exit(1);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
