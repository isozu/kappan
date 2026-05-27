---
title: 第2章 ブロック記法
id: ch02
next: 03-mixed.md
---

={blocks} ブロック記法

==={code-blocks} コードブロック

Re:VIEW の @<code>{//list} 記法はキャプションと言語指定を持つコードブロックである。

//list[hello][Hello, World の例][typescript]{
function greet(name: string): string {
  return `Hello, ${name}!`;
}

console.log(greet('Kappan'));
//}

@<code>{//emlist} は ID なしで使える簡易版である。

//emlist[簡易リスト][javascript]{
const x = 1;
const y = 2;
console.log(x + y);
//}

==={admonitions} 注釈ブロック

Re:VIEW の各種注釈ブロックは GFM の admonition 記法に変換される。

//note{
これは @<code>{//note} ブロックである。一般的な補足情報を提供する。
//}

//tip[ヒント]{
@<code>{//tip} ブロックはタイトルを付けられる。便利な小技を伝えるのに使う。
//}

//warning{
@<code>{//warning} は注意事項。重要な制約や落とし穴を読者に伝える。
//}

//caution{
@<code>{//caution} は警告。データ損失等の不可逆な操作の前に使う。
//}

==={quote-block} 引用

//quote{
インライン記法とブロック記法を併用することで、Re:VIEW 原稿の大部分をそのまま再利用できる。
//}

==={cmd-block} コマンド例

@<code>{//cmd} ブロックはシェルコマンド例として表示される。

//cmd{
pnpm install
pnpm kappan build --config kappan.config.ts
//}
