# How-to: プラグインを書く

Kappan のプラグインは `definePlugin()` で定義する npm パッケージ。`kappan plugin` コマンドで雛形生成から公開前検査までを行える。詳細な API は [`plugin-authoring.md`](../plugin-authoring.md) を参照。

## 雛形を生成する

```bash
pnpm kappan plugin init my-plugin --kind transform
```

`my-plugin/` に `package.json`・`tsconfig.json`・`src/index.ts`（`definePlugin` の雛形）・`src/index.test.ts`・`README.md` が生成される。

`--kind` は `syntax`（onSource）/ `transform`（onMdast）/ `output`（onPackage）。

## 実装する

`src/index.ts` の `hooks` を埋める。

```ts
import { definePlugin } from '@kappan/core';

export const myPlugin = definePlugin({
  name: 'my-plugin',
  version: '0.1.0',
  kind: 'transform',
  hooks: () => ({
    onMdast(tree, ctx) {
      // mdast を走査して書き換える
    },
  }),
});
```

## テストする

```bash
cd my-plugin
pnpm install
pnpm kappan plugin test     # typecheck + vitest
```

## ローカルで使う

開発中のプラグインを書籍プロジェクトから参照する：

```bash
pnpm kappan plugin link             # プラグイン側で global link
# 書籍プロジェクト側で
pnpm link --global my-plugin
```

## 公開する

公開前検査（name / version / private / exports / keywords）を回す：

```bash
pnpm kappan plugin publish          # ドライラン
pnpm kappan plugin publish --yes    # 実際に publish
```

`keywords` に `kappan-plugin` を含めると discoverability が上がる（検査でも要求される）。

## 関連

- [プラグイン作者ガイド](../plugin-authoring.md)
