# How-to: Kindle に入稿する

Kappan が出力する EPUB 3.3 を Amazon KDP に入稿する手順。

## 1. EPUBCheck を通す

KDP は EPUBCheck エラーのある EPUB を弾くことがある。まず 0 errors を確認する。

```bash
pnpm epubcheck:fetch
pnpm kappan build --config your-book/kappan.config.ts --validate
```

期待出力：`✓ EPUBCheck: 0 errors, 0 warnings`

## 2. アクセシビリティを確認する

KDP はアクセシビリティメタデータを評価する。Kappan は schema.org メタデータを自動付与するが、ACE by DAISY で裏取りしておく。

```bash
pnpm kappan build --config your-book/kappan.config.ts --ace
```

critical / serious が出たら修正する。`--ace-strict` を付けると違反でビルドが失敗するので CI 向き。

## 3. 表紙画像

`metadata.coverImage` に表紙を指定する。KDP は 1600×2560px 以上を推奨。

```ts
metadata: {
  // ...
  coverImage: 'images/cover.jpg',
},
```

## 4. メタデータの整備

| KDP 項目     | Kappan フィールド                     |
| ------------ | ------------------------------------- |
| タイトル     | `metadata.title`                      |
| 著者         | `metadata.creator[].name`             |
| 言語         | `metadata.language`（`ja`）           |
| ISBN（任意） | `metadata.identifier`（`urn:isbn:*`） |

## 5. 入稿

生成された `.epub` を KDP のアップロード画面でそのまま入稿する。Kindle Previewer での最終確認を推奨。

> **注意**：KDP 専用の入稿リント（`@kappan/plugin-kdp-lint`）は今後提供予定。現状は EPUBCheck + ACE + Kindle Previewer の手動確認で運用する。

## 関連

- [アクセシビリティ How-to は ACE 出力の読み方を含む]
- [設定リファレンス](../reference/config.md)
