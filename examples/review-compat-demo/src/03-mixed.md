---
title: 第3章 Re:VIEW と Markdown の混在
id: ch03
---

={mixed} Re:VIEW と Markdown の混在

互換レイヤーは Re:VIEW 記法のみを変換し、純粋な Markdown はそのまま通過する。両者を自由に混ぜて書ける。

## Markdown 見出し

これは Markdown の見出し記法。下と同じ深さの章節になる。

==={mixed-list} 混在リスト

- これは Markdown のリスト項目
- @<code>{インラインコード} を含む項目
- @<b>{太字} と **Markdown 太字** は同等

==={mixed-table} 混在テーブル

| Re:VIEW | Kappan | 状態 |
|---|---|---|
| @<code>{@<code>} | `インライン` | ✓ |
| @<code>{//list} | フェンス | ✓ |
| @<code>{@<ruby>} | `{活字\|かつじ}` | ✓ |
| @<code>{@<fn>} | `[^id]` | ✓ |

==={moving-forward} 移行を始めるには

既存の Re:VIEW プロジェクトの章ファイル（`.re`）の拡張子を `.md` に変更し、`kappan.config.ts` の @<code>{plugins} に @<code>{reviewCompat()} を追加するだけで、ほとんどの記法はそのまま動く。完全互換ではないため、未対応記法は HTML コメント（@<code>{REVIEW-UNSUPPORTED}）として残り、後で個別に対応できる。

このアプローチは @<b>{段階的移行} を可能にする。一括変換ツール（@<code>{kappan migrate}）を使わずとも、書きながら徐々に Markdown 化していける。
