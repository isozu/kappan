# Kappan モノレポ全体 CHANGELOG

このファイルはルート集約版で、各 `@kappan/*` パッケージ個別の CHANGELOG は
`packages/*/CHANGELOG.md` に changesets が自動生成する。

形式：[Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) 準拠 + SemVer。

## [0.3.0] — 縦組み（vertical-rl）

全 20 パッケージを `0.3.0` で lockstep リリース。日本語縦書き小説の商業品質組版（Re:VIEW が「実験的」止まりだった領域）を実装。

### Added

- **縦組みコア**（`@kappan/core` + `@kappan/epub-packager`）：`writingMode: 'vertical-rl'` で `<body class="kappan-vertical-rl">` + OPF `<spine page-progression-direction="rtl">` を出力。横組み（既定）は一切変えず後方互換を維持。
- **約物処理**（`@kappan/remark-jp`）：`punctuation` プラグイン（連続ダーシ `――`（U+2015 ×2+）/ 連続三点リーダ `……`（U+2026 ×2+）を `<span class="renzoku-dash/leader">` でラップし非改行化、生成済み span の無限ネストを skip ガード）、`dialogue` プラグイン（`<p>` 先頭が開きカギ括弧なら `dialogue`、地の文は `narrative` を付与）。
- **Sumi テーマ縦書き本実装**（`@kappan/themes-sumi`）：`writing-mode: vertical-rl`（prefix 併記）、コードブロックの横組み内包（`pre { writing-mode: horizontal-tb }`）、章扉（`break-before: page`）、天付き 1 字下げ（地の文のみ、会話文抑制）、約物連続の `white-space: nowrap`。
- **リーダー差異吸収**（`@kappan/plugin-reader-shim` + Sumi/Saiun CSS）：`body.reader-<profile>.kappan-vertical-rl { ... }` で Kindle/Apple/Kobo/Thorium の縦組み CSS 解釈差を prefix 併記で吸収（`@supports` 不使用）。
- **Saiun テーマ縦組み対応**：技術書を縦組みにする選択肢として writing-mode 本体宣言を追加。
- **novel-tategumi fixture**：縦組み小説の組版難所（会話文/地の文、ルビ、圏点、2 桁 tcy/4 桁年号、連続約物、欧文混在）を網羅。EPUBCheck 0 errors。
- **リーダー互換性マトリクス**（`tests/reader-compatibility/matrix.json` + README）：縦組み行（縦書き/ルビ/圏点/縦中横/pre 横組み/連続約物/字下げ/章頭改ページ）を追加。柱・ノンブルはリフロー保証外として今後の固定レイアウト対応に残置。
- **Playwright/puppeteer 検証**（`tests/reader-compatibility/scripts/thorium-headless.ts`）：Chromium で縦組みレイアウト（縦右→左流れ、pre 横組み、ルビ右側）を座標 assert + screenshot。

### Fixed

- **reader-shim の body class が一度も発火していなかった潜在バグ**（横組み時代から）を修正。`onHast` が wrap 前に呼ばれて `<body>` が存在しなかったため、`visit(body)` がヒットしていなかった。`markdownToXhtml` の wrap を `onHast` の前に移動し、プラグインが body/head を含む完全な hast を受け取れるようにした（横組み XHTML 出力は不変、後方互換確認済み）。
- **ルビ・圏点の縦位置 CSS の実バグ**（Playwright 実検証で発見）：`ruby-position: right` は Chromium で脱落 → `ruby-position: over`（vertical-rl で右側）、`-webkit-ruby-position: after` は prefix 先・標準後の並びでないと逆側に出る、`text-emphasis-position: right` → `over right`（2 値形式）に修正。JSDOM/golden では検出不可能なレイアウト座標バグ。
- **`<html dir="rtl">` による縦組み天地バグ**（Playwright 実検証で発見）：`dir="rtl"` は Unicode Bidi Algorithm のインライン方向制御（アラビア語/ヘブライ語用）であり、日本語縦組みとは無関係。設定すると block-start が右端になり短い段落の文字が地（ページ下端）に寄る致命的バグが発生していた。`markdownToXhtml.ts` から `dir="rtl"` を削除し、テーマ CSS に `direction: ltr` を防衛的宣言として追加。ページ送り方向は OPF `page-progression-direction="rtl"` のみで正しく制御される。
- **techbook（横組み）の文字間隔過剰**：`text-align: justify` 単独では CJK 文字すべての間隔が広がる inter-character 配分になる。`text-justify: inter-word` を Saiun / Mono テーマの `p` ルールに追加し、単語境界のみに余白を配分するよう修正。

### Notes

- **検証境界**：Chromium レイアウト（Playwright/puppeteer、Thorium 近似）+ EPUBCheck + ACE + golden + JSDOM で構造的・仕様的正しさを自動保証。**Apple Books / Kindle 実機の最終目視はユーザー領域**（実機チェックリストは `docs/howto/check-vertical-on-readers.md`）。
- 柱・ノンブルはリフロー EPUB ではリーダー任せのため本リリースのスコープ外（CSS はベストエフォート、品質保証は今後の固定レイアウト対応で行う）。

### 検証

- pnpm test: 327 個緑（前リリース 292 → +35）
- pnpm typecheck: 全 20 パッケージ緑、pnpm format:check 緑
- EPUBCheck: novel-tategumi 含む全 fixture 0 errors / 0 warnings
- 横組み既存 golden（minimal-commonmark / footnotes-and-html / tech-book-yokogumi）は theme.css の縦組みルール追記分のみ再生成、XHTML/OPF 不変

## [0.2.0] — 相互参照・索引・KaTeX・ACE 準拠

全 20 パッケージを `0.2.0` で lockstep リリース。章をまたぐ相互参照・索引・KaTeX・テーマ拡張、ACE 完全準拠とリーダー互換性 CI、CLI 拡張・PART 対応・ドキュメント三層を統合。縦組みは次リリースで実装。

### Added

- **章をまたぐ相互参照**（`@kappan/plugin-figure-numbering@0.2.0`）：fig/tbl/lst に加え sec/eq/chap に拡張。`onMdastAllChapters` 新フックで forward 参照（1 章→3 章）も解決。`[@chap:ch01]`→「第1章」、`[@sec:ch01/overview]`→「節1.1」（章 ID 名前空間）。
- **索引生成**（`@kappan/plugin-jp-index@0.2.0`、新規）：`{!語!}` / `{!語|よみ!}` / `[語]{.index reading=""}`。MeCab 不使用（kuromoji.js は任意）。`onGenerate` フックで巻末 `<nav epub:type="index">` を spine 追加、「あ→英数→記号」順。
- **KaTeX 数式**（`@kappan/remark-tech`）：`$...$` / `$$...$$`。デフォルト MathML 出力（EPUB 3 ネイティブ・アクセシブル）、`output: 'htmlAndMathml'` で Kindle 互換。
- **公式プラグイン ★★ 5 種**（すべて新規 0.2.0）：`plugin-wahukon`（和欧混植）、`plugin-tcy-smart`（縦中横文脈判定）、`plugin-yojijukugo`（四字熟語統一）、`plugin-ruby-auto`（難読漢字ルビ）、`plugin-reader-shim`（リーダー差異吸収）。
- **テーマ拡張**：`themes-kohaku`（学術書、新規）、`themes-hibana`（マニュアル、新規）、`themes-sumi`（縦書き skeleton、新規）。全テーマに `additionalCss?: string` を統一。
- **CLI コマンド拡張**（`@kappan/cli`）：`init`（`--template tech-book/novel/manual`）、`themes`（list / preview）、`check`（ビルドせず検証、`runChecks` 純関数）、`plugin`（init / test / link / publish）。
- **ACE 完全準拠**（`@kappan/core`）：`normalizeAceReport` / `isAceStrictPass`、impact 別カウンタ、`--ace --strict`（critical/serious で exit 2）。`accessibility.ts` にコントラスト比（WCAG 2.1 AA 4.5:1）、ARIA landmark 推定、epub:type ロケーション妥当性チェックを追加。
- **リーダー互換性マトリクス CI**（`.github/workflows/reader-matrix.yml`）：四半期 cron、`tests/reader-compatibility/matrix.json` を source-of-truth に README を自動再生成。実機ステップ（Kindle Previewer / Thorium / Apple Books）は今後有効化する skeleton。
- **CI に ACE ジョブ**：push / weekly schedule で `--ace --strict`、Chromium インストール込み、ログ artifact。
- **Re:VIEW PART ネスト正規変換**（`@kappan/migrate-review`）：flatten+warn を撤廃し part/partTitle/parts メタを発行。`stylesheet:` を `theme({ additionalCss })` へ転記。
- **新フック**（`@kappan/core`）：`onMdastAllChapters` / `onGenerate`、`runOnMdastAllChapters` / `runOnGenerate`、`parseMarkdownToMdast` / `renderMdastToXhtml` を export。`detectContentProperties` で OPF manifest properties（MathML/SVG/scripted）を自動付与（OPF-014 回避）。
- **ドキュメント三層**：tutorial 2 本、howto 9 本、reference 2 本（config / notations）。

### Notes

- **KaTeX は SVG 出力を持たない**。MathML をデフォルトとし、Kindle 互換は `htmlAndMathml` で対応。
- 縦組みは本リリースのスコープ外。`themes-sumi` は横組み skeleton のみ。`writingMode: 'vertical-rl'` は warning を出して horizontal-tb にフォールバック。
- GFM ネイティブ table への `[@tbl:id]` 採番は今後の対応（本リリースは画像ベース table のみ）。

### 検証

- pnpm test: 292 個緑（前リリース 213 → +79）
- pnpm typecheck: 全 20 パッケージ緑
- EPUBCheck: minimal-commonmark / footnotes-and-html / tech-book-yokogumi / migrated 4 種（minimal/typical/real-world/part-nested）すべて 0 errors / 0 warnings
- ACE `--strict`: 3 種 fixture すべて PASS（実 ACE 1.4.6 + Chromium）

## [0.1.0] — 日本語拡張記法・プラグイン API 公開

### Added

- **プラグイン API ランタイム凍結**：`definePlugin` の zod schema 検証が実行されるようになった。失敗時は `BuildError`（diagnostics 付き）として投げられ、設定読み込み段階で停止する
- **`onPackage` / `onValidate` フック**のパイプライン接続：パッケージング層（OPF/NAV 構築後、ZIP 化前）で `PluginEpubPackage` を観察するフックが利用可能に。`onValidate` には実 `EpubPackage` の view が渡される
- **`defineTheme` API**：`@kappan/core` から export。`themes-mono` / `themes-saiun` がこの API 経由で実装される
- **設定スキーマ拡張**：`unsafeHtml: false | 'sanitized' | 'trusted'`、`writingMode: 'horizontal-tb' | 'vertical-rl'`、`rendition?` を追加。本リリースでは `unsafeHtml: false`（デフォルト）と `writingMode: 'horizontal-tb'` のみ実装、それ以外は将来の拡張点として optional
- **ベンチ比較スクリプト** `tools/bench/compare.ts`：Welch's t-test、IQR 1.5× 外れ値除外、累積 15% 劣化判定
- **公式 Docker イメージ** `ghcr.io/kappan/build:0.1`（`tools/docker/Dockerfile`）。Node 20 + Java 17 + EPUBCheck + 公式テーマ/プラグイン同梱
- **CI 拡張**：`migrate-roundtrip`、`bench`（PR トリガ）、`publish-dryrun`（main トリガ）ジョブを追加
- **公開パッケージ 10 個を 0.1.0 化**：`@kappan/core`、`@kappan/epub-packager`、`@kappan/cli`、`@kappan/themes-mono`、`@kappan/themes-saiun`、`@kappan/remark-jp`、`@kappan/remark-tech`、`@kappan/plugin-review-compat`、`@kappan/plugin-figure-numbering`、`@kappan/plugin-kinsoku`

### Changed

- 各プラグインの内部 `version` 文字列を `'0.0.0' → '0.1.0'` に同期
- `ace.ts` の `KAPPAN_ACE_EXPERIMENTAL=1` 環境変数ガードを撤廃
- `themes-saiun/assets/theme.css` を技術書水準に仕上げ

### Notes

- `writingMode: 'vertical-rl'` を指定すると warning が出る（縦組み実装は次リリース）
- ACE（`@daisy/ace-core`）は `optionalDependencies`。`pnpm add @daisy/ace-core @daisy/axe-runner` で追加してから `--ace` フラグで実行できる

## [0.0.x] — 初期 PoC

- CommonMark + GFM → EPUB 3.3 の最小パイプライン
- 画像 alt 必須、schema.org accessibility メタデータ自動付与
- EPUBCheck 5.x 統合
- ゴールデンファイルテスト基盤
- `@kappan/themes-mono` 唯一のテーマ
- すべてのパッケージは `"private": true`、npm 未公開
