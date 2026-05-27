# showcase-migration — Re:VIEW ビフォーアフター

既存の **Re:VIEW** 原稿を、1 コマンドで Kappan（Markdown）プロジェクトへ移行できる
ことを示すショーケースです。同じ一冊が `before/`（Re:VIEW）と `after/`（Kappan）に
あり、記法がどう対応するかを読み比べられます。

```
showcase-migration/
├─ before/                # Re:VIEW 原稿一式（入力）
│  ├─ config.yml
│  ├─ catalog.yml
│  ├─ preface.re / chap01.re / chap02.re / colophon.re
│  └─ images/diagram.png
├─ after/                 # kappan migrate の生成物（出力）
│  ├─ kappan.config.ts
│  ├─ src/*.md
│  ├─ images/diagram.png
│  └─ migration-report.md
└─ README.md
```

## 1 コマンドで移行

```sh
# リポジトリのルートから実行
pnpm kappan migrate examples/showcase-migration/before \
  --out examples/showcase-migration/after --force
```

`.re` ファイルが Markdown に、`config.yml` と `catalog.yml` が `kappan.config.ts` に
変換され、`images/` はそのままコピーされます。未対応記法の件数は
`after/migration-report.md` に集計されます（本ショーケースは未対応 0 件）。

> **注意**: 移行先はワークスペース配下（`examples/showcase-migration/after`）に
> 置いてください。`/tmp` など外部に出すと `@kappan/*` の依存が解決できません。

## ビルド

```sh
pnpm kappan build --config examples/showcase-migration/after/kappan.config.ts --validate
```

`after/` は **EPUBCheck 0 errors / 0 warnings** でビルドできます。
出力は `after/dist/review-migration-demo.epub`。

## 記法の対応

### インライン記法

| Re:VIEW | Kappan (Markdown) |
| --- | --- |
| `@<b>{太字}` | `**太字**` |
| `@<i>{斜体}` | `*斜体*` |
| `@<code>{x}` | `` `x` `` |
| `@<ruby>{活版,かっぱん}` | `{活版\|かっぱん}` |
| `@<kw>{Kappan}` | `[Kappan]{.kw}` |
| `@<href>{url,文言}` | `[文言](url)` |
| `@<fn>{id}` | `[^id]` |

### ブロック記法

| Re:VIEW | Kappan (Markdown) |
| --- | --- |
| `//list[id][caption][lang]{ … //}` | `` ```lang `` フェンス（キャプションは太字行） |
| `//image[id][caption]` | `![caption](../images/id.png)` |
| `//footnote[id][text]` | `[^id]: text` |
| `//note{ … //}` | `> [!NOTE]` 注釈ブロック |
| `//quote{ … //}` | `> ` 引用 |

### プロジェクト構成

| Re:VIEW | Kappan |
| --- | --- |
| `config.yml`（booktitle / aut / publisher …） | `kappan.config.ts` の `metadata` |
| `catalog.yml`（PREDEF / CHAPS / POSTDEF） | 各章 front-matter（`id` / `next` / `chapterNumber`） |
| `={id} 見出し` | `# 見出し {#id}` |
| `images/` | `images/`（コピー） |

未対応の記法は `<!-- REVIEW-UNSUPPORTED: … -->` というコメントとして変換後の
Markdown に残るため、移行後に目視で追えます。移行はあくまで出発点であり、
Markdown 化した後は索引（`{!…!}`）や数式（`$$…$$`）など Kappan ならではの機能を
追記して磨き込めます（`examples/showcase-techbook/` を参照）。
