={implementation} 第2章 実装

//list[main][主処理][typescript]{
import { buildBook } from '@kappan/core';

export async function main() {
  await buildBook({
    config: loadConfig(),
    outputPath: 'book.epub',
  });
}
//}

//note[NOTE]{
M1 では @<code>{buildBook} と @<code>{buildChapter} の2つを公開している。
//}

//warning{
EPUBCheck を通さない EPUB は商業流通に出さないこと。
//}

詳細は //list[main] を参照。@<fn>{note1} に補足を記す。

//footnote[note1][設計判断は ADR-0001 で記録している。]
