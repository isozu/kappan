import { Builtins, Cli } from 'clipanion';
import pkg from '../package.json' with { type: 'json' };
import { BuildCommand } from './commands/build.js';
import { PreviewCommand } from './commands/preview.js';
import { MigrateCommand } from './commands/migrate.js';
import { InitCommand } from './commands/init.js';
import { ThemesListCommand, ThemesPreviewCommand } from './commands/themes.js';
import { CheckCommand } from './commands/check.js';
import {
  PluginInitCommand,
  PluginTestCommand,
  PluginLinkCommand,
  PluginPublishCommand,
} from './commands/plugin.js';

export function createCli(): Cli {
  const cli = new Cli({
    binaryLabel: 'Kappan',
    binaryName: 'kappan',
    binaryVersion: pkg.version,
  });
  cli.register(BuildCommand);
  cli.register(PreviewCommand);
  cli.register(MigrateCommand);
  cli.register(InitCommand);
  cli.register(ThemesListCommand);
  cli.register(ThemesPreviewCommand);
  cli.register(CheckCommand);
  cli.register(PluginInitCommand);
  cli.register(PluginTestCommand);
  cli.register(PluginLinkCommand);
  cli.register(PluginPublishCommand);
  cli.register(Builtins.HelpCommand);
  cli.register(Builtins.VersionCommand);
  return cli;
}

export {
  BuildCommand,
  PreviewCommand,
  MigrateCommand,
  InitCommand,
  ThemesListCommand,
  ThemesPreviewCommand,
  CheckCommand,
  PluginInitCommand,
  PluginTestCommand,
  PluginLinkCommand,
  PluginPublishCommand,
};
