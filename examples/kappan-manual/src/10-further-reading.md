---
title: 第10章 さらに学ぶ
id: ch10-further-reading
next: 11-plugin-development.md
---

# 第10章 さらに学ぶ

本書は書籍著者に必要な内容を一通り扱った。本章では、さらに深く Kappan を理解したい読者のための参考資料と、コントリビューションの導線を示す。

## 10.1 公開ドキュメント

Kappan の詳細なドキュメントは `docs/` に整理されている。書籍著者として次に読むとよい。

- [`docs/quickstart.md`](../../../docs/quickstart.md)：クイックスタート
- `docs/tutorial-tech-book.md` / `docs/tutorial-novel-tategumi.md`：横組み技術書・縦組み小説のチュートリアル
- `docs/howto/`：目的別ガイド（ルビ・索引・KaTeX 数式・テーマ・Kindle 入稿・縦組みの実機確認など）
- `docs/reference/config.md` / `docs/reference/notations.md`：設定・記法リファレンス
- [`docs/migrating-from-review.md`](../../../docs/migrating-from-review.md)：Re:VIEW からの移行
- `docs/plugin-authoring.md`：プラグイン作者ガイド

## 10.2 リポジトリ構造の理解

開発者として Kappan に踏み込む場合、リポジトリの主要ディレクトリを把握しておくと迷わない。

```
kappan/
├── packages/
│   ├── core/             # パイプライン本体
│   ├── epub-packager/    # OPF/NAV/ZIP 生成
│   ├── cli/              # コマンドラインインターフェイス
│   └── themes-mono/      # Mono テーマ
├── tests/
│   ├── fixtures/         # ゴールデンファイルテスト用フィクスチャ
│   ├── golden/           # 期待出力のスナップショット
│   └── support/          # テスト支援ユーティリティ
├── tools/
│   ├── epubcheck/        # EPUBCheck 取得スクリプト
│   └── bench/            # ベンチマーク
├── examples/
│   └── kappan-manual/    # 本書のソース
└── docs/
    ├── quickstart.md     # クイックスタート
    ├── howto/            # 目的別ガイド
    └── reference/        # 設定・記法リファレンス
```

## 10.3 ゴールデンファイルテスト

Kappan の品質保証の中核は、ゴールデンファイルテスト基盤である。`tests/fixtures/` に置かれたフィクスチャ書籍を毎回ビルドし、`tests/golden/` 配下の期待出力と差分比較する。

差分が出た場合、`pnpm test:update-golden` で golden を更新する。差分のレビューがそのまま設計レビューの一部となるため、出力に意図しない変化を入れにくい構造になっている。

これは後続のすべての変更の安全網として機能する。

## 10.4 ベンチマーク

`pnpm bench` で実行できるベンチマークスクリプトは、フィクスチャ書籍を 10 回ビルドして中央値・p95・最大値などの統計を出力する。

```bash
pnpm bench --iterations 10 --output bench-results/$(date +%s).json
```

ベンチ比較スクリプトはしきい値判定（Welch's t-test + IQR + 累積判定）に対応しており、PR で回帰を検出できる。

## 10.5 コントリビューションの方法

Kappan は OSS プロジェクトであり、コードとドキュメントの貢献を歓迎する。開発参加の手順は `CONTRIBUTING.md` を参照。RFC プロセスは整備中で、当面は GitHub Issues での議論を起点とする。

- 機能追加の提案：Issue で議論し、合意が得られたら PR
- バグ報告：再現手順を添えて Issue
- ドキュメント改善：直接 PR を歓迎
- プラグインの公式化提案：Issue での議論を起点とする

プラグイン作者になりたい場合は `kappan plugin init` コマンドで雛形を作れる。詳細は `docs/plugin-authoring.md` を参照。

## 10.6 おわりに

電子書籍の制作環境はここ数年で大きく変わった。Markdown と Git でコンテンツを管理し、CI/CD で再現性のあるビルドを回し、複数ストアへ同時に配信する流れは、もはや一部の技術書だけのものではない。

Kappan は、この流れを日本語書籍にも本格的に持ち込むために設計された。

プラグインエコシステム、縦組み品質、主要ストアへの最適化を積み重ね、Markdown から商業品質の日本語電子書籍を生み出す手段として選ばれるようになることを願っている。

本書を読んでくださった全ての方に感謝する。
