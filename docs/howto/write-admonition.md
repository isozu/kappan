# How-to: 囲み記事（注記・警告）を入れたい

注記・ヒント・警告などの囲み記事は `@kappan/plugin-admonition` で書く。
記法は [remark-directive](https://github.com/remarkjs/remark-directive) の `:::`。

## 基本

```markdown
:::note
補足の注記。
:::

:::warning[互換性の注意]
古いリーダーでは MathML が表示できない。
:::
```

出力：

```html
<aside class="admonition warning">
  <p class="admonition-title">互換性の注意</p>
  <p>古いリーダーでは MathML が表示できない。</p>
</aside>
```

`:::種別[タイトル]` の `[タイトル]` は省略可。省略すると種別ごとの既定タイトル
（注記／ヒント／警告／注意／重要／情報／メモ）が入る。

## 使える種別

`note` / `tip` / `warning` / `caution` / `important` / `info` / `memo`
（Re:VIEW の `//note //tip //warning //caution //important //info //memo` に対応）。
`warning` と `tip` は saiun / hibana テーマで色が変わる。

## プラグインを有効にする

```ts
import { admonition } from '@kappan/plugin-admonition';

export default defineConfig({
  // ...
  plugins: [admonition()],
});
```

## オプション

```ts
admonition({
  labelStyle: 'en', // 既定タイトルを英語（Note / Warning …）に
  labels: { warning: '注意事項' }, // 種別ごとに上書き
  showTitle: false, // 明示ラベルが無いときタイトルを省略
});
```

中にコードブロック・図・リストなど任意のブロックを入れられる。コラム（読み物）が
欲しいときは [コラム How-to](./write-column.md) を参照。
