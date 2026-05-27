import { createRequire } from 'node:module';

export type AceImpact = 'critical' | 'serious' | 'moderate' | 'minor';

export interface AceViolation {
  readonly impact: AceImpact;
  readonly description: string;
  readonly id: string;
}

/**
 * impact 別の件数。
 *
 * `--ace --strict` の合否判定（critical+serious が 0 か）を呼び出し側で簡便にする。
 */
export interface AceImpactCounts {
  readonly critical: number;
  readonly serious: number;
  readonly moderate: number;
  readonly minor: number;
}

export interface AceResult {
  readonly violations: number;
  readonly outcome: 'PASS' | 'FAIL';
  readonly summary: string;
  readonly details: readonly AceViolation[];
  /** impact 別カウント。critical+serious=0 が strict mode の合否判定基準 */
  readonly byImpact: AceImpactCounts;
}

export class AceNotInstalledError extends Error {
  constructor(missing?: string) {
    const which = missing ? `(${missing})` : '(@daisy/ace-core or @daisy/ace-axe-runner-puppeteer)';
    super(
      `ACE by DAISY ${which} is not installed.\n` +
        `Install both packages with:\n` +
        `  pnpm add -D @daisy/ace-core @daisy/ace-axe-runner-puppeteer\n` +
        `They are declared as optionalDependencies of @kappan/core to keep the\n` +
        `default install footprint small (~300 MB with Chromium).`,
    );
    this.name = 'AceNotInstalledError';
  }
}

/**
 * @deprecated ACE の実呼び出しが既定になったため、本エラーは投げられなくなった。
 * 互換性のため当面 export を維持する（外部スクリプトが instanceof で参照している可能性）。
 * 将来のリリースで削除予定。
 */
export class AceIntegrationPendingError extends Error {
  constructor() {
    super(
      `ACE integration is now enabled by default (since M1-D). ` +
        `This error class is deprecated and will be removed in M2.`,
    );
    this.name = 'AceIntegrationPendingError';
  }
}

/**
 * ACE by DAISY による EPUB のアクセシビリティ検証。
 *
 * 「ACE 準拠（基本検証）」を満たす。impact 別の集計と strict 判定により、
 * `--ace --strict` で critical/serious=0 をビルドゲートに使えるようにする。
 *
 * 設計判断：
 *   - `@daisy/ace-core` は依存サイズが大きい（npm install で大量の依存を取得する）
 *     ため、`@kappan/core` の optionalDependencies として宣言し、必要な時だけ
 *     インストールする
 *   - 未インストール時は AceNotInstalledError を投げ、適切な案内を表示
 *   - 結果フォーマットは Kappan 内で正規化（ACE の生レポートはバージョンで揺れる）
 */
export async function runAce(epubPath: string): Promise<AceResult> {
  const ace = await loadAce();
  const axeRunner = await loadAxeRunner();

  // ACE は ace(epubPath, options, axeRunner) のシグネチャ。
  // 第3引数の axeRunner は @daisy/ace-axe-runner-puppeteer から取る。
  const report = (await ace(
    epubPath,
    {
      silent: true,
      verbose: false,
      timeout: 60000,
    },
    axeRunner,
  )) as AceRawReport;

  return normalizeAceReport(report);
}

/**
 * ACE の生レポートを Kappan 内部表現に正規化する。
 *
 * テスト・モック用に export している。実呼び出しを経由しないので、ACE 2.x の
 * バージョン揺れに対するテストが書きやすい。
 */
export function normalizeAceReport(report: AceRawReport): AceResult {
  const details = extractViolations(report);
  const byImpact = countByImpact(details);
  const violations = details.length;
  // 生 outcome を尊重しつつ、details が 1 件以上あれば FAIL に丸める（古い ACE の
  // outcome 計算が impact 単位で揺れるケースを吸収する）
  const reportOutcome = report['earl:result']?.['earl:outcome']?.['@id'];
  const rawFail = reportOutcome === 'earl:fail';
  const outcome: 'PASS' | 'FAIL' = rawFail || violations > 0 ? 'FAIL' : 'PASS';

  return {
    violations,
    outcome,
    summary:
      outcome === 'PASS'
        ? 'ACE check passed.'
        : `ACE found ${violations} accessibility violation(s) ` +
          `(critical=${byImpact.critical}, serious=${byImpact.serious}, ` +
          `moderate=${byImpact.moderate}, minor=${byImpact.minor}).`,
    details,
    byImpact,
  };
}

/**
 * `--strict` モードの合否判定。critical / serious 違反が 1 件でもあれば fail。
 *
 * CLI 側でも同じロジックを使う。テスト・スクリプトから呼べるよう export する。
 */
export function isAceStrictPass(result: AceResult): boolean {
  return result.byImpact.critical === 0 && result.byImpact.serious === 0;
}

async function loadAce(): Promise<AceFunction> {
  try {
    const require = createRequire(import.meta.url);
    const mod = require('@daisy/ace-core') as AceFunction;
    if (typeof mod === 'function') return mod;
    throw new Error('Unexpected @daisy/ace-core module shape');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND') {
      throw new AceNotInstalledError('@daisy/ace-core');
    }
    throw err;
  }
}

async function loadAxeRunner(): Promise<unknown> {
  // ACE CLI 公式と同じ Puppeteer ベースの runner を採用する。
  // electron 版は CI 向きではないため採らない。
  try {
    const require = createRequire(import.meta.url);
    return require('@daisy/ace-axe-runner-puppeteer');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND') {
      throw new AceNotInstalledError('@daisy/ace-axe-runner-puppeteer');
    }
    throw err;
  }
}

// ACE は ace(epubPath, options, axeRunner) シグネチャ
type AceFunction = (
  epubPath: string,
  options: Record<string, unknown>,
  axeRunner: unknown,
) => Promise<unknown>;

/**
 * ACE が返す生レポートの構造。バージョン揺れがあるため、最小限の形で受ける。
 *
 * test/scripts から normalizeAceReport にこの形のオブジェクトを直接渡せるよう
 * export している（公開 API として安定保証はしない）。
 */
export interface AceRawReport {
  'earl:result'?: {
    'earl:outcome'?: { '@id': string };
  };
  assertions?: ReadonlyArray<{
    assertions?: ReadonlyArray<{
      'earl:result'?: {
        'earl:outcome'?: { '@id': string };
        'dct:description'?: string;
      };
      'earl:test'?: { '@id': string; 'earl:impact'?: string };
    }>;
  }>;
}

function countByImpact(details: readonly AceViolation[]): AceImpactCounts {
  let critical = 0;
  let serious = 0;
  let moderate = 0;
  let minor = 0;
  for (const v of details) {
    if (v.impact === 'critical') critical++;
    else if (v.impact === 'serious') serious++;
    else if (v.impact === 'moderate') moderate++;
    else minor++;
  }
  return { critical, serious, moderate, minor };
}

function extractViolations(report: AceRawReport): AceViolation[] {
  const out: AceViolation[] = [];
  for (const file of report.assertions ?? []) {
    for (const a of file.assertions ?? []) {
      if (a['earl:result']?.['earl:outcome']?.['@id'] !== 'earl:fail') continue;
      const id = a['earl:test']?.['@id'] ?? 'unknown';
      const impactRaw = a['earl:test']?.['earl:impact'] ?? 'moderate';
      const impact: AceImpact = (['critical', 'serious', 'moderate', 'minor'] as const).includes(
        impactRaw as AceImpact,
      )
        ? (impactRaw as AceImpact)
        : 'moderate';
      out.push({
        id,
        impact,
        description: a['earl:result']?.['dct:description'] ?? '',
      });
    }
  }
  return out;
}
