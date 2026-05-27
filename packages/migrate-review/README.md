# @kappan/migrate-review

既存の Re:VIEW プロジェクトを Kappan プロジェクトに一括変換するツール。`.re` ファイル、`config.yml`、`catalog.yml`、画像ディレクトリをまとめて変換し、`kappan build` がそのまま通る Kappan プロジェクトを出力する。

## Installation

```bash
pnpm add -D @kappan/migrate-review
```

通常は `@kappan/cli` 経由で `kappan migrate` コマンドとして使う。

## Usage

### CLI

```bash
kappan migrate <source-dir> [--out <target>] [--dry-run] [--force]
```

- `<source-dir>`：Re:VIEW プロジェクトのルートディレクトリ
- `--out, -o`：出力先（省略時 `<source>-kappan`）
- `--dry-run`：ファイルを書き出さず、結果サマリだけ
- `--report-only`：`migration-report.md` のみ生成
- `--force`：既存出力ディレクトリを上書き

### Programmatic API

```typescript
import { migrate } from '@kappan/migrate-review';

const result = await migrate({
  sourceDir: './my-review-book',
  outDir: './my-review-book-kappan',
  force: false,
});

console.log(`Converted ${result.filesConverted} chapters`);
console.log(`Unsupported notations: ${result.unsupported.length}`);
```

## 対応マッピング

### config.yml → kappan.config.ts

| Re:VIEW                   | Kappan                                    |
| ------------------------- | ----------------------------------------- |
| `bookname`                | `output.filename`                         |
| `booktitle`               | `metadata.title`                          |
| `aut`（文字列または配列） | `metadata.creator[].name`（role: 'aut'）  |
| `edt`                     | role: 'edt' creator                       |
| `trl`                     | role: 'trl' creator                       |
| `language`                | `metadata.language`（デフォルト 'ja'）    |
| `date`                    | `metadata.date`                           |
| `publisher`               | `metadata.publisher`                      |
| `isbn`                    | `metadata.identifier`（`urn:isbn:` 形式） |

### catalog.yml → front-matter `next` チェーン

`PREDEF` → `CHAPS` → `APPENDIX` → `POSTDEF` の順序で章を連結し、各章 Markdown の front-matter に `next` を埋め込む。

### 記法変換

`@kappan/plugin-review-compat` の `transformReviewSource()` を再利用。30 種類超の主要記法を Markdown / Kappan 拡張記法に変換する。詳細は [plugin-review-compat の README](../plugin-review-compat/README.md) を参照。

## 未対応記法の扱い

完全互換は目指さない。変換できない記法は次のように扱う。

- インライン記法（`@<bogus>{...}` 等）：`<!-- REVIEW-UNSUPPORTED: ... -->` として保存
- ブロック記法（`//unknown_block{...}` 等）：同上
- config フィールド：`migration-report.md` に列挙

すべての未対応は変換後ディレクトリの `migration-report.md` で確認できる。

## 出力例

```
my-review-book-kappan/
├── kappan.config.ts             # config.yml から生成
├── migration-report.md          # 変換レポート
├── src/
│   ├── preface.md
│   ├── chap01.md                # front-matter で next 連結
│   ├── chap02.md
│   └── colophon.md
└── images/                      # 元 images/ ディレクトリのコピー
    └── *.png
```

## 制限事項

- `stylesheet` のカスタム CSS は `theme({ additionalCss })` へ転記（テーマで作り込む場合は別途調整）
- 画像ファイル名の拡張子推定が失敗した場合は手動修正が必要
- `review-ext.rb` などのカスタム拡張は未対応

## License

MIT
