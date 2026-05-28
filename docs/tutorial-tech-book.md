# チュートリアル：横組み技術書を作る（90 分）

このチュートリアルは、Kappan で**横組みの技術書**を一冊組み上げるまでの流れを通しで体験する。題材は同梱の架空技術書フィクスチャ `tests/fixtures/tech-book-yokogumi/`。所要時間およそ 90 分。

> **前提**：[クイックスタート](./quickstart.md) を済ませ、`pnpm install` と最小フィクスチャのビルドが通っていること。

## このチュートリアルで学ぶこと

1. `kappan init --template tech-book` でプロジェクトを起こす
2. Saiun テーマと Mono テーマの使い分け
3. Re:VIEW 風記法を Markdown 化する
4. シンタックスハイライト（shiki）
5. 図表番号と相互参照（fig / tbl / lst）
6. ルビ・圏点・脚注
7. ビルド → EPUBCheck → ACE → プレビュー

---

## ステップ 1：プロジェクトを起こす（10 分）

```bash
pnpm kappan init --template tech-book --title "実践ネットワーク設計" --author "山田太郎" my-tech-book
cd my-tech-book
```

生成された構成：

```
my-tech-book/
├── kappan.config.ts
├── src/index.md, chap01.md
└── images/
```

`kappan.config.ts` を開くと、`tech-book` テンプレートが Saiun テーマと公式プラグイン 5 種をすでに有効にしているのが分かる。

```ts
theme: saiun(),
plugins: [reviewCompat({ warnOnUnsupported: false }), ruby(), kenten(), figureNumbering(), kinsoku()],
```

まずビルドして「動く土台」を確認する。

```bash
pnpm kappan build --validate
```

---

## ステップ 2：Saiun と Mono を使い分ける（10 分）

- **Saiun（彩雲）**：明朝＋サンセリフ、青系アクセント、コードブロックは角丸グレー。技術書の本命。
- **Mono**：装飾を最小化したベースライン。差分レビューやアクセシビリティ検証で「テーマ要因」を排除したいときに使う。

テーマだけ差し替えて見た目を比較する：

```ts
import { mono } from '@kappan/themes-mono';
// theme: mono(),
```

ビルドせずにテーマの見た目を確認するなら：

```bash
pnpm kappan themes preview saiun
```

Saiun のアクセント色やフォントは [テーマ How-to](./howto/customize-theme.md) の通りカスタマイズできる。

```ts
theme: saiun({ accent: '#1f3a5f', codeTheme: 'github-light' }),
```

---

## ステップ 3：Re:VIEW 風記法を Markdown 化する（15 分）

技術書典などで Re:VIEW に慣れた著者向けに、`reviewCompat()` が Re:VIEW 記法を受理する。新規執筆では Markdown を使うのが基本だが、過去原稿を貼り付けても壊れない。

| Re:VIEW                          | Markdown（推奨）     |
| -------------------------------- | -------------------- |
| `@<b>{太字}`                     | `**太字**`           |
| `@<code>{x}`                     | `` `x` ``            |
| `@<kw>{用語}`                    | `[用語]{.kw}`        |
| `//note{ ... //}`                | `> [!NOTE]`          |
| `//list[id][cap][lang]{ ... //}` | ` ```lang ` フェンス |

過去原稿の移行は [移行ガイド](./migrating-from-review.md) と [移行 How-to](./howto/migrate-from-review.md) を参照。

---

## ステップ 4：シンタックスハイライト（10 分）

コードブロックは `@kappan/remark-tech` の shiki で自動ハイライトされる。言語を明示する。

````markdown
```typescript
export function greet(name: string): string {
  return `Hello, ${name}!`;
}
```
````

`codeTheme` でハイライトテーマを Saiun と協調させられる（ステップ 2 参照）。

---

## ステップ 5：図表番号と相互参照（15 分）

`figureNumbering()` が図・表・リストに章内連番と可視キャプションを振り、`[@fig:id]` 等で参照できる。参照は番号付きラベルのハイパーリンクになり、リーダー上でジャンプできる。

```markdown
![システム全体図](images/overview.png){#fig:overview}

詳細は [@fig:overview] を参照。

主要コンポーネント {#tbl:components}

| 名前 | 役割                         |
| ---- | ---------------------------- |
| Core | ビルドのオーケストレーション |

各コンポーネントは [@tbl:components] にまとめた。
```

- 図：画像の直後に `{#fig:id}` → 「図1.1: キャプション」
- 表：表の直前/直後にキャプション段落 `説明 {#tbl:id}` → 「表1.1: 説明」
- リスト：コードの直前/直後にキャプション段落 `説明 {#lst:id}` → 「リスト1.1: 説明」

> 節・章・数式（sec / chap / eq）の参照にも対応している。未定義の参照はビルド時に警告が出る。詳細は [記法リファレンス](./reference/notations.md) を参照。

---

## ステップ 6：ルビ・圏点・脚注（15 分）

```markdown
{活版|かっぱん}印刷は近代日本の出版を支えた。

ここが[重要]{.kenten}な点だ。

設計判断の根拠は脚注に記す[^design]。

[^design]: 設計判断の詳細はここに記す。
```

- ルビ：`{漢字|かんじ}` または `[漢字]{ruby="かんじ"}`
- 圏点：`[語]{.kenten}`
- 脚注：`[^id]` + `[^id]: 本文`（`epub:type="footnotes"` 付きで XHTML 化）

詳細は [ルビ How-to](./howto/add-ruby.md)。

---

## ステップ 7：仕上げと検証（15 分）

### ビルドして EPUBCheck

```bash
pnpm kappan build --validate
```

`✓ EPUBCheck: 0 errors` を確認。

### アクセシビリティ（ACE）

```bash
pnpm kappan build --ace
```

critical / serious が出たら修正。CI では `--ace-strict` で失格にできる。

### 執筆中はプレビュー

```bash
pnpm kappan preview
```

`.md` を保存するたびにブラウザへ即反映（HMR 中央値 7ms）。軽量チェックだけなら `kappan check`。

---

## まとめ

- `kappan init --template tech-book` で土台を作り
- Saiun テーマ + 5 公式プラグインで本文・コード・図表・ルビを組み
- EPUBCheck / ACE / preview で仕上げる

題材の `tests/fixtures/tech-book-yokogumi/` は実書籍レベルの記法を一通り含むので、自分の本の参考実装として読むとよい。

## 次に読む

- [小説チュートリアル](./tutorial-novel-tategumi.md)
- [設定リファレンス](./reference/config.md)
- [記法リファレンス](./reference/notations.md)
- [Kindle 入稿 How-to](./howto/publish-to-kindle.md)
