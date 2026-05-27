# 設定リファレンス（`kappan.config.ts`）

`kappan.config.ts` は `defineConfig({ ... })` をデフォルトエクスポートする TypeScript ファイル。本書は全フィールドを表形式でまとめる。出典は `@kappan/core` の zod スキーマ（`packages/core/src/config/schema.ts`）。スキーマが更新されたら本書も追従する。

## トップレベル

| フィールド    | 型                                  | 必須 | 既定値                                       | 説明                                     |
| ------------- | ----------------------------------- | ---- | -------------------------------------------- | ---------------------------------------- |
| `metadata`    | `Metadata`                          | ✓    | —                                            | 書誌情報（下表）                         |
| `source`      | `Source`                            | ✓    | —                                            | 入力ソース（下表）                       |
| `output`      | `Output`                            | —    | `{ dir: 'dist/', filename: '{title}.epub' }` | 出力先（下表）                           |
| `theme`       | `ThemeLike`                         | ✓    | —                                            | テーマ（`mono()` / `saiun()` 等）        |
| `plugins`     | `Plugin[]`                          | —    | `[]`                                         | プラグイン配列                           |
| `unsafeHtml`  | `false \| 'sanitized' \| 'trusted'` | —    | `false`                                      | HTML 埋め込み許可制                      |
| `writingMode` | `'horizontal-tb' \| 'vertical-rl'`  | —    | `'horizontal-tb'`                            | 組み方向（`vertical-rl` で縦組み）       |
| `rendition`   | `Rendition`                         | —    | —                                            | 固定レイアウト設定（今後実装、optional） |

## `metadata`

| フィールド      | 型              | 必須 | 既定値 | 説明                                                     |
| --------------- | --------------- | ---- | ------ | -------------------------------------------------------- |
| `title`         | `string`        | ✓    | —      | 書名（1 文字以上）                                       |
| `subtitle`      | `string`        | —    | —      | サブタイトル                                             |
| `creator`       | `Creator[]`     | ✓    | —      | 著者・編者ら（1 件以上、下表）                           |
| `language`      | `string`        | —    | `'ja'` | 言語コード                                               |
| `publisher`     | `string`        | —    | —      | 発行者                                                   |
| `identifier`    | `string`        | —    | —      | `urn:uuid:*` または `urn:isbn:*` 形式                    |
| `date`          | `string`        | —    | —      | 発行日                                                   |
| `coverImage`    | `string`        | —    | —      | 表紙画像（config からの相対パス、例 `images/cover.jpg`） |
| `accessibility` | `Accessibility` | —    | —      | アクセシビリティ宣言（下表）                             |

### `Creator`

| フィールド | 型       | 必須 | 既定値  | 説明                                |
| ---------- | -------- | ---- | ------- | ----------------------------------- |
| `name`     | `string` | ✓    | —       | 表示名（1 文字以上）                |
| `role`     | `string` | —    | `'aut'` | MARC ロール（`aut`/`edt`/`trl` 等） |
| `fileAs`   | `string` | —    | —       | ソート用の読み                      |

### `Accessibility`

| フィールド | 型         | 必須 | 既定値     | 説明                                       |
| ---------- | ---------- | ---- | ---------- | ------------------------------------------ |
| `features` | `string[]` | —    | —          | アクセシビリティ機能（未指定なら自動推論） |
| `hazards`  | `string[]` | —    | `['none']` | ハザード宣言                               |
| `summary`  | `string`   | —    | —          | アクセシビリティ要約                       |

## `source`

| フィールド | 型       | 必須 | 既定値   | 説明                                |
| ---------- | -------- | ---- | -------- | ----------------------------------- |
| `entry`    | `string` | ✓    | —        | 先頭章ファイル（例 `src/index.md`） |
| `baseDir`  | `string` | —    | `'src/'` | 章ファイルのベースディレクトリ      |

章は先頭章の front-matter `next` を辿って順序付けされる。

## `output`

| フィールド | 型       | 必須 | 既定値           | 説明                                     |
| ---------- | -------- | ---- | ---------------- | ---------------------------------------- |
| `dir`      | `string` | —    | `'dist/'`        | 出力ディレクトリ                         |
| `filename` | `string` | —    | `'{title}.epub'` | 出力ファイル名（`{title}` は書名に置換） |

## `rendition`（今後実装、現状は optional）

| フィールド    | 型                                    | 既定値         | 説明           |
| ------------- | ------------------------------------- | -------------- | -------------- |
| `layout`      | `'reflowable' \| 'pre-paginated'`     | `'reflowable'` | レイアウト種別 |
| `orientation` | `'auto' \| 'portrait' \| 'landscape'` | —              | 向き           |
| `spread`      | `'auto' \| 'none' \| 'both'`          | —              | 見開き         |

## 章ファイルの front-matter

章 Markdown 先頭の YAML front-matter で章メタを指定する。

| キー            | 型       | 説明                                               |
| --------------- | -------- | -------------------------------------------------- |
| `title`         | `string` | 章タイトル（省略時は本文先頭見出し）               |
| `id`            | `string` | spine/manifest 用 id（省略時はファイル名から推定） |
| `next`          | `string` | 次章ファイル名（章順序の連結）                     |
| `chapterNumber` | `number` | 章番号（Re:VIEW 移行時に自動採番）                 |
| `part`          | `number` | 所属する部の番号（Re:VIEW `PART:` 由来）           |
| `partTitle`     | `string` | 所属する部の名前（同上）                           |

> `chapterNumber` / `part` / `partTitle` は主に `kappan migrate` が発行する。手書き時は `title` / `id` / `next` の 3 つで十分。

## テーマ別オプション

### `saiun(options)`

| オプション      | 型                          | 説明                                   |
| --------------- | --------------------------- | -------------------------------------- |
| `accent`        | CSS color                   | アクセント色（`--saiun-accent`）       |
| `fontStack`     | `{ mincho?, sans?, mono? }` | フォントスタックの差し替え             |
| `codeTheme`     | `string`                    | shiki テーマ名（`--saiun-code-theme`） |
| `additionalCss` | `string`                    | 追記 CSS（全テーマ共通）               |

### `mono()`

オプションなし（最小ベースライン）。

## 関連

- [記法リファレンス](./notations.md)
- [テーマをカスタマイズする](../howto/customize-theme.md)
