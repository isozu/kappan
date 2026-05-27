# Kappan で縦書き小説を組む — 完成見本

Kappan の **日本語縦書き（vertical-rl）組版**を一目で伝える完成見本です。  
オリジナル短編「灯台守の最後の夜」を、Markdown 一本から商業品質の EPUB 3.3 に組み上げます。

![縦組みレイアウト（第一章）](./screenshots/vertical.png)

本文は右から左へ流れ、章扉・ルビ・圏点・縦中横が組版されています。

## この見本が示す縦組みの組版要素

- **縦書き本文（vertical-rl）** — 本文が右→左に流れ、ページ送りも右綴じ（OPF `page-progression-direction="rtl"`）
- **ルビ** — `{灯台守|とうだいもり}` のような難読漢字に、親文字の右へルビを配置
- **圏点** — `[消えゆく灯]{.kenten}` の強調に圏点（傍点）
- **縦中横** — 2 桁の数字（`12` 時・`28` 年）を縦組み中で横に組み、4 桁の年号（`1897` 年）は縦に流して対比
- **連続約物** — ダーシ `――`（U+2015 ×2）と三点リーダ `……`（U+2026 ×2）を分離させず連続表示
- **会話文と地の文** — 行頭のカギ括弧「」を会話文として、地の文は天付き 1 字下げで組み分け

## 構成

```
examples/showcase-novel/
├── kappan.config.ts        # writingMode: 'vertical-rl' + sumi() テーマ + 縦組みプラグイン
├── src/
│   ├── index.md            # 序（タイトル）
│   ├── ch01.md             # 第一章 引き継ぎの手紙
│   ├── ch02.md             # 第二章 12時の灯（縦中横・連続約物）
│   └── ch03.md             # 第三章 最後の夜（圏点・長い段落の禁則）
├── capture-screenshots.ts  # 縦組みレイアウトのスクリーンショット生成
└── screenshots/            # 生成済みスクリーンショット
```

## ビルド

```bash
# EPUB を組み、EPUBCheck で検証（Java 17+ が必要）
pnpm kappan build --config examples/showcase-novel/kappan.config.ts --validate
```

成果物は `examples/showcase-novel/dist/灯台守の最後の夜.epub` に出力されます。  
EPUBCheck は **0 errors / 0 warnings** で通過します。

## スクリーンショット

縦組みレイアウトのスクリーンショットは、ローカルの Chrome for Testing（puppeteer-core）で
描画して生成します。

```bash
node --import tsx examples/showcase-novel/capture-screenshots.ts
```

`screenshots/vertical.png`（第一章）を README のヒーロー画像として参照しています。  
各章の全体像は `screenshots/ch00〜ch03.png` にあります。

> 注: スクリーンショットは Blink（Chromium）描画による近似です。実機リーダー（Apple Books /
> Kindle / Kobo / Thorium）での最終的な見え方は、各リーダーの組版エンジンに依存します。
