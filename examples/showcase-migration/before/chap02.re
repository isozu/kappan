={block} 第2章 ブロック記法

コードブロックは @<code>{//list} で書く。キャプションと言語を指定できる。

//list[greet][挨拶を返す関数][typescript]{
function greet(name: string): string {
  return `こんにちは、${name}さん`;
}
//}

図は @<code>{//image} で挿入する。画像は images/ に置く。

//image[diagram][移行のイメージ図]

注釈ブロックは @<code>{//note} で書ける。

//note{
Re:VIEW の //note は Kappan では GFM の注釈（> [!NOTE]）に変換される。
//}

引用は @<code>{//quote} を使う。

//quote{
道具を変えても、書いた内容は失われない。
//}
