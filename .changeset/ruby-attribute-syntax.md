---
'@kappan/remark-jp': minor
---

ルビの属性形式 `[漢字]{ruby="かんじ"}` を実装した。これまでパイプ形式 `{漢字|かんじ}` のみ
対応だったが、ドキュメント（`notations.md` / `add-ruby.md`）に記載済みの属性形式が未実装だった
不一致を解消する。両形式は出現位置順に 1 パスで処理され、混在しても順序が保たれる。出力は
どちらも `<ruby>漢字<rt>かんじ</rt></ruby>` で同一。`RubyOptions.enableAttrSyntax`（既定 true）で
個別に無効化できる。
