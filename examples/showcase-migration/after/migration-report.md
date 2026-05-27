# Kappan Migration Report

- Source: examples/showcase-migration/before
- Target: examples/showcase-migration/after
- Generated: 2026-05-27T06:47:36.035Z

## Summary

- **Unsupported notations: 0 件**
- Files converted: 4
- Re:VIEW notations matched: 18
- Config fields ignored: 0
- Images copied: 2

## ✅ 対応した内容

- Re:VIEW notations matched: 18 件（インライン 25+ 種、ブロック 18+ 種）
- Catalog sections handled: PREDEF, CHAPS, APPENDIX, POSTDEF
- config.yml 主要フィールド：booktitle, bookname, aut/edt/trl, language, publisher, isbn, date, coverimage
- Images copied: 2
- 生成 `kappan.config.ts` に `[reviewCompat(), figureNumbering(), kinsoku()]` を含めて出力

## 🔜 今後対応予定

- Full Re:VIEW notation coverage を含む完全変換
- `review-ext.rb` プラグインの部分対応
- LSP / VSCode 拡張統合
- 各ストア向け入稿リント

## Next Steps

1. Review the unsupported notations above and replace them with Markdown equivalents.
2. Open `kappan.config.ts` and verify the generated metadata.
3. Run `pnpm kappan build --validate` to verify the EPUB output.
