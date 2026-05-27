---
title: 脚注と HTML 埋め込み
---

# 脚注と HTML 埋め込み

この章では GFM の脚注記法[^a]と、`unsafeHtml: 'sanitized'` 経由で許可された HTML 埋め込みを検証する。

脚注は本文中の小さな番号として現れ[^b]、巻末（章末）にリストとして列挙される。EPUB リーダーはこれをポップアップ表示する。

## HTML 埋め込み

下記は Markdown 中に直接書いた HTML ブロック。`sanitized` モードでは安全な要素のみが通る。

<div class="note">
これは補足のメモです。
</div>

## 画像

![サンプル画像の代替テキスト](../assets/images/sample.png)

[^a]: 1 つ目の脚注本文。脚注は段落として整形される。
[^b]: 2 つ目の脚注。EPUB の `epub:type="footnote"` 属性が付与される。
