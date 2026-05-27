# 記法リファレンス（早見表）

Kappan が受理する記法の一覧。

凡例：✓ = 動く ／ 「未実装」と記したものは今後対応予定

## CommonMark / GFM（✓）

| 記法             | 例                       | 出力                                |
| ---------------- | ------------------------ | ----------------------------------- |
| 見出し           | `# 章`〜`###### 見出し`  | `<h1>`〜`<h6>`                      |
| 段落             | `本文`                   | `<p>`                               |
| 強調             | `**太字**` / `*斜体*`    | `<strong>` / `<em>`                 |
| 打ち消し         | `~~削除~~`               | `<del>`                             |
| インラインコード | `` `code` ``             | `<code>`                            |
| コードブロック   | ` ```ts ... ``` `        | `<pre><code>`（shiki でハイライト） |
| リスト           | `- 項目` / `1. 項目`     | `<ul>` / `<ol>`                     |
| タスクリスト     | `- [ ] 未` / `- [x] 完`  | チェックボックス付き `<li>`         |
| 引用             | `> 引用`                 | `<blockquote>`                      |
| テーブル         | `\| a \| b \|`           | `<table>`                           |
| リンク           | `[text](url)`            | `<a>`                               |
| 画像             | `![alt](path)`           | `<img>`（alt 必須）                 |
| 脚注             | `[^id]` と `[^id]: 本文` | `epub:type="footnotes"` 付き XHTML  |
| 水平線           | `---`                    | `<hr>`                              |

## 日本語拡張記法（✓）

| 記法           | 例                      | 出力                               |
| -------------- | ----------------------- | ---------------------------------- |
| ルビ（パイプ） | `{漢字\|かんじ}`        | `<ruby>漢字<rt>かんじ</rt></ruby>` |
| ルビ（属性）   | `[漢字]{ruby="かんじ"}` | 同上                               |
| 圏点           | `[重要]{.kenten}`       | 圏点付きの強調                     |
| 下線           | `[語]{.underline}`      | `text-decoration` 下線             |

## 図表番号・相互参照（fig/tbl/lst/sec/chap/eq、`@kappan/plugin-figure-numbering` 0.2.0）

`figureNumbering()` が章内連番を振り、`[@kind:id]` で参照を解決する。章をまたぐ参照（別章の図・節・章）も `onMdastAllChapters` フェーズで解決される。

| 記法       | 例                                      | 状態 |
| ---------- | --------------------------------------- | ---- |
| 図番号     | `![キャプション](img.png){#fig:id}`     | ✓    |
| 表番号     | `![キャプション](表){#tbl:id}`          | ✓    |
| リスト番号 | コードブロック直後 `{#lst:id}`          | ✓    |
| 節番号     | `## 節 {#sec:id}`                       | ✓    |
| 数式番号   | `$$ ... $$ {#eq:id}`                    | ✓    |
| 図表参照   | `[@fig:id]` / `[@tbl:id]` / `[@lst:id]` | ✓    |
| 節・章参照 | `[@sec:id]` / `[@chap:id]`              | ✓    |
| 数式参照   | `[@eq:id]`                              | ✓    |

> 引用文献参照（`[@cite:id]`）は今後対応予定。GFM ネイティブ table（`\| ... \|`）への `[@tbl:id]` 採番も今後対応予定で、現状は画像ベース table（`![](表){#tbl:id}`）のみ採番対象。

## 索引（`@kappan/plugin-jp-index` 0.2.0、MeCab 不要）

`jpIndex()` が索引マーカーを収集し、`onGenerate` で巻末に `<nav epub:type="index">` を追加する。索引順序は あ→英数→記号。詳細は [索引 How-to](../howto/build-index.md)。

| 記法               | 例                               | 説明                                   |
| ------------------ | -------------------------------- | -------------------------------------- |
| 索引語（読みなし） | `{!索引語!}`                     | 表層形がそのまま読み（並べ替えキー）に |
| 索引語（読み指定） | `{!活版印刷\|かっぱんいんさつ!}` | `\|` の後ろが読み（推奨）              |
| 属性記法           | `[語]{.index reading="よみ"}`    | 既存 Markdown を壊さずマーク           |

> 読みは手動指定が基本。`jpIndex({ autoReading: true })` を有効にし、`kuromoji.js`（optionalDependencies）を入れると未指定項目の読みを自動推定する。未導入時は表層形にフォールバックし warning を出す。

## 数式（KaTeX、`@kappan/remark-tech` の `katexMath` 0.2.0）

`katexMath()` が `$...$` / `$$...$$` を解析してレンダリングする。**デフォルト出力は MathML**（EPUB 3 ネイティブ・アクセシブル）。

| 記法                    | 例                            | 出力                              |
| ----------------------- | ----------------------------- | --------------------------------- |
| インライン数式          | `$E = mc^2$`                  | MathML（既定）                    |
| ディスプレイ数式        | `$$ ... $$`                   | MathML（既定）、`{#eq:id}` 採番可 |
| Re:VIEW `//texequation` | 移行時に KaTeX でレンダリング | MathML                            |

> **Kindle 互換に注意**：Kindle は MathML を表示できない。Kindle をターゲットにするなら `katexMath({ output: 'htmlAndMathml' })` を使う（HTML+CSS 視覚表示と隠し MathML を併記）。詳細は [KaTeX How-to](../howto/add-katex-math.md)。

## Re:VIEW 互換受理（✓、`@kappan/plugin-review-compat`）

Re:VIEW から移行したプロジェクトで、`.md` に Re:VIEW 記法が残っていてもビルド時に再解釈される互換レイヤー。詳細は [`migrating-from-review.md`](../migrating-from-review.md)。

### インライン（25+ 種、✓）

`@<code> @<tt> @<tti> @<ttb> @<b> @<strong> @<i> @<em> @<u> @<del> @<strike> @<kw> @<ruby> @<href> @<fn> @<idx> @<hidx> @<img> @<list> @<table> @<eq> @<chap> @<chapref> @<title> @<bou> @<tcy> @<m> @<ami> @<balloon>`

- `@<bou>{x}` → `[x]{.kenten}`（圏点）
- `@<tcy>{x}` → `[x]{.tcy}`（縦中横）
- `@<m>{x}` → `` `x` ``（数式、KaTeX 連携）

### ブロック（18+ 種、✓）

`//list //emlist //cmd //quote //note //tip //warning //important //image //indepimage //footnote //texequation //table //ref //info //memo //caution //comment`

### catalog.yml（✓）

`PREDEF` / `CHAPS` / `APPENDIX` / `POSTDEF` の 4 セクションに加え、**`PART:` ネスト構造**に正規対応。`PART` 配下の章は front-matter に `part: N` / `partTitle` を持つ。

## HTML 埋め込み（✓、3 段階モデル）

`kappan.config.ts` の `unsafeHtml` で制御する。

| 値              | 挙動                                       |
| --------------- | ------------------------------------------ |
| `false`（既定） | 生 HTML を一切出力しない                   |
| `'sanitized'`   | rehype-sanitize 経由で安全な HTML のみ     |
| `'trusted'`     | 入力 HTML を素通し（信頼できるソース専用） |

## 関連

- [設定リファレンス](./config.md)
- [Re:VIEW 移行ガイド](../migrating-from-review.md)
- [ルビを振りたい](../howto/add-ruby.md)
