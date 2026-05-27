---
title: 第11章 プラグイン開発入門
id: ch11-plugin-development
---

# 第11章 プラグイン開発入門

本章は、Kappan のプラグインを自分で書きたい方に向けた入門である。サードパーティ作者として npm に公開するところまでを扱う。詳細リファレンスは `docs/plugin-authoring.md` を参照されたい。

## 11.1 なぜプラグインを書くか

Kappan のコアは AST 中心主義のもとに、最小限のパイプラインだけを提供する。具体的な記法・組版・装飾はすべてプラグインで実現される。公式に提供されているプラグインは次の通り。

- `@kappan/remark-jp`：ルビと圏点
- `@kappan/remark-tech`：shiki によるコードハイライト
- `@kappan/plugin-review-compat`：Re:VIEW 記法の受理
- `@kappan/plugin-figure-numbering`：図表の自動採番
- `@kappan/plugin-kinsoku`：JLReq 準拠の禁則処理

公式プラグインだけでは足りない領域は、サードパーティが埋めることになる。例として、専門分野固有の記法、特定の出版社向けスタイル、IPA フォントのサブセット化など、ニッチな要求に応える余地が広く残されている。

## 11.2 最初の一歩

最小プラグインは 20 行程度で書ける。「すべての段落の末尾に句点を付ける」例を挙げる。

```typescript
import { definePlugin } from '@kappan/core';
import { visit } from 'unist-util-visit';
import type { Root as MdastRoot, Paragraph } from 'mdast';

export const addPeriod = definePlugin({
  name: 'kappan-plugin-period',
  version: '0.1.0',
  kind: 'transform',
  hooks: () => ({
    onMdast(tree: MdastRoot) {
      visit(tree, 'paragraph', (paragraph: Paragraph) => {
        const last = paragraph.children[paragraph.children.length - 1];
        if (last?.type === 'text' && !last.value.endsWith('。')) {
          last.value += '。';
        }
      });
    },
  }),
});
```

利用側は次のようにする。

```typescript
import { defineConfig } from '@kappan/core';
import { addPeriod } from 'kappan-plugin-period';

export default defineConfig({
  plugins: [addPeriod()],
  // ...
});
```

これだけで、すべての段落の末尾に自動的に句点が付与される。

## 11.3 プラグイン種別の選び方

`kind` は以下の 5 種類から選ぶ。

| 種別 | 動作層 | いつ選ぶか |
|:---|:---|:---|
| `syntax` | micromark / 文字列前処理 | Markdown 構文自体を拡張・改変したい |
| `transform` | mdast | 文書構造を変換したい |
| `typography` | hast | 見た目に関する装飾を加えたい |
| `packager` | パッケージング後処理 | manifest や OPF にメタデータを追加したい |
| `validator` | 検証 | 独自の品質チェックを加えたい |

迷ったときの目安：

- 見た目だけ変えたい → `typography`
- 文書構造を変えたい → `transform`
- Markdown 記法そのものを拡張したい → `syntax`
- 検証ルールを足したい → `validator`

## 11.4 命名規約と npm 公開

プラグインの発見性を担保するため、命名と npm 公開には次の規約がある。

- パッケージ名は `@kappan/plugin-*`（公式）または `kappan-plugin-*`（サードパーティ）
- `package.json` の `keywords` に `kappan-plugin` を含める
- `peerDependencies` に `@kappan/core` を宣言する
- TypeScript 型定義（`.d.ts`）を同梱する
- ライセンスは MIT または Apache-2.0 を推奨

```json
{
  "name": "kappan-plugin-period",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "keywords": ["kappan-plugin", "punctuation"],
  "peerDependencies": {
    "@kappan/core": "^0.1.0"
  },
  "license": "MIT"
}
```

公開する前に、ローカルの書籍プロジェクトでドッグフードして動作を確認することを強く推奨する。

## 11.5 公式採用への道

サードパーティで実績を積んだプラグインは、公式（`@kappan/plugin-*`）への昇格が検討される。判断基準は次の通り。

- 6 か月以上の継続的な保守
- 月間ダウンロード数の最低水準
- 書籍での採用実績 2 件以上
- 品質審査（テストカバレッジ 70% 以上、ドキュメント完備）
- API 互換性審査
- RFC 提出と 2 週間の議論期間

公式化後はメンテナンス責任が Kappan のコアメンテナーに移る。原作者の同意は必須である。

## 11.6 おわりに

エコシステムは、書く側と作る側の両輪が回って初めて成立する。日本語書籍のためのツールチェインとして Kappan が定着するかは、コアの完成度よりも、コミュニティから生まれるプラグインの多様性にかかっている。

本書を読んで「自分でも書けそうだ」と感じていただけたなら、ぜひ最初のプラグインを公開してほしい。GitHub Discussions で報告いただければ、紹介を兼ねたフィードバックを差し上げる。

良いプラグイン開発を。
