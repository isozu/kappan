# チュートリアル：縦組みの小説を組む

このチュートリアルは、Kappan で**中編小説**を一冊、本格的な縦組みで組み上げる流れを体験する。

> **縦組みについて**
> 本格的な縦組み（`writing-mode: vertical-rl`）と縦書き専用テーマ **Sumi（墨）** に対応している。`theme: sumi()` + `writingMode: 'vertical-rl'` を指定すれば、ルビ・圏点・縦中横・章扉・会話文制御を備えた縦書き小説を組める。横組みで進めたい場合は `theme: mono()` のまま `writingMode` を省略すればよい。

## このチュートリアルで学ぶこと

1. `kappan init --template novel` で小説プロジェクトを起こす
2. ルビと圏点で和文表現を作る
3. 段落・会話文・三点リーダー・ダッシュの扱い
4. 禁則処理（kinsoku）
5. 章立てと front-matter
6. 縦中横と縦組みの仕上げ

---

## ステップ 1：プロジェクトを起こす（10 分）

```bash
pnpm kappan init --template novel --title "活版の街" --author "夜長月子" my-novel
cd my-novel
```

`novel` テンプレートの `kappan.config.ts`：

```ts
import { sumi } from '@kappan/themes-sumi';
import { kinsoku } from '@kappan/plugin-kinsoku';
import { ruby, kenten } from '@kappan/remark-jp';

export default defineConfig({
  // ...
  theme: sumi(), // 縦書き小説向けテーマ
  writingMode: 'vertical-rl', // 縦組み（右→左）
  plugins: [ruby(), kenten(), kinsoku()],
});
```

縦書き小説向けの **Sumi** テーマと `writingMode: 'vertical-rl'` を指定する。横組みで進めたい場合は `theme: mono()` にして `writingMode` を省略すればよい。

---

## ステップ 2：ルビと圏点（15 分）

和文小説で多用するのがルビと圏点。

```markdown
{文選工|もんせんこう}が活字を拾い、{植字工|しょくじこう}が版に組む。

彼女は静かに、しかし[はっきりと]{.kenten}言った。
```

- ルビ：`{漢字|かんじ}`（読みが連続漢字に対応）。1 文字ずつ厳密に振りたいときは `[難語]{ruby="なんご"}`。
- 圏点：`[語]{.kenten}`。縦組みでは右側、横組みでは上側に点が付く。

詳細は [ルビ How-to](./howto/add-ruby.md)。

---

## ステップ 3：会話文と段落制御（15 分）

小説の地の文と会話文は段落で分ける。Markdown では空行が段落の区切り。

```markdown
　活版印刷の音が、夜の工房に響いていた。

「まだ続けるつもり？」

　彼女の声は、鉛の匂いに溶けていった。
```

- 三点リーダーは `……`（U+2026 を 2 つ）、ダッシュは `——`（全角ダッシュ 2 つ）を推奨。Sumi テーマではこれらの連続約物が非改行で正しく組まれる。
- Sumi テーマは地の文の天付き 1 字下げを自動で行い、会話文（開きカギ括弧始まり）は字下げを抑制する。

> 章扉（章頭改ページ）・1 字下げ自動化・会話文制御は Sumi テーマで対応している。柱・ノンブルはリフロー EPUB ではリーダー任せのため出力しない。

---

## ステップ 4：禁則処理（10 分）

`kinsoku()` プラグインが行頭・行末禁則を処理する。句読点や閉じ括弧が行頭に来ないよう、前の行末にぶら下げる（JLReq 準拠の前段）。

```ts
plugins: [ruby(), kenten(), kinsoku()],
```

テンプレートに最初から入っているので、特別な記述は不要。

---

## ステップ 5：章立て（15 分）

各章は `src/*.md`。front-matter の `next` で順序を繋ぐ。

```markdown
---
title: 第一章
id: chap01
next: chap02.md
---

# 第一章

　……
```

`index.md` を入口に、`next` を辿って `chap01.md` → `chap02.md` と繋ぐ。章番号を機械的に振りたい場合は `chapterNumber` を足せる（Re:VIEW 移行時は自動採番）。

部（PART）構成の長編なら、front-matter の `part` / `partTitle` で部 → 章のネストを表現できる（Re:VIEW 移行時に自動付与）。

---

## ステップ 6：縦中横と縦組みの仕上げ（10 分）

縦組みでは半角数字や英字の連続を縦中横（90 度回転させずに横並びで組む）でまとめると読みやすい。

```markdown
昭和[57]{.tcy}年、[12]{.tcy}月のことだった。
```

- 半角数字の連続は `[12]{.tcy}`（縦中横）でマークする。横組みでは無視され、縦組みで効く。
- 横組み前提の絶対位置指定 CSS を `additionalCss` に書かない。
- 画像の向き・サイズは縦組みでも破綻しない範囲にする。

---

## ステップ 7：ビルドと確認

```bash
pnpm kappan build --validate
pnpm kappan preview          # 縦組みの表示を確認
pnpm kappan check --strict   # リンク・見出し・alt の軽量チェック
```

---

## まとめ

- 縦書き小説は **Sumi + `writing-mode: vertical-rl` + ルビ + 圏点 + 禁則** の構成で組む
- Sumi テーマが章扉・天付き 1 字下げ・会話文制御・連続約物を引き受ける
- `[語]{.tcy}` で縦中横をマークすると数字・英字の並びが読みやすくなる

## 次に読む

- [技術書チュートリアル](./tutorial-tech-book.md)
- [ルビを振りたい](./howto/add-ruby.md)
- [縦組みをリーダーで確認する](./howto/check-vertical-on-readers.md)
