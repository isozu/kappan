# How-to: KaTeX 数式を入れる

数式は `@kappan/remark-tech` の `katexMath`（0.2.0）でレンダリングする。`$...$` と `$$...$$` を解析し、**デフォルトは MathML 出力**（EPUB 3 ネイティブ・アクセシブル）。

## インライン数式

```markdown
質量とエネルギーの関係は $E = mc^2$ で表される。
```

## ディスプレイ数式

```markdown
$$
\int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}
$$
```

## 数式番号

ディスプレイ数式に `{#eq:id}` を付けると `figureNumbering()` が番号を振り、`[@eq:id]` で参照できる。

```text
$$
a^2 + b^2 = c^2
$$ {#eq:pythagoras}

ピタゴラスの定理は [@eq:pythagoras] による。
```

## プラグインを有効にする

```ts
import { katexMath } from '@kappan/remark-tech';
import { figureNumbering } from '@kappan/plugin-figure-numbering';

export default defineConfig({
  // ...
  plugins: [katexMath(), figureNumbering()],
});
```

## Kindle ターゲットなら `output: 'htmlAndMathml'`

**Kindle は MathML を表示できません。** Kindle 配信を想定するなら、HTML+CSS の視覚表示と隠し MathML を併記する `htmlAndMathml` を使う。

```ts
plugins: [katexMath({ output: 'htmlAndMathml' })],
```

| `output`           | 用途                                                              |
| ------------------ | ----------------------------------------------------------------- |
| `'mathml'`（既定） | EPUB 3 標準・アクセシブル。Apple Books / Thorium 等は MathML 対応 |
| `'htmlAndMathml'`  | Kindle 互換。視覚表示は HTML+CSS、MathML は支援技術用に併記       |

> MathML 非対応リーダー（Kindle など）への配慮として `htmlAndMathml` を使う。リーダーごとの対応状況は [リーダー互換性](../../README.md#リーダー互換性) を参照。

## Re:VIEW `//texequation` からの移行

移行時、`//texequation` ブロックは `katexMath()` で正式にレンダリングされる。`$$...$$` に書き換えれば番号付けも効く。

## 関連

- [記法リファレンス](../reference/notations.md)
