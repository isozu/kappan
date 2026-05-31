# @kappan/plugin-toc

## 0.2.0

### Minor Changes

- 1614576: ブロックレベルの意味づけ記法を `remark-directive`（`:::`）で導入した。
  - **`@kappan/plugin-admonition`（新規）**：`:::note` / `:::tip` / `:::warning` /
    `:::caution` / `:::important` / `:::info` / `:::memo` を `<aside class="admonition <種別>">`
    に変換する。`:::warning[タイトル]` で見出しも付けられる。
  - **`@kappan/plugin-column`（新規）**：`:::column[タイトル]{#col:id}` を
    `<aside epub:type="sidebar" class="admonition column">` に変換し、目次（`plugin-toc`）への
    掲載と `[@col:id]`（章跨ぎは `[@col:章ID/id]`）相互参照を解決する。Re:VIEW の
    `//column` ＋ `@<column>{}` 相当。
  - **`@kappan/core`**：パーサに `remark-directive` を組み込み、行中 `:name`（text/leaf
    ディレクティブ）は素のテキストに戻して `[@fig:id]` などの参照記法との衝突を防ぐ。
    `ChapterRecord.columns` と `ColumnRecord` 型を追加、`epub:type="sidebar"` を a11y 検証の
    許可値に追加。
  - **`@kappan/plugin-toc`**：章のコラムを目次に「コラム」行として描画する。
  - **`@kappan/plugin-review-compat`**：`//note` 〜 `//memo` を `:::note` 等へ、
    `//column[caption]` を `:::column[caption]{#col:…}` へ変換するよう更新（旧 `> [!NOTE]`
    GFM アラート出力を置き換え）。
  - **`@kappan/cli`**：`--version` の表示をハードコード `0.1.0` から package.json 由来に修正。

### Patch Changes

- Updated dependencies [1614576]
  - @kappan/core@0.5.0
