import path from 'node:path';
import { Command, Option } from 'clipanion';
import {
  loadConfig,
  buildBook,
  BuildError,
  runEpubcheck,
  EpubcheckNotInstalledError,
  runAce,
  AceNotInstalledError,
  isAceStrictPass,
} from '@kappan/core';

/**
 * `kappan build` コマンド。
 */
export class BuildCommand extends Command {
  static override paths = [['build'], Command.Default];

  static override usage = Command.Usage({
    description: 'Build an EPUB 3.3 from your Markdown sources.',
    examples: [
      ['Build with default config', 'kappan build'],
      ['Specify a config file', 'kappan build --config my-book.config.ts'],
      ['Run EPUBCheck after building', 'kappan build --validate'],
    ],
  });

  configPath = Option.String('--config,-c', './kappan.config.ts', {
    description: 'Path to kappan.config.ts',
  });

  outDir = Option.String('--out,-o', {
    description: 'Output directory (default: config.output.dir)',
  });

  validate = Option.Boolean('--validate', false, {
    description: 'Run EPUBCheck after the build (requires Java 17+)',
  });

  ace = Option.Boolean('--ace', false, {
    description: 'Run ACE by DAISY accessibility check (requires @daisy/ace-core)',
  });

  aceStrict = Option.Boolean('--ace-strict', false, {
    description:
      'Fail the build when ACE reports any critical/serious accessibility violation. Implies --ace.',
  });

  simulateReader = Option.String('--simulate-reader', {
    description:
      'Reader profile to simulate for accessibility output (apple|kindle|kobo|thorium). ' +
      'Requires @kappan/plugin-reader-shim (M2-B) to be loaded; otherwise the value is ' +
      'recorded in the build log only.',
  });

  quiet = Option.Boolean('--quiet,-q', false, {
    description: 'Suppress non-error output',
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
    const { config, configDir } = loaded;

    const outDir = this.outDir
      ? path.resolve(this.outDir)
      : path.resolve(configDir, config.output.dir);

    const filename = config.output.filename.replace('{title}', sanitize(config.metadata.title));
    const outputPath = path.join(outDir, filename);

    try {
      const result = await buildBook({ config, configDir, outputPath });

      if (!this.quiet) {
        this.context.stdout.write(`✓ Built ${path.relative(process.cwd(), outputPath)}\n`);
        if (result.diagnostics.length > 0) {
          const warnings = result.diagnostics.filter((d) => d.severity === 'warning');
          if (warnings.length > 0) {
            this.context.stdout.write(
              `  (${warnings.length} warning${warnings.length === 1 ? '' : 's'})\n`,
            );
          }
        }
      }
    } catch (err) {
      if (err instanceof BuildError) {
        this.context.stderr.write(`✗ ${err.message}\n${err.formatDiagnostics()}\n`);
        return 1;
      }
      this.context.stderr.write(`✗ Unexpected error: ${(err as Error).message}\n`);
      return 3;
    }

    if (this.validate) {
      try {
        const report = await runEpubcheck(outputPath);
        if (report.fatals + report.errors > 0) {
          this.context.stderr.write(
            `✗ EPUBCheck: ${report.fatals} fatal, ${report.errors} error, ` +
              `${report.warnings} warning${report.warnings === 1 ? '' : 's'}\n`,
          );
          for (const issue of report.issues) {
            if (issue.severity === 'FATAL' || issue.severity === 'ERROR') {
              this.context.stderr.write(`  [${issue.severity}] ${issue.id}: ${issue.message}\n`);
            }
          }
          return 2;
        }
        if (!this.quiet) {
          this.context.stdout.write(
            `✓ EPUBCheck: 0 errors, ${report.warnings} warning${report.warnings === 1 ? '' : 's'}\n`,
          );
        }
      } catch (err) {
        if (err instanceof EpubcheckNotInstalledError) {
          this.context.stderr.write(`✗ ${err.message}\n`);
          return 3;
        }
        throw err;
      }
    }

    if (this.ace || this.aceStrict) {
      if (this.simulateReader) {
        // plugin-reader-shim と協調する想定。現状はログのみ。
        // shim 連携は今後 build パイプラインへフックを追加する。
        this.context.stdout.write(
          `ℹ Simulating reader profile: ${this.simulateReader} ` +
            `(reader-shim integration is wired in M2-B; ACE output is reader-agnostic for now).\n`,
        );
      }
      try {
        const result = await runAce(outputPath);
        const { critical, serious, moderate, minor } = result.byImpact;
        const strictPass = isAceStrictPass(result);

        if (result.outcome === 'FAIL' || result.details.length > 0) {
          // critical/serious は「ビルドエラー扱い」、moderate/minor は warning に分ける表示。
          const headSym = critical + serious > 0 ? '⚠' : 'ℹ';
          this.context.stdout.write(
            `${headSym} ACE: ${result.summary}\n` +
              `   impact breakdown: critical=${critical}, serious=${serious}, ` +
              `moderate=${moderate}, minor=${minor}\n`,
          );
          for (const v of result.details) {
            const tier = v.impact === 'critical' || v.impact === 'serious' ? 'error' : 'warn';
            this.context.stdout.write(`  [${tier}/${v.impact}] ${v.id}: ${v.description}\n`);
          }
          if (this.aceStrict && !strictPass) {
            this.context.stderr.write(
              `✗ ACE --strict: ${critical + serious} critical/serious violation(s); build failed. ` +
                `(moderate/minor are reported as warnings only.)\n`,
            );
            return 2;
          }
        } else if (!this.quiet) {
          this.context.stdout.write(`✓ ACE: ${result.summary}\n`);
        }
      } catch (err) {
        if (err instanceof AceNotInstalledError) {
          this.context.stderr.write(`✗ ${err.message}\n`);
          return 3;
        }
        throw err;
      }
    }

    return 0;
  }
}

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_');
}
