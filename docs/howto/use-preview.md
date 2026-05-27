# How-to: プレビューサーバで書きながら確認する

`kappan preview` は章を編集するたびに自動で再ビルドし、ブラウザに反映する軽量プレビューサーバ（SSE + chokidar、Vite 不使用）。HMR 反映時間は中央値 7ms 程度。

## 起動する

```bash
pnpm kappan preview --config your-book/kappan.config.ts
```

既定で `http://127.0.0.1:5173` が立ち上がる。

```bash
# ポートを変える
pnpm kappan preview --config your-book/kappan.config.ts --port 8080
```

## 使い方

- 左ペイン：章リスト
- 右ペイン：選択中の章の XHTML
- `.md` を保存すると数十ミリ秒で右ペインが更新される

## 終了

`Ctrl+C` でサーバを停止する。

## ビルドせずに健全性だけ見たい

プレビューを立てるまでもなく、内部リンク・alt・見出し階層だけ素早く確認したいときは `kappan check`。

```bash
pnpm kappan check --config your-book/kappan.config.ts
pnpm kappan check --config your-book/kappan.config.ts --strict   # warning も失敗扱い
```

## 関連

- [チェックコマンドは CI の早期フェイルにも使える]
- [技術書チュートリアル](../tutorial-tech-book.md)
