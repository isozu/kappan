={architecture} 第1章 アーキテクチャ

本章では @<b>{システム全体} の構成を説明する。@<kw>{Kappan} は AST 中心主義を採用している。

//image[arch][システム構成図]

主要コンポーネント：

 * @<code>{@kappan/core} — パイプライン本体
 * @<code>{@kappan/epub-packager} — ZIP/OPF/NAV 生成
 * @<code>{@kappan/cli} — コマンドラインインターフェイス
