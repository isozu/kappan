# @kappan/remark-jp

## 0.4.0

### Minor Changes

- 5690f6d: ルビの属性形式 `[漢字]{ruby="かんじ"}` を実装した。これまでパイプ形式 `{漢字|かんじ}` のみ
  対応だったが、ドキュメント（`notations.md` / `add-ruby.md`）に記載済みの属性形式が未実装だった
  不一致を解消する。両形式は出現位置順に 1 パスで処理され、混在しても順序が保たれる。出力は
  どちらも `<ruby>漢字<rt>かんじ</rt></ruby>` で同一。`RubyOptions.enableAttrSyntax`（既定 true）で
  個別に無効化できる。

### Patch Changes

- Updated dependencies [1614576]
  - @kappan/core@0.5.0

## 0.3.1

### Patch Changes

- Updated dependencies [ffb8e14]
  - @kappan/core@0.4.0
