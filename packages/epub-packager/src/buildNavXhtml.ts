import { create } from 'xmlbuilder2';

export interface NavEntry {
  /** EPUB 内の相対パス（nav.xhtml からの相対）。例: "content/ch01.xhtml" */
  readonly href: string;
  readonly title: string;
}

/**
 * `EPUB/nav.xhtml` を EPUB 3.3 形式で生成する。
 *
 * 含まれるナビゲーション:
 * - toc: 目次（必須）
 * - landmarks: ランドマーク（任意だが、bodymatter 開始点を示すために含める）
 *
 * EPUB のナビゲーションドキュメント（必須）。
 */
export function buildNavXhtml(entries: readonly NavEntry[], language = 'ja'): string {
  const html = create({ version: '1.0', encoding: 'UTF-8' }).ele('html', {
    xmlns: 'http://www.w3.org/1999/xhtml',
    'xmlns:epub': 'http://www.idpf.org/2007/ops',
    'xml:lang': language,
    lang: language,
  });

  const head = html.ele('head');
  head.ele('meta', { charset: 'utf-8' });
  head.ele('title').txt('目次');

  const body = html.ele('body');

  // Table of contents
  const tocNav = body.ele('nav', { 'epub:type': 'toc', id: 'toc' });
  tocNav.ele('h1').txt('目次');
  const tocList = tocNav.ele('ol');
  for (const entry of entries) {
    tocList.ele('li').ele('a', { href: entry.href }).txt(entry.title);
  }

  // Landmarks
  if (entries.length > 0) {
    const landmarksNav = body.ele('nav', { 'epub:type': 'landmarks', hidden: '' });
    landmarksNav.ele('h2').txt('Landmarks');
    const landmarksList = landmarksNav.ele('ol');
    const first = entries[0]!;
    landmarksList
      .ele('li')
      .ele('a', { 'epub:type': 'bodymatter', href: first.href })
      .txt('本文の開始');
  }

  return html.end({ prettyPrint: true });
}
