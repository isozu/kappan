# Contributing to Kappan

Kappan へのコントリビューションを歓迎します。バグ報告・機能提案・ドキュメント改善・プラグイン開発、どれも大切な貢献です。

## 開発環境

- Node.js 20 LTS 以上（`.nvmrc` で 20.19.6 を固定）
- pnpm 10 以上（Corepack で解決：`corepack enable`）
- Java 17 以上（EPUBCheck を走らせる場合のみ）
- ACE by DAISY（任意、`--ace` 検証を使う場合）

## セットアップ

```bash
git clone https://github.com/isozu/kappan.git
cd kappan
corepack enable
pnpm install
pnpm test
```

## 開発フロー

```bash
pnpm test               # 全テスト（vitest）
pnpm typecheck          # 全パッケージの型チェック
pnpm format             # prettier で整形
pnpm format:check       # 整形チェック（CI と同じ）
pnpm test:update-golden # ゴールデンファイル更新（意図的な出力変更時のみ）
pnpm bench              # ビルド時間ベンチマーク
```

- ブランチを切って作業し、PR を送る（`main` へ直接 push しない）
- 変更には **changeset を添える**：`pnpm changeset` で、どのパッケージを major / minor / patch で上げるか + 変更概要を記録する
- **テスト・typecheck・format:check がすべて緑**であること
- ゴールデンファイル（`tests/golden/`）の差分はレビュー対象。意図しない出力変化を入れないこと

## モノレポ構成

`packages/*` に 20 個の `@kappan/*` パッケージがある。全パッケージは lockstep で同一バージョン（現在 `0.3.0`）。詳細は [README のパッケージ構成](./README.md#パッケージ構成全-20-パッケージ-030--公開済) を参照。

## プラグインを書く

公式プラグインの仕組みと `definePlugin` API は [`docs/plugin-authoring.md`](./docs/plugin-authoring.md) を参照。`kappan plugin init <name>` で雛形を生成できます。

## PR の流れ

1. Issue で議論する（大きな変更は実装前に合意を）
2. ブランチで実装 + テスト + changeset
3. PR を作成（[PR テンプレート](./.github/PULL_REQUEST_TEMPLATE.md) に従う）
4. CI が緑 + レビュー承認後にマージ

## 行動規範

すべての参加者は [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) に従ってください。
