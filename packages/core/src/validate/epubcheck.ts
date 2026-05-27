import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

export interface EpubcheckIssue {
  readonly id: string;
  readonly severity: 'FATAL' | 'ERROR' | 'WARNING' | 'INFO' | 'USAGE' | 'SUPPRESSED';
  readonly message: string;
  readonly locations?: ReadonlyArray<{
    readonly path?: string;
    readonly line?: number;
    readonly column?: number;
  }>;
}

export interface EpubcheckResult {
  readonly errors: number;
  readonly warnings: number;
  readonly fatals: number;
  readonly issues: readonly EpubcheckIssue[];
  /** EPUBCheck 自身が返したバージョン文字列 */
  readonly version?: string;
}

export class EpubcheckNotInstalledError extends Error {
  constructor(triedPaths: readonly string[]) {
    super(
      `EPUBCheck not found. Tried:\n${triedPaths.map((p) => `  - ${p}`).join('\n')}\n` +
        `Run \`pnpm epubcheck:fetch\` to install it, or set KAPPAN_EPUBCHECK_PATH.`,
    );
    this.name = 'EpubcheckNotInstalledError';
  }
}

/**
 * EPUBCheck JAR のパスを以下の優先順位で解決する：
 *   1. 環境変数 KAPPAN_EPUBCHECK_PATH
 *   2. ~/.kappan/tools/epubcheck/epubcheck-<version>/epubcheck.jar
 *
 * 解決できない場合は EpubcheckNotInstalledError を投げる。
 */
export function resolveEpubcheckJar(): string {
  const tried: string[] = [];

  const envPath = process.env['KAPPAN_EPUBCHECK_PATH'];
  if (envPath) {
    tried.push(envPath);
    if (existsSync(envPath)) return envPath;
  }

  const cacheBase = path.join(os.homedir(), '.kappan', 'tools', 'epubcheck');
  // glob 不要、決まったバージョンディレクトリを試す
  const candidates = ['epubcheck-5.2.1', 'epubcheck-5.1.0'];
  for (const c of candidates) {
    const p = path.join(cacheBase, c, 'epubcheck.jar');
    tried.push(p);
    if (existsSync(p)) return p;
  }

  throw new EpubcheckNotInstalledError(tried);
}

interface RawIssue {
  ID?: string;
  severity?: string;
  message?: string;
  locations?: Array<{ fileName?: string; line?: number; column?: number }>;
}

interface RawReport {
  checker?: { checkerVersion?: string };
  messages?: RawIssue[];
}

/**
 * EPUBCheck を JSON 出力モードで実行し、結果を解析して返す。
 *
 * 入稿チェックリストの「EPUBCheck 5.x」項目を担う。
 */
export async function runEpubcheck(
  epubPath: string,
  options?: {
    readonly javaPath?: string;
    readonly jarPath?: string;
  },
): Promise<EpubcheckResult> {
  const java = options?.javaPath ?? 'java';
  const jar = options?.jarPath ?? resolveEpubcheckJar();

  // EPUBCheck の JSON 出力は標準出力ではなく --json <file> 経由でしか得られない。
  // 一時ファイルを作って読み込む。
  const { mkdtemp, readFile, rm } = await import('node:fs/promises');
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'kappan-epubcheck-'));
  const reportPath = path.join(tmpRoot, 'report.json');

  try {
    await runJava(java, ['-jar', jar, '--quiet', '--json', reportPath, epubPath]);
    const text = await readFile(reportPath, 'utf-8');
    const raw = JSON.parse(text) as RawReport;
    return parseReport(raw);
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
}

function runJava(java: string, args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(java, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stdout.on('data', () => {
      /* drain */
    });
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8');
    });
    proc.on('error', reject);
    proc.on('exit', (code) => {
      // EPUBCheck は検証エラーがあると非ゼロを返すが、JSON レポートは出ているので無視する
      if (code === null) {
        reject(new Error(`EPUBCheck terminated by signal. stderr: ${stderr}`));
      } else {
        resolve();
      }
    });
  });
}

function parseReport(raw: RawReport): EpubcheckResult {
  const issues: EpubcheckIssue[] = [];
  let errors = 0;
  let warnings = 0;
  let fatals = 0;

  for (const m of raw.messages ?? []) {
    const severity = (m.severity ?? 'INFO') as EpubcheckIssue['severity'];
    if (severity === 'FATAL') fatals += 1;
    else if (severity === 'ERROR') errors += 1;
    else if (severity === 'WARNING') warnings += 1;

    const locations = (m.locations ?? []).map((l) => ({
      ...(l.fileName !== undefined ? { path: l.fileName } : {}),
      ...(l.line !== undefined ? { line: l.line } : {}),
      ...(l.column !== undefined ? { column: l.column } : {}),
    }));

    issues.push({
      id: m.ID ?? 'UNKNOWN',
      severity,
      message: m.message ?? '',
      ...(locations.length > 0 ? { locations } : {}),
    });
  }

  return {
    errors,
    warnings,
    fatals,
    issues,
    ...(raw.checker?.checkerVersion !== undefined ? { version: raw.checker.checkerVersion } : {}),
  };
}
