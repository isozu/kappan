# How-to: ルビを振りたい

Kappan のルビは `@kappan/remark-jp` の `ruby()` プラグインで処理される。記法は 2 通り。

## パイプ記法

```markdown
{活版|かっぱん}印刷は近代日本の出版を支えた。
```

出力：

```html
<ruby>活版<rt>かっぱん</rt></ruby
>印刷は…
```

## 属性記法

連続した漢字とルビの対応を厳密に指定したいときは属性形式が確実。出力はパイプ形式と同一
（`<ruby>難読語<rt>なんどくご</rt></ruby>`）。パイプ形式と混在しても出現順に処理される。

```markdown
[難読語]{ruby="なんどくご"}
```

## プラグインを有効にする

```ts
import { ruby } from '@kappan/remark-jp';

export default defineConfig({
  // ...
  plugins: [ruby()],
});
```

`kappan init --template tech-book` / `novel` は最初から `ruby()` が入っている。

## 圏点（傍点）も振りたい

圏点は `kenten()` プラグイン + `[語]{.kenten}` 記法。

```markdown
ここが[重要]{.kenten}な点だ。
```

```ts
import { ruby, kenten } from '@kappan/remark-jp';
// plugins: [ruby(), kenten()]
```

## Re:VIEW 由来の `@<ruby>` / `@<bou>`

移行プロジェクトでは `@<ruby>{活版,かっぱん}` → `{活版|かっぱん}`、`@<bou>{重要}` → `[重要]{.kenten}` に自動変換される。

## 関連

- [記法リファレンス](../reference/notations.md)
- [小説チュートリアル](../tutorial-novel-tategumi.md)
