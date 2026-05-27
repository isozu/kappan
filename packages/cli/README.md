# @kappan/cli

Kappan のコマンドラインインターフェイス。

## Installation

```bash
pnpm add -D @kappan/cli
```

`bin` として `kappan` コマンドを提供する。

## Commands

### `kappan build`

Markdown ソースを EPUB 3.3 に変換する。

```bash
kappan build [--config <path>] [--out <dir>] [--validate] [--ace] [--quiet]
```

- `--config, -c`：設定ファイルのパス（デフォルト `./kappan.config.ts`）
- `--out, -o`：出力ディレクトリ（デフォルト `config.output.dir`）
- `--validate`：EPUBCheck を実行（Java 17+ 必要）
- `--ace`：ACE by DAISY によるアクセシビリティ検証
- `--quiet, -q`：通常出力を抑制

### `kappan preview`

HMR 付きライブプレビューサーバを起動する。

```bash
kappan preview [--config <path>] [--port 5173] [--host 127.0.0.1]
```

章 Markdown 編集を即座にブラウザに反映する。`Ctrl+C` で停止。

## Documentation

- [クイックスタート](https://github.com/isozu/kappan/blob/main/docs/quickstart.md)
- [Kappan リポジトリ](https://github.com/isozu/kappan)

## License

MIT
