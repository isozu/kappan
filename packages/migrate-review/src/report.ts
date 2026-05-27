import type { ConvertedConfig } from './parseConfig.js';

export interface ReportInput {
  readonly sourceDir: string;
  readonly targetDir: string;
  readonly filesConverted: number;
  readonly notationsMatched: number;
  readonly imagesCopied: number;
  readonly unsupported: ReadonlyArray<{
    readonly file: string;
    readonly line: number;
    readonly snippet: string;
  }>;
  readonly ignoredConfigFields: ConvertedConfig['ignoredFields'];
  readonly ignoredSections: readonly string[];
  /** PART: が検出された場合の各部メタ情報 */
  readonly parts?: ReadonlyArray<{
    readonly number: number;
    readonly title: string;
    readonly chapterCount: number;
  }>;
  readonly generatedAt: Date;
}

/**
 * migration-report.md の本文を組み立てる。
 *
 * レポートは「冒頭サマリ → M1 対応済 → M2 対応予定 → M3 対応予定 → 個別詳細」
 * の順で構成し、移行後の利用者が「いま手で直すこと」と「将来 Kappan が拾うこと」を
 * 一目で切り分けられるようにする。
 */
export function buildReport(input: ReportInput): string {
  const lines: string[] = [];
  lines.push('# Kappan Migration Report');
  lines.push('');
  lines.push(`- Source: ${input.sourceDir}`);
  lines.push(`- Target: ${input.targetDir}`);
  lines.push(`- Generated: ${input.generatedAt.toISOString()}`);
  lines.push('');

  // ── Summary ───────────────────────────────────────────
  lines.push('## Summary');
  lines.push('');
  lines.push(
    `- **Unsupported notations: ${input.unsupported.length} 件**（このうち M1 では対応していません）`,
  );
  lines.push(`- Files converted: ${input.filesConverted}`);
  lines.push(`- Re:VIEW notations matched: ${input.notationsMatched}`);
  lines.push(`- Config fields ignored: ${input.ignoredConfigFields.length}`);
  lines.push(`- Images copied: ${input.imagesCopied}`);
  if (input.ignoredSections.length > 0) {
    lines.push(`- Catalog sections with warnings: ${input.ignoredSections.length}`);
  }
  lines.push('');

  // ── M1 / M2 で対応した内容 ────────────────────────────
  lines.push('## ✅ M1 / M2 で対応した内容');
  lines.push('');
  lines.push(
    `- Re:VIEW notations matched: ${input.notationsMatched} 件（インライン 25+ 種、ブロック 18+ 種）`,
  );
  lines.push('- Catalog sections handled: PREDEF, CHAPS, APPENDIX, POSTDEF');
  if (input.parts && input.parts.length > 0) {
    lines.push(`- PART ネスト構造を正規変換（M2-D）：${input.parts.length} 部`);
    for (const p of input.parts) {
      lines.push(`  - 第${p.number}部 \`${p.title}\`：${p.chapterCount} 章`);
    }
  }
  lines.push(
    '- config.yml 主要フィールド：booktitle, bookname, aut/edt/trl, language, publisher, isbn, date, coverimage',
  );
  lines.push(`- Images copied: ${input.imagesCopied}`);
  lines.push(
    '- 生成 `kappan.config.ts` に `[reviewCompat(), figureNumbering(), kinsoku()]` を含めて出力',
  );
  lines.push('');

  // ── M2 で対応予定（このプロジェクトに残る項目）────────
  lines.push('## ⏳ M2 で対応予定');
  lines.push('');
  const m2HintItems: string[] = [];
  if (hasConfigKey(input.ignoredConfigFields, 'stylesheet')) {
    m2HintItems.push('`stylesheet`: カスタム CSS を `theme({ additionalCss })` で受理');
  }
  if (hasConfigKey(input.ignoredConfigFields, 'toc_depth')) {
    m2HintItems.push('`toc_depth`: `output.tocDepth` 経由で設定可能に');
  }
  if (m2HintItems.length === 0) {
    m2HintItems.push('（このプロジェクトには M2 で対応する項目は検出されませんでした）');
  }
  m2HintItems.push('`//texequation` / 数式の KaTeX 連携');
  m2HintItems.push('`@<tcy>` 縦中横の縦組み実装');
  m2HintItems.push('`@<idx>` / `mendex` 相当の索引生成（plugin-jp-index）');
  m2HintItems.push('縦組みテーマ（themes-sumi）');
  for (const item of m2HintItems) {
    lines.push(`- ${item}`);
  }
  lines.push('');

  // ── M3 で対応予定 ─────────────────────────────────────
  lines.push('## 🔜 M3 で対応予定');
  lines.push('');
  lines.push('- Full Re:VIEW notation coverage を含む完全変換');
  lines.push('- `review-ext.rb` プラグインの部分対応');
  lines.push('- LSP / VSCode 拡張統合');
  lines.push('- 商業 KDP / Apple Books 入稿リント（plugin-kdp-lint）');
  lines.push('');

  // ── Catalog warnings ──────────────────────────────────
  if (input.ignoredSections.length > 0) {
    lines.push('## Catalog Warnings');
    lines.push('');
    for (const section of input.ignoredSections) {
      lines.push(`- ${section}`);
    }
    lines.push('');
  }

  // ── Unsupported notations ─────────────────────────────
  if (input.unsupported.length > 0) {
    lines.push('## Unsupported Notations');
    lines.push('');
    // ファイルごとにグループ化
    const byFile = new Map<string, typeof input.unsupported>();
    for (const u of input.unsupported) {
      const list = byFile.get(u.file);
      if (list) {
        (list as Array<typeof u>).push(u);
      } else {
        byFile.set(u.file, [u]);
      }
    }
    for (const [file, items] of byFile) {
      lines.push(`### ${file}`);
      lines.push('');
      for (const u of items) {
        lines.push(`- Line ${u.line}: \`${u.snippet}\``);
      }
      lines.push('');
    }
  }

  // ── Ignored config fields ─────────────────────────────
  if (input.ignoredConfigFields.length > 0) {
    lines.push('## Ignored Config Fields');
    lines.push('');
    for (const f of input.ignoredConfigFields) {
      lines.push(`- \`${f.key}\`: ${f.reason}`);
    }
    lines.push('');
  }

  // ── Next Steps ────────────────────────────────────────
  lines.push('## Next Steps');
  lines.push('');
  lines.push(
    '1. Review the unsupported notations above and replace them with Markdown equivalents.',
  );
  lines.push('2. Open `kappan.config.ts` and verify the generated metadata.');
  lines.push('3. Run `pnpm kappan build --validate` to verify the EPUB output.');
  lines.push('');

  return lines.join('\n');
}

function hasConfigKey(
  fields: ReadonlyArray<{ key: string; reason: string }>,
  key: string,
): boolean {
  return fields.some((f) => f.key === key);
}
