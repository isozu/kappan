# Re:VIEW プロジェクトを Kappan に移行する

本書は、既存の Re:VIEW で書かれた技術書プロジェクトを Kappan に移行する実用ガイドである。技術書典で頒布された原稿、社内 Wiki から引き上げた原稿、自分のリポジトリで温めていた原稿を、最小手数で Kappan の Markdown ベースのフローに乗せ換えることを目的とする。

## 対応範囲（要約）

`pnpm kappan migrate` が安定して扱える範囲は次の通り。

- **インライン記法**：`@<code> @<tt> @<tti> @<ttb> @<b> @<strong> @<i> @<em> @<u> @<del> @<strike> @<kw> @<ruby> @<href> @<fn> @<idx> @<hidx> @<img> @<list> @<table> @<eq> @<chap> @<chapref> @<title> @<bou> @<tcy> @<m> @<ami> @<balloon>` の 25+ 種を受理
- **ブロック記法**：`//list //emlist //cmd //quote //note //tip //warning //important //image //indepimage //footnote //texequation //table //ref //info //memo //caution //comment` の 18+ 種を受理
- **catalog.yml**：`PREDEF` / `CHAPS` / `APPENDIX` / `POSTDEF` の 4 セクションを処理し、章順序を保存。`PART:` ネスト構造も part/partTitle メタとして保持する
- **config.yml 主要フィールド**：`booktitle` / `bookname` / `aut` / `edt` / `trl` / `language` / `publisher` / `isbn` / `date` / `coverimage`
- **`stylesheet` の転記**：`theme({ additionalCss })` へ転記
- **数式・索引・縦中横**：`//texequation` は KaTeX 連携、`@<idx>` は索引生成、`@<tcy>` は縦中横として処理
- **段階化された警告**：受理できないフィールドや記法は `migration-report.md` の警告セクションに整理されて出力される

今後の予定：完全変換と `review-ext.rb` 部分対応、LSP 統合。

## 0. 移行前のチェックリスト

移行を始める前に、次の状態を確認しておく。

- [ ] 元の Re:VIEW プロジェクトがビルドできる（少なくとも `review-pdfmaker` か `review-epubmaker` が動く）状態
- [ ] Kappan のリポジトリをクローンし、`pnpm install` まで完了している（[`docs/quickstart.md`](./quickstart.md) 参照）
- [ ] `pnpm test` が緑色で通る
- [ ] 元プロジェクトを **必ず Git でコミット済み** にしておく（万が一に備える）

## 1. 一行で移行する

最小ケースはこれだけ。

```bash
pnpm kappan migrate /path/to/my-review-book
```

成功すると、隣に `/path/to/my-review-book-kappan/` というディレクトリができている。中身は次のような構成。

```
my-review-book-kappan/
├── kappan.config.ts            # config.yml から自動生成された設定
├── migration-report.md         # 何が変換され、何が変換できなかったかの記録
├── src/
│   ├── preface.md              # 元 preface.re
│   ├── chap01.md               # 元 chap01.re（front-matter で next:chap02.md）
│   ├── chap02.md
│   └── colophon.md             # 元 colophon.re
└── images/                     # 元 images/ をそのままコピー
    └── *.png
```

## 2. 動くかどうか確かめる

移行直後に、まず変換結果が EPUB として組めるかを確認する。

```bash
pnpm kappan build --config /path/to/my-review-book-kappan/kappan.config.ts --validate
```

期待する出力：

```
✓ Built /path/to/my-review-book-kappan/dist/my-review-book.epub
✓ EPUBCheck: 0 errors, 0 warnings
```

ここで `0 errors` が出れば、変換は構造的には完璧。あとはコンテンツの細部を整えるだけになる。

## 3. オプションの使い分け

### 出力ディレクトリを指定する

```bash
pnpm kappan migrate ./my-review-book --out ./my-book-md
```

### 書き出さずに結果だけ見る（dry-run）

「変換に成功するか」「未対応記法が何件出るか」だけを先に知りたいとき。

```bash
pnpm kappan migrate ./my-review-book --dry-run
```

ファイルは一切作られず、サマリだけが標準出力に流れる。

### 既存ディレクトリに上書きする

二回目以降の試行で、出力先がすでに存在するとデフォルトでエラーになる。意図的に上書きするには `--force`。

```bash
pnpm kappan migrate ./my-review-book --out ./my-book-md --force
```

### レポートだけ生成する

`migration-report.md` 相当の情報を標準出力に出すだけで、変換結果は書き出さない。

```bash
pnpm kappan migrate ./my-review-book --report-only
```

## 4. `migration-report.md` を読む

変換完了時に必ず生成される。次のような構造になっている。

```markdown
# Kappan Migration Report

- Source: /path/to/my-review-book
- Target: /path/to/my-review-book-kappan
- Generated: 2026-05-26T07:00:00Z

## Summary

- **Unsupported notations: 3 件**（手作業での書き換えが必要です）
- Files converted: 12
- Re:VIEW notations matched: 145
- Config fields ignored: 2
- Images copied: 8

## ✅ 対応した内容

- Re:VIEW notations matched: 145 件（インライン 25+ 種、ブロック 18+ 種）
- Catalog sections handled: PREDEF, CHAPS, APPENDIX, POSTDEF
- config.yml 主要フィールド：booktitle, bookname, aut/edt/trl, language, publisher, isbn, date, coverimage
- Images copied: 8
- 生成 `kappan.config.ts` に `[reviewCompat(), figureNumbering(), kinsoku()]` を含めて出力

## 🔜 今後対応予定

- Full Re:VIEW notation coverage を含む完全変換
- `review-ext.rb` プラグインの部分対応
- LSP / VSCode 拡張統合
- 各ストア向け入稿リント

## Unsupported Notations

### src/chap01.md

- Line 42: `<!-- REVIEW-UNSUPPORTED: @<bogus>{...} -->`

## Ignored Config Fields

- `stylesheet`: theme({ additionalCss: '...' }) 経由でテーマ拡張 CSS として転記。
- `toc_depth`: Use Kappan automatic TOC generation. Configurable via output.tocDepth.

## Next Steps

1. Review the unsupported notations above and replace them with Markdown equivalents.
2. Open `kappan.config.ts` and verify the generated metadata.
3. Run `pnpm kappan build --validate` to verify the EPUB output.
```

最も重要なのは **`Unsupported Notations`** セクション。ここに列挙されている箇所は、変換ツールが対応できなかった Re:VIEW 記法で、`<!-- REVIEW-UNSUPPORTED: ... -->` という HTML コメントとして `.md` ファイル内に残っている。Summary 冒頭の「**Unsupported notations: N 件**」は移行直後にまず確認すべき指標で、0 件であれば手作業はほぼ不要、`migration-report.md` の Next Steps に沿ってビルドに進める。

## 5. 未対応記法を手で直す

`migration-report.md` の `Unsupported Notations` 一覧をたどって、該当箇所の `.md` ファイルを編集する。

```bash
# 未対応箇所を grep で確認
grep -rn 'REVIEW-UNSUPPORTED' my-review-book-kappan/src/
```

典型的な対応方針：

| 元 Re:VIEW 記法                   | Markdown / Kappan 拡張記法での書き換え                               |
| --------------------------------- | -------------------------------------------------------------------- |
| `@<bogus>{x}`（未知のインライン） | テキストとして残す or 適切な記法に置換                               |
| `//unknown_block{...//}`          | フェンスコードブロックや admonition への置換                         |
| Re:VIEW 拡張記法                  | プラグイン化を検討（[`plugin-authoring.md`](./plugin-authoring.md)） |

すべて修正したら再度ビルドして EPUBCheck を通す。

```bash
pnpm kappan build --config my-review-book-kappan/kappan.config.ts --validate
```

## 6. config.yml の手動補完

自動生成された `kappan.config.ts` は、`config.yml` で表現できる情報を引き継ぎ、デフォルトで `[reviewCompat(), figureNumbering(), kinsoku()]` の 3 プラグインを有効にしている。Kappan の他の公式プラグインやテーマは、必要に応じて手で足す。

```typescript
import { defineConfig } from '@kappan/core';
import { saiun } from '@kappan/themes-saiun'; // テーマを Mono から Saiun に変更
import { reviewCompat } from '@kappan/plugin-review-compat';
import { ruby, kenten } from '@kappan/remark-jp'; // ルビ・圏点
import { shikiHighlight } from '@kappan/remark-tech'; // コードハイライト
import { figureNumbering } from '@kappan/plugin-figure-numbering';
import { kinsoku } from '@kappan/plugin-kinsoku'; // 禁則処理

export default defineConfig({
  plugins: [
    reviewCompat(),
    ruby(),
    kenten(),
    figureNumbering(),
    shikiHighlight({ theme: 'github-light' }),
    kinsoku(),
  ],
  // ... 自動生成された metadata, source, output
  theme: saiun(), // mono() から差し替え
});
```

`reviewCompat()` を残しておくと、未対応記法 `<!-- REVIEW-UNSUPPORTED: ... -->` の元になった本来の記法が、`.md` 中に Re:VIEW 形式のまま書かれていても、ビルド時に再解釈される（互換受理レイヤー）。徐々に Markdown 化していく場合に便利。

## 7. プレビューで確認する

変換結果を実際に画面で見ながら整えたい場合、`kappan preview` でライブプレビューを立ち上げる。

```bash
pnpm kappan preview --config my-review-book-kappan/kappan.config.ts
```

ブラウザで `http://127.0.0.1:5173` を開くと、左に章リスト、右に章 XHTML が表示される。`.md` を編集すれば自動で再ビルドされ、ブラウザに反映される。

## 8. 想定される個別ケース

### ケース A：Re:VIEW で `//list` の `id` を多用していた

`//list[id][caption][lang]{...//}` は自動的に `<a id="list-<id>"></a>` 付きのフェンスコードブロックに変換される。本文中の `@<list>{id}` 参照は `[リスト id]` のテキスト置換になる。図表番号と相互参照を本格的に効かせたい場合は、変換後に `@kappan/plugin-figure-numbering` の `[@lst:id]` 形式に手動で書き換える。

### ケース B：`config.yml` に `stylesheet: custom.css` がある

`stylesheet` は `theme({ additionalCss })` へ転記される。より作り込みたい場合は次のいずれか。

1. Saiun / Mono など既存テーマで満足できないか試す
2. 独自テーマパッケージを作る（[`plugin-authoring.md`](./plugin-authoring.md) のテーマ作成節を参照）

### ケース C：画像ファイル名が `images/foo.eps` などのベクター形式

EPUB は EPS を直接表示できない。手動で PNG/WebP/SVG に変換し、ファイル名を整合させる必要がある。`migration-report.md` の Images セクションに警告が出る場合がある。

### ケース D：複数 part に分かれた巨大プロジェクト（`PART:` セクション）

`PREDEF`、`CHAPS`、`APPENDIX`、`POSTDEF` の 4 セクションに加え、`PART:` ネスト構造も正規対応する。`PART:` 配下の章は front-matter に `part: N` / `partTitle` を持ち、部 → 章のネスト構造が保たれる（フラット化はしない）。部扉の体裁はテーマ側で調整できる。

## 9. 移行後に推奨される作業

1. **Git リポジトリの再初期化**（任意）：移行後のディレクトリで `git init` して、Markdown 中心のフローに移る
2. **テーマの選定**：Saiun（技術書向け）または Sumi（縦書き小説向け）など
3. **プラグイン構成の最適化**：`docs/plugin-authoring.md` を参考に、必要なものだけ有効化
4. **CI/CD への組み込み**：GitHub Actions で `pnpm kappan build --validate` を回す

## 10. 困ったときに

- 変換結果が予想と違う → `migration-report.md` をまず確認
- ビルドが通らない → `pnpm kappan build --validate` のエラー出力を読む
- 記法が変換されない → [`@kappan/plugin-review-compat` の README](../packages/plugin-review-compat/README.md) で対応記法を確認
- それ以外 → GitHub Issues か Discussions に投稿

## 11. 参照

- [パッケージリファレンス](../packages/migrate-review/README.md)
- [`@kappan/plugin-review-compat`](../packages/plugin-review-compat/README.md)
- [クイックスタート](./quickstart.md)
