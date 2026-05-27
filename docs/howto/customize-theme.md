# How-to: テーマをカスタマイズする

公式テーマは **Mono** / **Saiun** / **Kohaku** / **Hibana** / **Sumi** の 5 種。`kappan themes list` で一覧できる。

```bash
pnpm kappan themes list
```

## テーマを選ぶ

```ts
import { saiun } from '@kappan/themes-saiun';

export default defineConfig({
  // ...
  theme: saiun(),
});
```

## Saiun をカスタマイズする

`saiun()` は zod 検証付きオプションを受け取る。

```ts
theme: saiun({
  accent: '#1f3a5f',                              // アクセント色
  fontStack: {
    mincho: ['Noto Serif JP', 'Hiragino Mincho ProN'],
    sans: ['Noto Sans JP', 'Hiragino Sans'],
    mono: ['SFMono-Regular', 'Consolas'],
  },
  codeTheme: 'github-light',                       // shiki テーマ名と協調
  additionalCss: '.chapter-title { letter-spacing: 0.05em; }',
}),
```

| オプション         | 用途                               |
| ------------------ | ---------------------------------- |
| `accent`           | リンク・見出し・強調のアクセント色 |
| `fontStack.mincho` | 本文（明朝系）                     |
| `fontStack.sans`   | 見出し・ルビ                       |
| `fontStack.mono`   | コード                             |
| `codeTheme`        | shiki のシンタックステーマ名       |
| `additionalCss`    | 追記 CSS（全テーマ共通）           |

## テーマをプレビューする

ビルドせずにテーマの見た目だけ確認したいとき：

```bash
pnpm kappan themes preview saiun
# http://127.0.0.1:5180/ を開く
```

## テーマの選び方

縦書き小説向け **Sumi**、学術書・ノンフィクション向け **Kohaku**、実用書・マニュアル向け **Hibana** が用意されている。用途に合わせて `theme:` で選ぶ。

## 関連

- [設定リファレンス](../reference/config.md)
- [技術書チュートリアル](../tutorial-tech-book.md)
