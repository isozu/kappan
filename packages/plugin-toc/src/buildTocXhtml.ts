import type { ChapterRecord, SectionRecord } from '@kappan/core';

export interface BuildTocXhtmlOptions {
  readonly title: string;
  readonly language: string;
  readonly depth: 1 | 2 | 3;
  /** front-matter / back-matter（kind !== 'chapter'）を含めるか */
  readonly includeNonChapter: boolean;
  /** 目次から特定 id を除外したいとき */
  readonly excludeIds?: ReadonlySet<string>;
  /** TOC ドキュメント自身の id（自己参照を除外するため使う） */
  readonly selfId: string;
}

/**
 * `ChapterRegistry` を読み出して読者向け目次 XHTML を組み立てる。
 *
 * 構造：
 *   - `<nav epub:type="toc" role="doc-toc">` でラップ（リーダーがランドマークとして認識）
 *   - `<ol class="toc-list">` 直下に章（`<li class="toc-chapter">`）を並べ、
 *     必要なら h2/h3 を `<ol class="toc-list toc-sections">` でネストする
 *   - 章のリンク先は `content/<id>.xhtml`、節は `#anchorId` を後置
 *
 * 採番タイトル（`numberedTitle`）を使うので「第N章 タイトル」表示になる。
 * 章番号が未確定（未採番章 / opt-out）でも `rawTitle` ベースで表示できる。
 */
export function buildTocXhtml(
  records: readonly ChapterRecord[],
  options: BuildTocXhtmlOptions,
): string {
  const exclude = options.excludeIds ?? new Set<string>();
  const items: string[] = [];
  for (const r of records) {
    if (r.id === options.selfId) continue;
    if (exclude.has(r.id)) continue;
    if (!options.includeNonChapter && r.kind !== 'chapter') continue;
    items.push(renderChapter(r, options));
  }

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeAttr(options.language)}" lang="${escapeAttr(options.language)}">\n` +
    `  <head>\n` +
    `    <meta charset="utf-8"></meta>\n` +
    `    <title>${escapeText(options.title)}</title>\n` +
    `    <link rel="stylesheet" type="text/css" href="../styles/theme.css"></link>\n` +
    `  </head>\n` +
    `  <body>\n` +
    `    <nav epub:type="toc" role="doc-toc" class="toc-page">\n` +
    `      <h1 class="toc-title">${escapeText(options.title)}</h1>\n` +
    `      <ol class="toc-list">\n` +
    `${items.join('\n')}\n` +
    `      </ol>\n` +
    `    </nav>\n` +
    `  </body>\n` +
    `</html>\n`
  );
}

function renderChapter(record: ChapterRecord, options: BuildTocXhtmlOptions): string {
  const indent = '        ';
  const href = `${record.id}.xhtml`;
  const label = record.numberedTitle || record.rawTitle || record.id;
  const parts: string[] = [];
  parts.push(`${indent}<li class="toc-chapter">`);
  parts.push(`${indent}  <a href="${escapeAttr(href)}">${escapeText(label)}</a>`);

  if (options.depth >= 2) {
    const sections = collectSectionsForDepth(record.sections, options.depth);
    if (sections.length > 0) {
      parts.push(`${indent}  <ol class="toc-list toc-sections">`);
      for (const s of sections) {
        parts.push(renderSection(s, record.id, indent + '    '));
      }
      parts.push(`${indent}  </ol>`);
    }
  }

  // コラム（plugin-column）は深さ設定に関わらず目次に出す（独立した読み物のため）。
  const columns = record.columns ?? [];
  if (columns.length > 0) {
    parts.push(`${indent}  <ol class="toc-list toc-columns">`);
    for (const c of columns) {
      const href = `${record.id}.xhtml#${c.anchorId}`;
      parts.push(
        `${indent}    <li class="toc-column"><a href="${escapeAttr(href)}">${escapeText(c.title)}</a></li>`,
      );
    }
    parts.push(`${indent}  </ol>`);
  }

  parts.push(`${indent}</li>`);
  return parts.join('\n');
}

function collectSectionsForDepth(
  sections: readonly SectionRecord[],
  depth: 1 | 2 | 3,
): readonly SectionRecord[] {
  if (depth === 1) return [];
  const maxLevel = depth === 2 ? 2 : 3;
  return sections.filter((s) => s.level <= maxLevel);
}

function renderSection(section: SectionRecord, chapterId: string, indent: string): string {
  const href = `${chapterId}.xhtml#${section.anchorId}`;
  const label = section.numberedTitle || section.title;
  const cls = `toc-section toc-section-h${section.level}`;
  return `${indent}<li class="${escapeAttr(cls)}"><a href="${escapeAttr(href)}">${escapeText(label)}</a></li>`;
}

function escapeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, '&quot;');
}
