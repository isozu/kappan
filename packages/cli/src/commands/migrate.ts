import path from 'node:path';
import { Command, Option } from 'clipanion';
import { migrate } from '@kappan/migrate-review';

export class MigrateCommand extends Command {
  static override paths = [['migrate']];

  static override usage = Command.Usage({
    description: 'Migrate a Re:VIEW project into a Kappan project.',
    examples: [
      ['Migrate to <source>-kappan', 'kappan migrate ./my-review-book'],
      ['Specify output directory', 'kappan migrate ./book --out ./book-kappan'],
      ['Dry run (no files written)', 'kappan migrate ./book --dry-run'],
      ['Overwrite existing output', 'kappan migrate ./book --out ./existing --force'],
    ],
  });

  sourceDir = Option.String({ required: true });

  outDir = Option.String('--out,-o', {
    description: 'Target directory (default: <sourceDir>-kappan)',
  });

  dryRun = Option.Boolean('--dry-run', false, {
    description: 'Do not write any files, only compute and print summary',
  });

  reportOnly = Option.Boolean('--report-only', false, {
    description: 'Print only the migration report; do not write the converted project',
  });

  force = Option.Boolean('--force', false, {
    description: 'Overwrite target directory if it already exists',
  });

  async execute(): Promise<number> {
    const source = path.resolve(this.sourceDir);
    try {
      const result = await migrate({
        sourceDir: source,
        ...(this.outDir ? { outDir: this.outDir } : {}),
        dryRun: this.dryRun,
        reportOnly: this.reportOnly,
        force: this.force,
      });
      this.context.stdout.write(
        `✓ Migrated ${result.filesConverted} chapter(s), copied ${result.imagesCopied} image(s)\n`,
      );
      this.context.stdout.write(`  Target: ${result.targetDir}\n`);
      if (result.unsupported.length > 0) {
        this.context.stdout.write(
          `  ⚠ ${result.unsupported.length} unsupported notation(s); see migration-report.md\n`,
        );
      }
      if (result.ignoredFields.length > 0) {
        this.context.stdout.write(
          `  ⚠ ${result.ignoredFields.length} config field(s) ignored; see migration-report.md\n`,
        );
      }
      if (this.reportOnly) {
        this.context.stdout.write('\n---\n' + result.report + '\n');
      }
      return 0;
    } catch (err) {
      this.context.stderr.write(`✗ ${(err as Error).message}\n`);
      return 1;
    }
  }
}
