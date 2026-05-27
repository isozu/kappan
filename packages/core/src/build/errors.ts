import type { Diagnostic } from '../types.js';

/**
 * ビルドエラー。検証エラー（a11y 等）が出たときに投げる。
 * `diagnostics` フィールドに詳細な原因の一覧が含まれる。
 */
export class BuildError extends Error {
  readonly diagnostics: readonly Diagnostic[];

  constructor(message: string, diagnostics: readonly Diagnostic[]) {
    super(message);
    this.name = 'BuildError';
    this.diagnostics = diagnostics;
  }

  formatDiagnostics(): string {
    return this.diagnostics
      .map((d) => {
        const loc = d.range?.file ? ` (${d.range.file})` : '';
        return `  [${d.severity}] ${d.source}: ${d.message}${loc}`;
      })
      .join('\n');
  }
}
