---
title: 第1章 Re:VIEW 互換レイヤーの実演
id: ch01
next: 02-blocks.md
---

={intro} Re:VIEW 互換レイヤーの実演

本書は **Re:VIEW 記法** をそのまま Kappan に投げ込んで、最終 EPUB がどう仕上がるかを示すデモである。

==={inline-samples} インライン記法

Re:VIEW では @<code>{const x = 1} のようにバッククォートを使わずにインラインコードを書ける。@<b>{太字} や @<i>{斜体} もタグ形式である。

ルビは @<ruby>{活版,かっぱん} の形で書け、リンクは @<href>{https://example.com,公式サイト} のように書く。URL を直接出すこともできる：@<href>{https://example.com}。

打ち消し線は @<del>{削除済み} で、キーワード強調は @<kw>{技術書} を使う。脚注参照は @<fn>{note1} のように書ける。

//footnote[note1][これは脚注の本文である。]

==={why-compat} なぜ互換レイヤーが必要か

技術書典をはじめとする同人技術書文化は Re:VIEW を中心に発展してきた。蓄積された原稿資産を活かしながら、@<b>{現代的なツールチェイン}（Markdown + Git + CI/CD）へ移行する道筋を提供することが Kappan の役割である。
