# @kappan/core

## 0.5.0

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

## 0.4.0

### Minor Changes

- ffb8e14: 脚注の見出しと図表番号の表示を修正し、見出しの自動採番プラグインを追加。
  - **脚注ラベルの日本語化・可視化（core）**: GFM 脚注セクションの見出しが英語の「Footnotes」かつ
    `sr-only` のままだった問題を修正。`language: 'ja'` のとき「脚注」を可視の章末見出しとして出し、
    戻りリンクの aria-label も日本語化する（非 ja は従来どおり英語）。テーマは `#footnote-label` で装飾。
  - **図表番号の可視化（plugin-figure-numbering）**: 番号が `<img alt>` にしか入らず読者に見えなかった
    問題を修正。単独段落のブロック画像を `<figure><figcaption>図1.1: …</figcaption></figure>` に変換し、
    番号付きキャプションを可視で出す（alt は素の説明に戻す）。GFM テーブルも直前/直後の
    `{#tbl:id} キャプション` 段落で `<figure>` 採番できるようにした。mdast 段階で生成するため
    unsafeHtml の全モードで安定動作する。
  - **相互参照のリンク化＋リスト採番＋未解決警告（plugin-figure-numbering 0.4.0）**: `[@kind:id]` 参照を
    プレーンテキストではなく、図表・節・章のアンカーへの**ハイパーリンク**（`<a class="kappan-xref">`）に
    解決するようにした。図・表・リスト・節・数式の各定義に安定したアンカー（`fig-id` / `tbl-id` /
    `lst-id` / `sec-id` / `eq-id`）を付け、同章は `#anchor`、章をまたぐ参照は `chXX.xhtml#anchor` を指す。
    コードブロックも表と同様に隣接キャプション段落 `説明 {#lst:id}` で `<figure class="code-figure">` に
    ラップし、`リストN.N: 説明` の可視キャプションを出すようにした（旧記法＝直後段落先頭の `{#lst:id}` も
    番号だけは後方互換で維持）。定義が見つからない参照はビルド時に warning を発行する。
  - **見出しの自動採番（新規 plugin-heading-number）**: 章（h1）に「第N章」、節（h2 以下）に「N.M」
    「N.M.K」を付ける。章番号は spine 順で採番し、既存の「第N章」を尊重する。`{-}` / `{.unnumbered}`
    で個別除外できる。
  - **テーマ CSS**: 5 テーマに脚注ラベル・`<figure>`/`<figcaption>` のスタイルを追加。Saiun には相互参照リンク
    `.kappan-xref`（アクセント色＋点線下線）と `.code-figure`（リストキャプションを左揃えで上に置く）の
    スタイルを追加。
