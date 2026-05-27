import path from 'node:path';
import { Command, Option } from 'clipanion';
import { loadConfig } from '@kappan/core';
import { PreviewServer } from '../preview/server.js';

/**
 * `kappan preview` コマンド。
 *
 * Vite を使わない軽量実装（ADR 0006）：自前 HTTP + chokidar + SSE。
 * リーダーシミュレーションは将来対応予定。
 */
export class PreviewCommand extends Command {
  static override paths = [['preview']];

  static override usage = Command.Usage({
    description: 'Start a live preview server with chapter hot reload.',
    examples: [
      ['Start preview at default port 5173', 'kappan preview'],
      ['Start with custom config', 'kappan preview --config my-book.config.ts'],
      ['Use a different port', 'kappan preview --port 8080'],
    ],
  });

  configPath = Option.String('--config,-c', './kappan.config.ts');
  port = Option.String('--port,-p', '5173');
  host = Option.String('--host', '127.0.0.1');

  async execute(): Promise<number> {
    const configPath = path.resolve(this.configPath);
    let loaded;
    try {
      loaded = await loadConfig(configPath);
    } catch (err) {
      this.context.stderr.write(`✗ Failed to load config:\n  ${(err as Error).message}\n`);
      return 1;
    }

    const server = new PreviewServer({
      config: loaded.config,
      configDir: loaded.configDir,
      configPath: loaded.configPath,
      port: Number.parseInt(this.port, 10),
      host: this.host,
    });

    try {
      await server.start();
    } catch (err) {
      this.context.stderr.write(`✗ Failed to start preview: ${(err as Error).message}\n`);
      return 1;
    }

    // Ctrl+C で停止
    const stopHandler = async () => {
      this.context.stdout.write('\nStopping preview server...\n');
      await server.stop();
      process.exit(0);
    };
    process.on('SIGINT', stopHandler);
    process.on('SIGTERM', stopHandler);

    // サーバが動き続けるよう永続化
    await new Promise(() => {});
    return 0;
  }
}
