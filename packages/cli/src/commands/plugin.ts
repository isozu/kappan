import path from 'node:path';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { Command, Option } from 'clipanion';

/**
 * `kappan plugin` — サードパーティプラグイン開発ワークフロー。
 *
 * サブコマンド：
 *   - init <name>   : npm パッケージ skeleton を生成（definePlugin の hello world 雛形）
 *   - test [dir]    : プラグインの typecheck + test を実行
 *   - link [dir]    : `pnpm link --global` で開発中プラグインをローカル参照可能に
 *   - publish [dir] : npm publish 前の検査（package.json / version / exports / build）
 */

const KAPPAN_CORE_VERSION = '^0.1.0';

export class PluginInitCommand extends Command {
  static override paths = [['plugin', 'init']];

  static override usage = Command.Usage({
    description: 'Scaffold a new Kappan plugin npm package.',
    examples: [
      ['Create a plugin package', 'kappan plugin init my-plugin'],
      ['Create in a directory', 'kappan plugin init my-plugin --out ./packages/my-plugin'],
    ],
  });

  name = Option.String({ required: true });

  outDir = Option.String('--out,-o', {
    description: 'Target directory (default: ./<name>)',
  });

  kind = Option.String('--kind,-k', 'transform', {
    description: 'Plugin kind: syntax | transform | output (default: transform)',
  });

  force = Option.Boolean('--force,-f', false, {
    description: 'Overwrite target directory if it is non-empty',
  });

  async execute(): Promise<number> {
    const pkgName = normalizePackageName(this.name);
    const factory = factoryNameFromPackage(this.name);
    const kind = this.kind;
    if (!['syntax', 'transform', 'output'].includes(kind)) {
      this.context.stderr.write(
        `✗ Unknown kind "${kind}". Use one of: syntax, transform, output\n`,
      );
      return 2;
    }

    const target = path.resolve(this.outDir ?? `./${dirNameFromPackage(this.name)}`);
    if (existsSync(target)) {
      const entries = await readdir(target);
      if (entries.filter((e) => !e.startsWith('.')).length > 0 && !this.force) {
        this.context.stderr.write(
          `✗ Target directory is not empty: ${target}\n  Use --force to overwrite.\n`,
        );
        return 1;
      }
    }

    const files = buildPluginSkeleton({ pkgName, factory, kind });
    await mkdir(target, { recursive: true });
    for (const [rel, content] of files) {
      const abs = path.join(target, rel);
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, content, 'utf-8');
    }

    this.context.stdout.write(`✓ Created Kappan plugin "${pkgName}" at ${target}\n`);
    this.context.stdout.write(`  Factory: ${factory}()\n`);
    this.context.stdout.write(`  Kind: ${kind}\n`);
    this.context.stdout.write(`\nNext steps:\n`);
    this.context.stdout.write(`  cd ${path.relative(process.cwd(), target) || '.'}\n`);
    this.context.stdout.write(`  pnpm install\n`);
    this.context.stdout.write(`  kappan plugin test\n`);
    return 0;
  }
}

export class PluginTestCommand extends Command {
  static override paths = [['plugin', 'test']];

  static override usage = Command.Usage({
    description: 'Run typecheck and tests for a plugin package.',
    examples: [['Test the plugin in the current dir', 'kappan plugin test']],
  });

  dir = Option.String({ required: false });

  async execute(): Promise<number> {
    const dir = path.resolve(this.dir ?? '.');
    const pkgPath = path.join(dir, 'package.json');
    if (!existsSync(pkgPath)) {
      this.context.stderr.write(`✗ No package.json found in ${dir}\n`);
      return 1;
    }
    const pkg = JSON.parse(await readFile(pkgPath, 'utf-8')) as PackageJson;

    const scripts = pkg.scripts ?? {};
    let ran = false;
    if (scripts['typecheck']) {
      ran = true;
      const code = await runScript('pnpm', ['run', 'typecheck'], dir, this);
      if (code !== 0) return code;
    }
    if (scripts['test']) {
      ran = true;
      const code = await runScript('pnpm', ['run', 'test'], dir, this);
      if (code !== 0) return code;
    }
    if (!ran) {
      this.context.stderr.write(
        `✗ No "typecheck" or "test" script in ${pkgPath}. Add one to package.json.\n`,
      );
      return 1;
    }
    this.context.stdout.write(`✓ plugin test passed for ${pkg.name ?? dir}\n`);
    return 0;
  }
}

export class PluginLinkCommand extends Command {
  static override paths = [['plugin', 'link']];

  static override usage = Command.Usage({
    description: 'Globally link a plugin package via pnpm for local development.',
    examples: [['Link the plugin in the current dir', 'kappan plugin link']],
  });

  dir = Option.String({ required: false });

  async execute(): Promise<number> {
    const dir = path.resolve(this.dir ?? '.');
    if (!existsSync(path.join(dir, 'package.json'))) {
      this.context.stderr.write(`✗ No package.json found in ${dir}\n`);
      return 1;
    }
    const code = await runScript('pnpm', ['link', '--global'], dir, this);
    if (code === 0) {
      this.context.stdout.write(
        `✓ Linked. In your book project, run: pnpm link --global <plugin-name>\n`,
      );
    }
    return code;
  }
}

export class PluginPublishCommand extends Command {
  static override paths = [['plugin', 'publish']];

  static override usage = Command.Usage({
    description: 'Pre-publish checks for a Kappan plugin (does not publish unless --yes).',
    examples: [
      ['Dry-run checks', 'kappan plugin publish'],
      ['Actually publish', 'kappan plugin publish --yes'],
    ],
  });

  dir = Option.String({ required: false });

  yes = Option.Boolean('--yes', false, {
    description: 'Actually run `pnpm publish` after checks pass (otherwise dry-run only)',
  });

  async execute(): Promise<number> {
    const dir = path.resolve(this.dir ?? '.');
    const pkgPath = path.join(dir, 'package.json');
    if (!existsSync(pkgPath)) {
      this.context.stderr.write(`✗ No package.json found in ${dir}\n`);
      return 1;
    }
    const pkg = JSON.parse(await readFile(pkgPath, 'utf-8')) as PackageJson;

    const problems = lintPublishablePackage(pkg);
    for (const p of problems) {
      this.context.stderr.write(`✗ ${p}\n`);
    }
    if (problems.length > 0) {
      this.context.stderr.write(`\nFix the issues above before publishing.\n`);
      return 2;
    }

    this.context.stdout.write(`✓ Pre-publish checks passed for ${pkg.name}@${pkg.version}\n`);

    if (!this.yes) {
      this.context.stdout.write(
        `  (dry-run) Re-run with --yes to actually publish via 'pnpm publish'.\n`,
      );
      const code = await runScript('pnpm', ['publish', '--dry-run', '--no-git-checks'], dir, this);
      return code;
    }

    return runScript('pnpm', ['publish', '--access', 'public', '--no-git-checks'], dir, this);
  }
}

interface PackageJson {
  name?: string;
  version?: string;
  type?: string;
  main?: string;
  types?: string;
  exports?: unknown;
  private?: boolean;
  scripts?: Record<string, string>;
  keywords?: string[];
}

/**
 * publish 前検査。npm 公開に必要な最低条件を確認する。
 */
export function lintPublishablePackage(pkg: PackageJson): string[] {
  const problems: string[] = [];
  if (!pkg.name) problems.push('package.json is missing "name"');
  else if (!/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(pkg.name)) {
    problems.push(`package.json "name" is not a valid npm name: ${pkg.name}`);
  }
  if (!pkg.version) problems.push('package.json is missing "version"');
  else if (!/^\d+\.\d+\.\d+/.test(pkg.version)) {
    problems.push(`package.json "version" is not semver: ${pkg.version}`);
  }
  if (pkg.private === true) {
    problems.push('package.json has "private": true — set it to false to publish');
  }
  if (!pkg.exports && !pkg.main) {
    problems.push('package.json needs "exports" or "main" so the package is importable');
  }
  if (!(pkg.keywords ?? []).some((k) => k === 'kappan-plugin')) {
    problems.push('package.json "keywords" should include "kappan-plugin" for discoverability');
  }
  return problems;
}

function buildPluginSkeleton(args: {
  pkgName: string;
  factory: string;
  kind: string;
}): Array<readonly [string, string]> {
  const { pkgName, factory, kind } = args;
  const out: Array<readonly [string, string]> = [];

  out.push([
    'package.json',
    JSON.stringify(
      {
        name: pkgName,
        version: '0.1.0',
        type: 'module',
        description: `A Kappan ${kind} plugin`,
        main: './src/index.ts',
        types: './src/index.ts',
        exports: { '.': './src/index.ts' },
        private: false,
        scripts: {
          typecheck: 'tsc --noEmit',
          build: 'tsc',
          test: 'vitest run',
        },
        dependencies: {
          '@kappan/core': KAPPAN_CORE_VERSION,
        },
        devDependencies: {
          typescript: '^5.6.3',
          vitest: '^2.1.9',
        },
        keywords: ['kappan-plugin', 'kappan'],
        license: 'MIT',
      },
      null,
      2,
    ) + '\n',
  ]);

  out.push([
    'tsconfig.json',
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          noEmit: true,
        },
        include: ['src'],
      },
      null,
      2,
    ) + '\n',
  ]);

  out.push(['src/index.ts', renderPluginIndex(pkgName, factory, kind)]);
  out.push(['src/index.test.ts', renderPluginTest(factory)]);
  out.push(['README.md', renderPluginReadme(pkgName, factory)]);
  out.push(['.gitignore', 'node_modules/\ndist/\n']);

  return out;
}

function renderPluginIndex(pkgName: string, factory: string, kind: string): string {
  const hook =
    kind === 'syntax'
      ? `    async onSource(source, ctx) {
      ctx.logger.info('${pkgName} onSource: ' + source.path);
      // Re:VIEW 風記法や独自記法を Markdown へ前処理する場所。
      return source;
    },`
      : kind === 'output'
        ? `    async onPackage(pkg, ctx) {
      ctx.logger.info('${pkgName} onPackage');
      // 完成した EpubPackage を読み出して追加アセットを差し込む場所。
    },`
        : `    onMdast(tree, ctx) {
      ctx.logger.info('${pkgName} onMdast');
      // mdast を走査して書き換える場所（図表番号・ルビ等の変換）。
      void tree;
    },`;

  return `import { definePlugin } from '@kappan/core';

export interface ${capitalize(factory)}Options {
  /** デモ用オプション。実装に合わせて差し替えてください。 */
  readonly enabled?: boolean;
}

/**
 * ${pkgName} — Kappan ${kind} プラグインの雛形。
 *
 * \`kappan plugin init\` で生成されました。\`hooks\` を実装して機能を足してください。
 * 利用可能なフック一覧は docs/plugin-authoring.md を参照。
 */
export const ${factory} = definePlugin<${capitalize(factory)}Options>({
  name: '${pkgName}',
  version: '0.1.0',
  kind: '${kind}',
  hooks: (options = {}) => ({
${hook}
  }),
});
`;
}

function renderPluginTest(factory: string): string {
  return `import { describe, expect, it } from 'vitest';
import { ${factory} } from './index.js';

describe('${factory}', () => {
  it('is a valid Kappan plugin definition', () => {
    const plugin = ${factory};
    expect(plugin.name).toMatch(/^@?[a-z]/);
    expect(plugin.version).toBe('0.1.0');
    expect(typeof plugin.hooks).toBe('function');
  });

  it('produces a hooks object', () => {
    const hooks = ${factory}.hooks({});
    expect(typeof hooks).toBe('object');
  });
});
`;
}

function renderPluginReadme(pkgName: string, factory: string): string {
  return `# ${pkgName}

A Kappan plugin. Generated by \`kappan plugin init\`.

## Usage

\`\`\`ts
import { defineConfig } from '@kappan/core';
import { mono } from '@kappan/themes-mono';
import { ${factory} } from '${pkgName}';

export default defineConfig({
  metadata: { title: 'My Book', creator: [{ name: 'Me' }], language: 'ja' },
  source: { entry: 'src/index.md', baseDir: 'src/' },
  output: { dir: 'dist/', filename: '{title}.epub' },
  theme: mono(),
  plugins: [${factory}()],
});
\`\`\`

## Development

\`\`\`bash
pnpm install
kappan plugin test       # typecheck + vitest
kappan plugin link       # link globally for local book projects
kappan plugin publish    # pre-publish checks (add --yes to publish)
\`\`\`
`;
}

function normalizePackageName(name: string): string {
  // 既にスコープ付き or 妥当な npm 名ならそのまま、そうでなければ kebab 化
  if (/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(name)) return name;
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function dirNameFromPackage(name: string): string {
  const base = name.includes('/') ? name.split('/').pop()! : name;
  return base.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '');
}

function factoryNameFromPackage(name: string): string {
  const base = name.includes('/') ? name.split('/').pop()! : name;
  const stripped = base.replace(/^(kappan-)?plugin-/, '');
  const camel = stripped
    .toLowerCase()
    .replace(/[^a-z0-9]+(.)/g, (_m, c: string) => c.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '');
  return camel || 'myPlugin';
}

function capitalize(s: string): string {
  return s.length > 0 ? s[0]!.toUpperCase() + s.slice(1) : s;
}

/**
 * 子プロセスでスクリプトを実行し、終了コードを返す。stdout/stderr は親に流す。
 */
function runScript(
  command: string,
  args: readonly string[],
  cwd: string,
  cmd: Command,
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(command, args as string[], { cwd, stdio: 'pipe', shell: false });
    child.stdout.on('data', (d: Buffer) => cmd.context.stdout.write(d.toString()));
    child.stderr.on('data', (d: Buffer) => cmd.context.stderr.write(d.toString()));
    child.on('error', (err) => {
      cmd.context.stderr.write(`✗ Failed to run ${command}: ${err.message}\n`);
      resolve(1);
    });
    child.on('close', (code) => resolve(code ?? 0));
  });
}
