# @kappan/plugin-admonition

囲み記事（admonition / callout）を Markdown に追加する Kappan プラグイン。
[remark-directive](https://github.com/remarkjs/remark-directive) の `:::` 記法を使う。

## 記法

```markdown
:::note
補足の注記。
:::

:::warning[互換性の注意]
古いリーダーでは MathML が表示できない。
:::
```

対応する種別：`note` / `tip` / `warning` / `caution` / `important` / `info` / `memo`
（Re:VIEW の `//note //tip //warning //caution //important //info //memo` に対応）。

## 出力

```html
<aside class="admonition warning">
  <p class="admonition-title">互換性の注意</p>
  <p>古いリーダーでは MathML が表示できない。</p>
</aside>
```

テーマ CSS の `.admonition` / `.admonition.warning` / `.admonition.tip` / `.admonition-title`
がそのまま装飾する（saiun / hibana テーマは対応済み）。`data.hName` 経由で生成するため、
`unsafeHtml` の全モード（`false` / `'sanitized'` / `'trusted'`）で安定して出力される。

## 使い方

```ts
import { defineConfig } from '@kappan/core';
import { saiun } from '@kappan/themes-saiun';
import { admonition } from '@kappan/plugin-admonition';

export default defineConfig({
  // …
  theme: saiun(),
  plugins: [admonition()],
});
```

## オプション

| オプション   | 既定   | 説明                                                            |
| ------------ | ------ | --------------------------------------------------------------- |
| `labelStyle` | `'jp'` | 既定タイトルの言語（`'jp'`＝注記/警告…、`'en'`＝Note/Warning…） |
| `labels`     | `{}`   | 種別ごとの既定タイトル上書き（例 `{ warning: '注意事項' }`）    |
| `showTitle`  | `true` | タイトル行を常に出すか。`false` で明示ラベルが無いとき省略する  |

## ライセンス

MIT
