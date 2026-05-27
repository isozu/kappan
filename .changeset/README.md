# Changesets

このディレクトリは [Changesets](https://github.com/changesets/changesets) のメタデータを保持する。リリース管理に使う。

## 使い方

### 変更内容を記録する

機能追加・修正を行った PR で次のコマンドを実行する。

```bash
pnpm changeset
```

対話形式で「どのパッケージを」「どのレベル（major/minor/patch）で」更新するかを選び、変更内容の要約を入力する。生成された Markdown は `.changeset/<random>.md` として記録される。

### リリースする

PR がマージされた後、リリース時に次を実行する。

```bash
pnpm version  # 全パッケージのバージョンを更新し、CHANGELOG.md を生成
pnpm release  # npm publish
```

リリース運用の詳細は [ADR 0005 プラグイン API の凍結と公開](../docs/ADR/0005-plugin-api-freeze.md) を参照。

## semver の方針

- **major**：公開 API の破壊的変更
- **minor**：後方互換な追加
- **patch**：バグ修正のみ

破壊的変更は最低 1 年に 1 回までを上限とする（RDD §6.7、ADR 0005）。
