# @kappan/plugin-kinsoku

JLReq 準拠の日本語禁則処理プラグイン。Reading System の `line-break: strict` が機能しない場合のフォールバックとして、行頭・行末禁則文字の境界を `<span class="kinsoku-no-break">` でラップする。

## Installation

```bash
pnpm add @kappan/plugin-kinsoku
```

## Usage

```typescript
import { defineConfig } from '@kappan/core';
import { kinsoku } from '@kappan/plugin-kinsoku';

export default defineConfig({
  // ...
  plugins: [kinsoku()],
});
```

## Options

```typescript
kinsoku({
  className: 'kinsoku', // 段落クラス名（デフォルト 'kinsoku'）
  strict: false, // 拗音・長音も禁則対象（デフォルト false）
});
```

### standard モード（デフォルト）

- 行頭禁則：句読点（、。）、閉じ括弧類（）」』】）、感嘆符疑問符
- 行末禁則：開き括弧類（（「『【）

### strict モード

standard に加えて、拗音・促音（ぁぃぅぇぉっゃゅょゎ など）、長音（ー〜）も禁則対象とする。span が増えるため、組版品質を最優先する書籍向け。

## CSS

テーマ側で次のスタイルを当てると禁則境界が確実に保持される。

```css
.kinsoku-no-break {
  white-space: nowrap;
}

p.kinsoku {
  text-align: justify;
  line-break: strict;
  overflow-wrap: break-word;
  word-break: keep-all;
}
```

`@kappan/themes-saiun` には上記スタイルが含まれている。

## Documentation

- [Kappan リポジトリ](https://github.com/isozu/kappan)
- [W3C 日本語組版処理の要件 (JLReq)](https://www.w3.org/TR/jlreq/)

## License

MIT
