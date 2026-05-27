# How-to: 新しい本を始める

`kappan init` でテンプレートから新規プロジェクトを生成する。

## テンプレートを選ぶ

```bash
pnpm kappan init --template tech-book my-book
pnpm kappan init --template novel my-novel
pnpm kappan init --template manual my-manual
```

| テンプレート | 用途         | テーマ | プラグイン                                               |
| ------------ | ------------ | ------ | -------------------------------------------------------- |
| `tech-book`  | 横組み技術書 | Saiun  | reviewCompat / ruby / kenten / figureNumbering / kinsoku |
| `novel`      | 縦書き小説   | Sumi   | ruby / kenten / kinsoku                                  |
| `manual`     | 実用書       | Hibana | ruby / figureNumbering / kinsoku                         |

> `kappan themes list` で利用できるテーマの一覧を確認できる。テンプレートが選ぶテーマは生成された `kappan.config.ts` で差し替えられる。

## タイトルと著者を指定する

```bash
pnpm kappan init --template tech-book --title "私の技術書" --author "山田太郎" my-book
```

## 生成物

```
my-book/
├── kappan.config.ts
├── README.md
├── .gitignore
├── src/
│   ├── index.md      # 先頭章（next: chap01.md）
│   └── chap01.md
└── images/           # tech-book / manual のみ
    └── .gitkeep
```

## ビルドする

```bash
cd my-book
pnpm kappan build --validate
```

## 関連

- [テーマをカスタマイズする](./customize-theme.md)
- [技術書チュートリアル](../tutorial-tech-book.md)
- [小説チュートリアル](../tutorial-novel-tategumi.md)
