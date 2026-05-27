# How-to: Re:VIEW から移行する

既存の Re:VIEW プロジェクトを Kappan に乗せ換える最短手順。詳細は [移行ガイド本編](../migrating-from-review.md) を参照。

## 1 行で移行する

```bash
pnpm kappan migrate /path/to/my-review-book
```

隣に `my-review-book-kappan/` ができる。中身は `kappan.config.ts`・`migration-report.md`・`src/*.md`・`images/`。

## レポートを読む

`migration-report.md` の冒頭 **「Unsupported notations: N 件」** をまず見る。0 件なら手作業はほぼ不要。N>0 なら `src/` 内の `<!-- REVIEW-UNSUPPORTED: ... -->` を手で直す。

```bash
grep -rn 'REVIEW-UNSUPPORTED' my-review-book-kappan/src/
```

## PART（部）構成

`catalog.yml` に `PART:` がある場合、各章の front-matter に `part: N` / `partTitle` が入り、部 → 章のネスト構造が保たれる。フラット化はしない。

## ビルドして確かめる

```bash
pnpm kappan build --config my-review-book-kappan/kappan.config.ts --validate
```

`0 errors` が出れば構造的には完成。

## 関連

- [移行ガイド本編](../migrating-from-review.md)
- [記法リファレンス](../reference/notations.md)
- [プレビューで確認する](./use-preview.md)
