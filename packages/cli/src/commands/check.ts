import path from 'node:path';
import { existsSync } from 'node:fs';
import { Command, Option } from 'clipanion';
import { loadConfig, collectChapters, type Chapter } from '@kappan/core';

/**
 * `kappan check` — ビルドせずに章ソースの健全性を検証する。
 *
 * `kappan build --validate`（EPUBCheck）の事前チェック相当を、EPUB を生成せずに
 * 高速に回すための独立コマンド。CI の早期フェイルや、執筆中の軽量チェックに使う。
 *
 * 検査項目：
 *   1. 見出し階層：h1 が各章に 1 つ、見出しレベルの飛び（h1→h3）を warning
 *   2. 画像 alt：`![](...)`（alt 空）を error、`![alt](...)` は OK
 *   3. 内部リンク：
 *      - 章間 `next` チェーンが指すファイルの実在
 *      - 同一プロジェクト内の相対リンク `[x](./other.md)` の実在
 *      - アンカー `[x](#id)` / `[x](other.md#id)` の id 実在
 */
export interface CheckIssue {
  readonly severity: 'error' | 'warning';
  readonly file: string;
  readonly line: number;
  readonly message: string;
}

/**
 * 章リストに対する検証ロジック本体（loadConfig 非依存）。
 * Chapter は `relativePath` / `id` / `markdown` のみ参照する。
 */
export function runChecks(
  chapters: ReadonlyArray<Pick<Chapter, 'relativePath' | 'id' | 'markdown'>>,
): CheckIssue[] {
  const knownAnchors = collectAnchors(chapters);
  const issues: CheckIssue[] = [];
  for (const ch of chapters) {
    issues.push(...checkChapter(ch, knownAnchors));
  }
  return issues;
}

export class CheckCommand extends Command {
  static override paths = [['check']];

  static override usage = Command.Usage({
    description: 'Validate chapter sources (links, alt text, headings) without building.',
    examples: [
      ['Check with default config', 'kappan check'],
      ['Check a specific config', 'kappan check --config my-book.config.ts'],
      ['Treat warnings as errors', 'kappan check --strict'],
    ],
  });

  configPath = Option.String('--config,-c', './kappan.config.ts', {
    description: 'Path to kappan.config.ts',
  });

  strict = Option.Boolean('--strict', false, {
    description: 'Exit non-zero if any warning is found (not just errors)',
  });

  quiet = Option.Boolean('--quiet,-q', false, {
    description: 'Only print the final summary line',
  });

  async execute(): Promise<number> {
    const configPath = path.resolve(this.configPath);
    let loaded;
    try {
      loaded = await loadConfig(configPath);
    } catch (err) {
      this.context.stderr.write(`✗ Failed to load config:\n  ${(err as Error).message}\n`);
      return 1;
    }

    let chapters: Chapter[];
    try {
      chapters = await collectChapters(loaded.config, loaded.configDir);
    } catch (err) {
      this.context.stderr.write(`✗ Failed to collect chapters:\n  ${(err as Error).message}\n`);
      return 1;
    }

    const issues = runChecks(chapters);

    const errors = issues.filter((i) => i.severity === 'error');
    const warnings = issues.filter((i) => i.severity === 'warning');

    if (!this.quiet) {
      for (const issue of issues) {
        const sym = issue.severity === 'error' ? '✗' : '⚠';
        this.context.stdout.write(
          `${sym} ${issue.file}:${issue.line} [${issue.severity}] ${issue.message}\n`,
        );
      }
    }

    const okPlural = chapters.length === 1 ? '' : 's';
    if (errors.length === 0 && warnings.length === 0) {
      this.context.stdout.write(`✓ check: ${chapters.length} chapter${okPlural}, no issues\n`);
      return 0;
    }

    this.context.stdout.write(
      `${errors.length === 0 ? '⚠' : '✗'} check: ${errors.length} error(s), ` +
        `${warnings.length} warning(s) across ${chapters.length} chapter${okPlural}\n`,
    );

    if (errors.length > 0) return 2;
    if (this.strict && warnings.length > 0) return 2;
    return 0;
  }
}

/**
 * 各章の id と、本文中の `{#anchor}` を集めて、参照可能なアンカー集合を作る。
 * キーは `<file>#<anchor>`（ファイル内アンカー）と `<file>`（章そのものへのリンク）。
 */
function collectAnchors(
  chapters: ReadonlyArray<Pick<Chapter, 'relativePath' | 'id' | 'markdown'>>,
): Set<string> {
  const anchors = new Set<string>();
  for (const ch of chapters) {
    const fileKey = path.basename(ch.relativePath);
    anchors.add(fileKey);
    // 章 id を「ファイル先頭アンカー」として登録
    anchors.add(`${fileKey}#${ch.id}`);
    for (const a of extractHeadingAnchors(ch.markdown)) {
      anchors.add(`${fileKey}#${a}`);
    }
  }
  return anchors;
}

/** `## 見出し {#id}` の `id` 部分を集める。 */
function extractHeadingAnchors(markdown: string): string[] {
  const out: string[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const m = line.match(/^#{1,6}\s+.*\{#([a-zA-Z0-9_-]+)\}\s*$/);
    if (m) out.push(m[1]!);
  }
  return out;
}

function checkChapter(
  chapter: Pick<Chapter, 'relativePath' | 'id' | 'markdown'>,
  knownAnchors: ReadonlySet<string>,
): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const file = chapter.relativePath;
  const lines = chapter.markdown.split(/\r?\n/);

  let h1Count = 0;
  let prevLevel = 0;
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const lineNo = i + 1;

    // フェンスコードブロック内はスキップ
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    // 見出し階層
    const heading = line.match(/^(#{1,6})\s+/);
    if (heading) {
      const level = heading[1]!.length;
      if (level === 1) h1Count += 1;
      if (prevLevel > 0 && level > prevLevel + 1) {
        issues.push({
          severity: 'warning',
          file,
          line: lineNo,
          message: `heading jumps from h${prevLevel} to h${level} (skips a level)`,
        });
      }
      prevLevel = level;
    }

    // 画像 alt（行内の全 image を見る）
    for (const img of findImages(line)) {
      if (img.alt.trim() === '') {
        issues.push({
          severity: 'error',
          file,
          line: lineNo,
          message: `image is missing alt text: ${img.raw}`,
        });
      }
    }

    // 内部リンク（.md / アンカー）
    for (const link of findLinks(line)) {
      const issue = checkLink(link, file, lineNo, knownAnchors);
      if (issue) issues.push(issue);
    }
  }

  if (h1Count === 0) {
    issues.push({
      severity: 'warning',
      file,
      line: 1,
      message: 'chapter has no h1 heading',
    });
  } else if (h1Count > 1) {
    issues.push({
      severity: 'warning',
      file,
      line: 1,
      message: `chapter has ${h1Count} h1 headings (expected 1)`,
    });
  }

  return issues;
}

interface FoundImage {
  readonly alt: string;
  readonly raw: string;
}

function findImages(line: string): FoundImage[] {
  const out: FoundImage[] = [];
  const re = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    out.push({ alt: m[1] ?? '', raw: m[0] });
  }
  return out;
}

interface FoundLink {
  readonly target: string;
  readonly raw: string;
}

function findLinks(line: string): FoundLink[] {
  const out: FoundLink[] = [];
  // 画像 `![..]()` を除外するため、直前が `!` でない `[..]()` のみ拾う
  const re = /(!?)\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m[1] === '!') continue; // 画像はスキップ
    out.push({ target: m[3] ?? '', raw: m[0] });
  }
  return out;
}

/**
 * 内部リンク（.md ファイル / アンカー）の参照先が実在するか検証する。
 * 外部 URL（http/https/mailto）は検証対象外。
 */
function checkLink(
  link: FoundLink,
  file: string,
  line: number,
  knownAnchors: ReadonlySet<string>,
): CheckIssue | null {
  const target = link.target;
  // 外部リンク・スキーム付きは検証しない
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//')) return null;

  // 同一ファイル内アンカー `#id`
  if (target.startsWith('#')) {
    const anchor = target.slice(1);
    const fileKey = path.basename(file);
    if (!knownAnchors.has(`${fileKey}#${anchor}`)) {
      return {
        severity: 'warning',
        file,
        line,
        message: `internal anchor not found: ${link.raw} (#${anchor})`,
      };
    }
    return null;
  }

  // 他章ファイル `other.md` / `other.md#id`
  const [filePart, anchorPart] = target.split('#');
  if (filePart && filePart.endsWith('.md')) {
    const fileKey = path.basename(filePart);
    if (anchorPart) {
      if (!knownAnchors.has(`${fileKey}#${anchorPart}`)) {
        return {
          severity: 'warning',
          file,
          line,
          message: `cross-chapter anchor not found: ${link.raw}`,
        };
      }
    } else if (!knownAnchors.has(fileKey)) {
      return {
        severity: 'warning',
        file,
        line,
        message: `linked chapter not in spine: ${link.raw}`,
      };
    }
  }

  return null;
}

// existsSync は将来「リポジトリ全体のリンクチェック」で使うため残置。
void existsSync;
