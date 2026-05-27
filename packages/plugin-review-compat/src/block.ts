/**
 * Re:VIEW ブロック記法 → Markdown 変換。
 *
 * Re:VIEW のブロック記法は次の形式を取る：
 *   //tag[arg1][arg2]{
 *   content
 *   //}
 *
 * ブロック単独行（末尾に `{` がない）の例：
 *   //footnote[id][text]
 *
 * よく使う約 15 種を対応する。
 */

export interface TransformBlockOptions {
  /**
   * `//raw` ブロックを素通しするか（`reviewCompat({ allowRaw: true })`）。
   * デフォルト false。
   */
  readonly allowRaw?: boolean;
}

/**
 * ブロック記法の一括変換。行単位で走査し、`//tag[...]{` で始まるブロックを検出する。
 */
export function transformBlocks(source: string, options: TransformBlockOptions = {}): string {
  const lines = source.split(/\r?\n/);
  const out: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';

    // //tag[...][...]{  形式のブロック開始
    const blockStart = line.match(/^\/\/([a-z]+)((?:\[(?:[^\]\\]|\\.)*\])*)\{?\s*$/);
    if (blockStart) {
      const tag = blockStart[1]!;
      const argsRaw = blockStart[2] ?? '';
      const hasBody = line.endsWith('{');
      const args = parseArgs(argsRaw);

      if (!hasBody) {
        // ボディなしブロック（//footnote[id][text]、//indepimage[id][caption][file]）
        const converted = convertBodylessBlock(tag, args);
        if (converted !== null) {
          out.push(converted);
          i += 1;
          continue;
        }
      } else {
        // ボディあり：`//}` までを収集
        const bodyLines: string[] = [];
        i += 1;
        while (i < lines.length) {
          const bodyLine = lines[i] ?? '';
          if (bodyLine.trim() === '//}') break;
          bodyLines.push(bodyLine);
          i += 1;
        }
        i += 1; // `//}` をスキップ

        const converted = convertBlock(tag, args, bodyLines, options);
        if (converted !== null) {
          out.push(converted);
          continue;
        }
      }
      // 認識できないブロックは警告コメントで残す
      out.push(`<!-- REVIEW-UNSUPPORTED-BLOCK: ${tag} -->`);
      out.push(line);
      i += 1;
      continue;
    }

    // 見出し: ={id} タイトル / =={id} タイトル / ===={id} ...
    const headingMatch = line.match(/^(={1,6})(?:\{([^}]+)\})?\s*(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1]!.length;
      const rawId = headingMatch[2];
      const title = headingMatch[3]!;
      const hashes = '#'.repeat(level);
      // XML name 規則：id 属性にコロン等の予約文字は使えないため sanitize する
      const id = rawId ? sanitizeXmlId(rawId) : undefined;
      out.push(id ? `${hashes} ${title} {#${id}}` : `${hashes} ${title}`);
      i += 1;
      continue;
    }

    out.push(line);
    i += 1;
  }

  return out.join('\n');
}

function parseArgs(argsRaw: string): string[] {
  const re = /\[((?:[^\]\\]|\\.)*)\]/g;
  const args: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(argsRaw)) !== null) {
    args.push(m[1]!.replace(/\\([\]\\])/g, '$1'));
  }
  return args;
}

/**
 * ボディなし1行ブロックの変換。
 */
function convertBodylessBlock(tag: string, args: readonly string[]): string | null {
  switch (tag) {
    case 'footnote': {
      const id = args[0] ?? '';
      const text = args[1] ?? '';
      return `[^${id}]: ${text}`;
    }
    case 'indepimage':
    case 'numberlessimage': {
      const id = args[0] ?? '';
      const caption = args[1] ?? '';
      // 画像ファイルパスは Re:VIEW では暗黙的に images/<id>.* で解決される
      return `![${caption}](images/${id}.png)`;
    }
    case 'image': {
      const id = args[0] ?? '';
      const caption = args[1] ?? '';
      return `![${caption}](images/${id}.png)`;
    }
    case 'hr':
      return '---';
    case 'lead':
      return ''; // 現状は削除
    default:
      return null;
  }
}

/**
 * ボディありブロックの変換。
 */
function convertBlock(
  tag: string,
  args: readonly string[],
  body: readonly string[],
  options: TransformBlockOptions = {},
): string | null {
  switch (tag) {
    case 'list':
    case 'listnum':
    case 'emlist':
    case 'emlistnum': {
      // //list[id][caption]{ ... //} / //emlist[caption][lang]{ ... //}
      const isEm = tag.startsWith('em');
      const caption = isEm ? (args[0] ?? '') : (args[1] ?? '');
      const lang = isEm ? (args[1] ?? '') : (args[2] ?? '');
      const rawId = isEm ? '' : (args[0] ?? '');
      const id = rawId ? sanitizeXmlId(rawId) : '';
      const fence = '```' + lang;
      const captionLine = caption ? `**${caption}**\n` : '';
      const idAnchor = id ? `<a id="list-${id}"></a>\n` : '';
      return `${idAnchor}${captionLine}${fence}\n${body.join('\n')}\n\`\`\``;
    }
    case 'cmd':
      return '```shell\n' + body.join('\n') + '\n```';
    case 'source': {
      const caption = args[0] ?? '';
      const captionLine = caption ? `**${caption}**\n` : '';
      return `${captionLine}\`\`\`\n${body.join('\n')}\n\`\`\``;
    }
    case 'image':
    case 'indepimage':
    case 'numberlessimage': {
      // //image[id][caption]{ ... //}：ボディはオプションメタ情報（scale 等）、本実装では無視
      const id = args[0] ?? '';
      const caption = args[1] ?? '';
      return `![${caption}](images/${id}.png)`;
    }
    case 'imgtable': {
      // 画像ベースの表。EPUB では画像として埋め込む
      const id = args[0] ?? '';
      const caption = args[1] ?? '';
      return `![${caption}](images/${id}.png)`;
    }
    case 'table': {
      // //table[id][caption]{ ... //}：本文は TSV 風の表データ
      // 1 行目を見出し、`-----` 区切りで本文、それ以降がデータ
      const id = args[0] ?? '';
      const caption = args[1] ?? '';
      const md = reviewTableToMarkdown(body);
      const captionLine = caption ? `**${caption}**\n\n` : '';
      const idAnchor = id ? `<a id="table-${sanitizeXmlId(id)}"></a>\n` : '';
      return `${idAnchor}${captionLine}${md}`;
    }
    case 'quote': {
      return body.map((l) => '> ' + l).join('\n');
    }
    case 'note':
      return admonition('NOTE', args, body);
    case 'tip':
      return admonition('TIP', args, body);
    case 'warning':
      return admonition('WARNING', args, body);
    case 'caution':
      return admonition('CAUTION', args, body);
    case 'important':
      return admonition('IMPORTANT', args, body);
    case 'info':
      return admonition('NOTE', args, body); // GFM に INFO が無いので NOTE で代用
    case 'memo':
      return admonition('NOTE', args, body);
    case 'centering':
      return body.map((l) => `<p style="text-align:center">${l}</p>`).join('\n');
    case 'flushright':
      return body.map((l) => `<p style="text-align:right">${l}</p>`).join('\n');
    case 'column': {
      // コラム。タイトル付きの強調枠として注釈ブロックに似た形で出す
      const title = args[0] ?? 'コラム';
      return admonition('NOTE', [title], body);
    }
    case 'texequation': {
      // 数式ブロック。直接の整形は未対応だが、TeX ソースを `$$...$$` で残してフォールバック
      return '$$\n' + body.join('\n') + '\n$$';
    }
    case 'raw': {
      // 生 HTML。
      // - reviewCompat({ allowRaw: true }) かつ kappan.config.ts の unsafeHtml が
      //   'sanitized' または 'trusted' のとき、本文を素通しで出力する。
      // - デフォルト（allowRaw: false）では HTML コメントとして退避する。
      if (options.allowRaw === true) {
        return body.join('\n');
      }
      return '<!-- review-raw:\n' + body.join('\n') + '\n-->';
    }
    case 'comment':
      // Re:VIEW コメント。出力に残さない
      return '';
    case 'blankline':
      return '';
    case 'noindent':
      return body.join('\n');
    case 'lead':
      // リード文。装飾なしで本文として残す
      return body.join('\n');
    default:
      return null;
  }
}

/**
 * Re:VIEW の `//table` ブロック本文を GFM テーブルに変換する。
 *
 * Re:VIEW テーブル本文の例：
 *   見出し1<TAB>見出し2
 *   -----------
 *   行1セル1<TAB>行1セル2
 *   行2セル1<TAB>行2セル2
 *
 * 区切りは TAB 1 つ。`-----` 行は本文と見出しの分離指示。
 */
function reviewTableToMarkdown(body: readonly string[]): string {
  const rows: string[][] = [];
  let separatorIndex = -1;
  for (const line of body) {
    if (line.trim() === '') continue;
    if (/^-{3,}/.test(line.trim())) {
      separatorIndex = rows.length;
      continue;
    }
    rows.push(line.split('\t').map((c) => c.trim()));
  }
  if (rows.length === 0) return '';
  const colCount = Math.max(...rows.map((r) => r.length));
  // 見出し行が指定されていなければ最初の行を見出しとして扱う
  const headerCount = separatorIndex === -1 ? 1 : separatorIndex;
  const header = rows.slice(0, headerCount)[0] ?? [];
  const data = rows.slice(headerCount);

  const padded = (row: string[]): string =>
    '| ' +
    Array.from({ length: colCount }, (_, i) => (row[i] ?? '').replace(/\|/g, '\\|')).join(' | ') +
    ' |';
  const sep = '| ' + Array.from({ length: colCount }, () => '---').join(' | ') + ' |';
  return [padded(header), sep, ...data.map(padded)].join('\n');
}

function admonition(kind: string, args: readonly string[], body: readonly string[]): string {
  const title = args[0];
  const titleLine = title ? `> [!${kind}] ${title}` : `> [!${kind}]`;
  return [titleLine, ...body.map((l) => '> ' + l)].join('\n');
}

/**
 * Re:VIEW では `={section:intro}` のようにコロン入りの id が許容されるが、
 * XML name 規則ではコロンが名前空間区切りとして予約されているため id 属性に使えない。
 * 安全な文字（英数字・アンダースコア・ハイフン）に正規化する。
 */
export function sanitizeXmlId(raw: string): string {
  const normalized = raw
    .replace(/[^A-Za-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  // XML name の先頭は文字またはアンダースコア必須
  if (!/^[A-Za-z_]/.test(normalized)) {
    return `id-${normalized}`;
  }
  return normalized;
}
