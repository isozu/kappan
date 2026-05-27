# Kappan プラグイン作者ガイド

本書は **Kappan のプラグインを自分で書きたい** 方のための実践ガイドである。サードパーティとして npm レジストリへ公開するところまでを扱う。

## 1. プラグインを書く前に

### Kappan のプラグインとは

Kappan のプラグインは、Markdown から EPUB を生成するパイプラインの**特定段階**に介入する仕組みである。文字列前処理から最終 EPUB パッケージの加工まで、5 つの介入点（フック）がある。

> プラグインは活版印刷における「組版工が使う道具」に相当する。コアパイプラインはそのままに、特定の段階だけを差し替えたり拡張したりできる。

### プラグインで「できること」「できないこと」

| できる                                | できない                         |
| ------------------------------------- | -------------------------------- |
| Markdown 文字列を変換する（onSource） | EPUB の ZIP 構造を直接書き換える |
| mdast / hast を変換する               | リーダー側の表示挙動を変える     |
| 診断（Diagnostic）を発行する          | コアパイプラインの段階を増やす   |
| 設定スキーマを宣言する                | 設定ファイル自体を書き換える     |

### 開発の流れ

```
1. アイデアを decision してプラグイン種別を選ぶ
2. リポジトリを作る（`kappan-plugin-<name>`）
3. `definePlugin` で実装
4. テストを書く
5. ローカルの書籍プロジェクトで動作確認
6. npm publish
```

## 2. 最小プラグインの雛形

最も単純な「すべての段落の末尾に句点を付ける」プラグインを例に取る。

### package.json

```json
{
  "name": "kappan-plugin-period",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "keywords": ["kappan-plugin"],
  "peerDependencies": {
    "@kappan/core": "^0.1.0"
  }
}
```

`keywords` に **`kappan-plugin`** を入れることが命名規約。npm レジストリで横断検索される。

### src/index.ts

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

### 利用側

```typescript
import { defineConfig } from '@kappan/core';
import { addPeriod } from 'kappan-plugin-period';

export default defineConfig({
  // ...
  plugins: [addPeriod()],
});
```

## 3. プラグイン種別の選び方

`kind` は次の 5 種類から選ぶ。

| 種別         | 動作層                   | いつ選ぶか                                     |
| ------------ | ------------------------ | ---------------------------------------------- |
| `syntax`     | micromark / 文字列前処理 | Markdown 構文自体を拡張・改変したい            |
| `transform`  | mdast                    | 文書構造を変換したい（章番号・索引・自動目次） |
| `typography` | hast                     | 見た目に関する装飾・整形を加えたい             |
| `packager`   | EPUB パッケージング      | manifest や OPF にメタデータを追加したい       |
| `validator`  | 検証                     | 独自の品質チェックを加えたい                   |

迷ったときの選び方：

- **見た目だけ変えたい** → `typography`
- **文書構造を変えたい** → `transform`
- **Markdown 記法そのものを拡張したい** → `syntax`
- **検証ルールを足したい** → `validator`

## 4. PluginContext の使い方

各フックは第2引数で `PluginContext` を受け取る。

```typescript
interface PluginContext {
  readonly config: KappanConfig; // 書籍プロジェクトの設定（読み出し専用）
  readonly logger: PluginLogger; // 警告・エラーログ
  readonly cache: PluginCache; // プラグイン横断のキー・値ストア
  readonly emit: (d: Diagnostic) => void; // 診断の発行
}
```

### logger

```typescript
ctx.logger.info('processing chapter');
ctx.logger.warn('encountered unsupported syntax');
ctx.logger.error('aborting due to invalid input');
```

`KAPPAN_DEBUG=1` 環境変数で `debug` レベルが出る。

### cache

プラグイン間でデータを共有するためのキー・値ストア。図表番号プラグインで「章ごとの番号カウンター」を保持するなど。

```typescript
const count = ctx.cache.get<number>('fig-counter') ?? 0;
ctx.cache.set('fig-counter', count + 1);
```

### emit

検証エラーや警告を発行する。`severity: 'error'` を発行するとビルドが中断する。

```typescript
ctx.emit({
  severity: 'warning',
  source: 'kappan-plugin-period',
  message: 'A paragraph was missing a period',
});
```

## 5. ライフサイクルフックの実行順序

```
onInit
  ↓
  for each chapter:
    onSource (Markdown 文字列)
      ↓
    onMdast (mdast AST)
      ↓
    onHast (hast AST)
  ↓
onPackage (EPUB パッケージ全体)
  ↓
onValidate (検証段階)
  ↓
onDispose
```

設定ファイルの `plugins: [...]` 配列順がフック実行順を決める。

```typescript
plugins: [
  reviewCompat(),         // 1. 最初に Re:VIEW を変換
  figureNumbering(),      // 2. 図表に番号を振る
  shikiHighlight(),       // 3. コードハイライト
  kinsoku(),              // 4. 最後に禁則処理
],
```

## 6. 既存公式プラグインを参考にする

ソースコードを読むのが最も早い。代表的な参考実装：

| プラグイン                                | 種別       | 学べること                            |
| ----------------------------------------- | ---------- | ------------------------------------- |
| `@kappan/remark-jp` の `ruby`             | typography | hast text ノードのパターン置換        |
| `@kappan/remark-tech` の `shikiHighlight` | typography | 外部ライブラリとの統合、async 処理    |
| `@kappan/plugin-figure-numbering`         | transform  | mdast の2パス処理（収集→解決）        |
| `@kappan/plugin-kinsoku`                  | typography | 段落への className 付与とテキスト分割 |
| `@kappan/plugin-review-compat`            | syntax     | onSource フックでの文字列前処理       |

すべて `definePlugin` を使って書かれており、独自規約はない。

## 7. 単体テストと冪等性テスト

### 単体テスト

Vitest で書く。AST を直接構築して、フックを呼んで、変換結果を assert する。

```typescript
import { describe, it, expect } from 'vitest';
import { addPeriod } from './index.js';

const stubCtx = {
  config: {} as any,
  logger: { debug() {}, info() {}, warn() {}, error() {} },
  cache: { get: () => undefined, set: () => {}, delete: () => false },
  emit: () => {},
};

describe('addPeriod', () => {
  it('adds period to text not ending in 。', async () => {
    const plugin = addPeriod();
    const tree = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [{ type: 'text', value: '本文' }],
        },
      ],
    };
    await plugin.hooks.onMdast?.(tree as any, stubCtx);
    expect(tree.children[0].children[0].value).toBe('本文。');
  });
});
```

### 冪等性テスト

同じプラグインを2回適用しても結果が変わらないこと（property-based）。

```typescript
it('is idempotent', async () => {
  const plugin = addPeriod();
  const original = makeTree();
  await plugin.hooks.onMdast?.(original, stubCtx);
  const first = JSON.stringify(original);
  await plugin.hooks.onMdast?.(original, stubCtx);
  const second = JSON.stringify(original);
  expect(first).toBe(second);
});
```

非破壊的なプラグインは冪等性を保つべき。Kappan が「合成可能性を保証する」と約束している原則による。

## 8. npm publish とバージョニング

### semver の運用

Kappan のプラグインエコシステムは semver を厳格に運用する。

- **メジャー**：プラグインの公開 API（オプション型、フックシグネチャ）を破壊的に変更する
- **マイナー**：オプション追加、新フック対応など後方互換な拡張
- **パッチ**：バグ修正のみ

特に、`@kappan/core` のメジャー更新時はプラグインの `peerDependencies` を更新する必要がある。

### publish 前のチェックリスト

- [ ] package.json の `keywords` に `kappan-plugin` を含む
- [ ] `peerDependencies` に `@kappan/core` の対応メジャー範囲を指定
- [ ] `.d.ts` 型定義を同梱（TypeScript で書いていれば自動）
- [ ] ライセンスは MIT または Apache-2.0 を推奨
- [ ] README にインストール手順、設定例、注意事項を記載
- [ ] CHANGELOG.md に変更履歴を記述
- [ ] 単体テストを CI で走らせる

### publish

```bash
npm publish --access public
```

npm の `@scope/...` 形式を使う場合はスコープ取得が必要。サードパーティ作者は `kappan-plugin-*` 形式の単一名前空間で問題ない。

## 9. 公式採用（昇格）の道筋

コミュニティで実績を積んだプラグインは、公式（`@kappan/plugin-*`）への昇格が検討される。昇格の目安は次の通り。

- 6 か月以上の継続的な保守
- 月間ダウンロード数の最低水準
- 書籍での採用実績 2 件以上
- 品質審査（テストカバレッジ 70%以上、ドキュメント完備）
- API 互換性審査
- RFC 提出と 2 週間の議論期間

公式化後はメンテナンス責任が Kappan のコアメンテナーに移る。原作者の同意は必須。

## 10. コミュニティとフィードバック

- GitHub Discussions：質問と提案
- Issue：バグ報告
- Pull Request：機能追加
- RFC：破壊的変更や大規模機能追加

RFC プロセスは整備中で、当面は Issue ベースの議論を起点とする。開発参加の手順は [`CONTRIBUTING.md`](../CONTRIBUTING.md) を参照。

---

本書を読んだだけでプラグインが書けるなら、ガイドとして合格である。書けなかった部分は GitHub Discussions で教えてほしい。本書も継続的に改善していく。
