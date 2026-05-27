# @kappan/plugin-review-compat

Re:VIEW 記法の互換レイヤー。`@<code>{...}`、`//list[][]{...//}`、`={id}` 見出しなど、Re:VIEW で頻出する 30 個の記法を Markdown / Kappan 拡張記法に変換する。

既存 Re:VIEW 原稿を最小修正で Kappan に持ち込みたい書籍著者向け。

## Installation

```bash
pnpm add @kappan/plugin-review-compat
```

## Usage

```typescript
import { defineConfig } from '@kappan/core';
import { reviewCompat } from '@kappan/plugin-review-compat';

export default defineConfig({
  // 他プラグインより先に置く（onSource フックで文字列前処理する）
  plugins: [reviewCompat() /* ... */],
});
```

## Supported Notations

| Re:VIEW                            | 変換後                      |
| ---------------------------------- | --------------------------- |
| `@<code>{x}`                       | `` `x` ``                   |
| `@<b>{x}`                          | `**x**`                     |
| `@<i>{x}`                          | `*x*`                       |
| `@<ruby>{漢字,かんじ}`             | `{漢字\|かんじ}`            |
| `@<href>{URL,テキスト}`            | `[テキスト](URL)`           |
| `@<fn>{id}`                        | `[^id]`                     |
| `//list[id][caption][lang]{...//}` | フェンスコード              |
| `//emlist[caption][lang]{...//}`   | フェンスコード              |
| `//cmd{...//}`                     | ` ```shell `                |
| `//note{...//}` 系                 | GFM admonition              |
| `//image[id][caption]`             | `![caption](images/id.png)` |
| `//footnote[id][text]`             | `[^id]: text`               |
| `={id} 見出し`                     | `# 見出し {#id}`            |

完全互換ではない。未対応記法は HTML コメント `<!-- REVIEW-UNSUPPORTED: ... -->` として残る。詳細は [Kappan リポジトリの `examples/review-compat-demo`](https://github.com/isozu/kappan/tree/main/examples/review-compat-demo) を参照。

## Options

```typescript
reviewCompat({ warnOnUnsupported: true }); // デフォルト true
```

## Documentation

- [Kappan リポジトリ](https://github.com/isozu/kappan)

## License

MIT
