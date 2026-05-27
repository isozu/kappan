# Reader Compatibility (RDD §11.3)

EPUB リーダー実機での表示確認結果を格納するディレクトリ。`.github/workflows/reader-matrix.yml`
が四半期に 1 度（1/4/7/10 月）実行し、結果からリーダー互換性マトリクスを再生成して
`README.md`（リポジトリルート）の該当セクションを PR で自動更新する。

## このディレクトリの構造

```
tests/reader-compatibility/
├── README.md                       # このファイル
├── matrix.json                     # 互換性マトリクスのソース・オブ・トゥルース（手編集可）
├── scripts/
│   ├── update-readme.ts            # matrix.json → README.md の表を再生成
│   ├── thorium-headless.ts         # puppeteer-core + Chrome で縦組みレイアウトを検証
│   └── apple-books.applescript     # (skeleton) Apple Books でフィクスチャを開く
├── build/                          # CI が生成したフィクスチャ EPUB（gitignore 対象、artifact 化）
└── results/                        # リーダー別スクリーンショット・判定（CI 出力）
    ├── minimal-commonmark/
    │   ├── apple/
    │   ├── kindle/
    │   ├── kobo/
    │   └── thorium/
    └── tech-book-yokogumi/
        └── ...
```

## ステータス（M2-A 着地時点）

実機リーダーの起動ステップ（Kindle Previewer 3 CLI / Apple Books AppleScript）は
すべて `if: false` でガードしており、環境整備が済んだ M3 で有効化する。

`scripts/thorium-headless.ts` は **M2-A で本実装に格上げ済み**。puppeteer-core +
ローカルの Chrome for Testing をヘッドレス起動し、縦組みフィクスチャの content XHTML を
`file://` で開いて `getBoundingClientRect` でレイアウト（縦右→左流れ・pre 横組み・
ルビ右配置）を機械検証し、章ごとにスクリーンショットを `results/<fixture>/thorium/` に
保存する。Chromium を Thorium の近似環境とみなす（実フォントでの最終目視はユーザー領域）。

```bash
# novel-tategumi をその場でビルドして縦組みレイアウトを検証
node --import tsx tests/reader-compatibility/scripts/thorium-headless.ts
# ビルド済み EPUB を直接検証する場合
node --import tsx tests/reader-compatibility/scripts/thorium-headless.ts \
  --epub tests/reader-compatibility/build/novel-tategumi/*.epub
```

### M3 で本格化する項目

- Kindle Previewer 3 CLI の self-hosted runner 統合
- Apple Books の AppleScript 自動化
- スクリーンショット差分比較（pixelmatch 等）
- 実機リーダーでの縦組みセル更新（現状は Chromium 近似と RDD §11.3 の調査ベース）

## マトリクスの更新

`matrix.json` がソース・オブ・トゥルース。`scripts/update-readme.ts` が
`<!-- READER-MATRIX:START -->` 〜 `<!-- READER-MATRIX:END -->` の間を再生成する。
CI が無い環境でも手で回せる：

```bash
node --import tsx tests/reader-compatibility/scripts/update-readme.ts \
  --readme README.md
# 結果を確認後に commit するなら --commit を付ける（CI 用）
```
