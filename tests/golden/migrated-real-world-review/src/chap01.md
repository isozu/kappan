---
title: 第1章 アーキテクチャ
id: chap01
chapterNumber: 2
next: chap02.md
---
# 第1章 アーキテクチャ {#architecture}

本章では **システム全体** の構成を説明する。[Kappan]{.kw} は AST 中心主義を採用している。

![システム構成図](../images/arch.png)

主要コンポーネント：

 * `@kappan/core` — パイプライン本体
 * `@kappan/epub-packager` — ZIP/OPF/NAV 生成
 * `@kappan/cli` — コマンドラインインターフェイス
