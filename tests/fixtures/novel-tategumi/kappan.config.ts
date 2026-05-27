import { defineConfig } from '@kappan/core';
import { sumi } from '@kappan/themes-sumi';
import { kinsoku } from '@kappan/plugin-kinsoku';
import { tcySmart } from '@kappan/plugin-tcy-smart';
import { readerShim } from '@kappan/plugin-reader-shim';
import { ruby, kenten, punctuation, dialogue } from '@kappan/remark-jp';

/**
 * novel-tategumi — M2-A 完了基準用の架空縦組み小説フィクスチャ（vertical-rl）。
 *
 * Kappan の最終目標「Kindle Unlimited で売れる日本語縦書き小説」を商業品質で
 * 組めるかを判定する基準フィクスチャ。Sumi テーマ（墨）+ 縦組みプラグインセットで、
 * 縦組み小説の組版難所を一通り踏ませる：
 *   - 会話文（行頭カギ括弧「「」「『」）と地の文の判定（dialogue / narrative）
 *   - ルビ `{漢字|かんじ}`、圏点 `[重要]{.kenten}`
 *   - 縦中横：2 桁数字（tcy 対象）と 4 桁年号（tcy 非対象）の対比
 *   - 連続約物：三点リーダ `……` とダーシ `――`（U+2015）の連続非改行
 *   - 欧文混在（縦組み中の横倒し / 縦中横）
 *   - 長段落での禁則処理
 *
 * プラグイン構成メモ（計画 Phase 2/3）：
 *   - punctuation / dialogue は remark-jp（Phase 2）が AST に `.renzoku-*` /
 *     `.dialogue` / `.narrative` class を付与する。字形・位置・字間は Sumi の
 *     縦組み CSS（Phase 1）が受ける。
 *   - readerShim は body に `reader-<profile>` class を付与し、リーダー差異吸収 CSS は
 *     Sumi テーマに集約（組み方向では分岐しない）。
 *
 * identifier は golden 用固定 uuid。横組みの tech-book-yokogumi（...d000）とは別系統の
 * 固定値（...00a1）を使い、golden 生成を再現可能にする。
 */
export default defineConfig({
  metadata: {
    title: 'Novel Tategumi',
    subtitle: 'Sumi テーマで作る縦組み小説サンプル',
    creator: [{ name: 'Kappan Team', fileAs: 'Kappan Team', role: 'aut' }],
    language: 'ja',
    publisher: 'Kappan Sample Press',
    identifier: 'urn:uuid:00000000-0000-0000-0000-0000000000a1',
  },
  source: { entry: 'src/index.md', baseDir: 'src/' },
  output: { dir: 'dist/', filename: '{title}.epub' },
  writingMode: 'vertical-rl',
  theme: sumi(),
  plugins: [
    ruby(),
    kenten(),
    // punctuation を kinsoku より前に置く：連続約物を 1 span にまとめてから
    // 禁則の改行禁止 span 付与を走らせる（renzoku span 内をさらに分割しない）。
    punctuation(),
    dialogue(),
    tcySmart(),
    kinsoku(),
    readerShim(),
  ],
});
