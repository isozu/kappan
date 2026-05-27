import { describe, expect, it } from 'vitest';
import {
  checkChapterAccessibility,
  inferAccessibilityFeatures,
  inferAccessModes,
  __internal,
} from './accessibility.js';

describe('checkChapterAccessibility', () => {
  it('returns no errors/warnings for valid XHTML with alt and proper heading order', () => {
    const xhtml = `
      <main>
        <h1>Title</h1>
        <p>Body</p>
        <img src="ok.png" alt="A photograph"/>
        <h2>Section</h2>
      </main>
    `;
    const diags = checkChapterAccessibility({ chapterRelativePath: 'ch.md', xhtml });
    const blocking = diags.filter((d) => d.severity === 'error' || d.severity === 'warning');
    expect(blocking).toEqual([]);
  });

  it('flags image without alt attribute as error', () => {
    const xhtml = `<img src="missing.png"/>`;
    const diags = checkChapterAccessibility({ chapterRelativePath: 'ch.md', xhtml });
    const errs = diags.filter((d) => d.severity === 'error');
    expect(errs).toHaveLength(1);
    expect(errs[0]?.message).toContain('missing alt');
  });

  it('flags empty alt as error', () => {
    const xhtml = `<img src="empty.png" alt=""/>`;
    const diags = checkChapterAccessibility({ chapterRelativePath: 'ch.md', xhtml });
    const errs = diags.filter((d) => d.severity === 'error');
    expect(errs).toHaveLength(1);
    expect(errs[0]?.message).toContain('empty');
  });

  it('allows empty alt when role="presentation"', () => {
    const xhtml = `<img src="decoration.png" alt="" role="presentation"/>`;
    const diags = checkChapterAccessibility({ chapterRelativePath: 'ch.md', xhtml });
    const errs = diags.filter((d) => d.severity === 'error');
    expect(errs).toEqual([]);
  });

  it('warns on heading hierarchy skip (h1 → h3)', () => {
    const xhtml = `<main><h1>A</h1><h3>B</h3></main>`;
    const diags = checkChapterAccessibility({ chapterRelativePath: 'ch.md', xhtml });
    expect(diags.some((d) => d.message.includes('h1 → h3'))).toBe(true);
  });

  it('does not warn on h1 → h2 → h1 transitions (going back is OK)', () => {
    const xhtml = `<main><h1>A</h1><h2>B</h2><h1>C</h1></main>`;
    const diags = checkChapterAccessibility({ chapterRelativePath: 'ch.md', xhtml });
    const blocking = diags.filter((d) => d.severity === 'error' || d.severity === 'warning');
    expect(blocking).toEqual([]);
  });
});

describe('checkChapterAccessibility — M2-C epub:type location', () => {
  it('passes when epub:type=noteref is on <a>', () => {
    const xhtml = `<main><h1>T</h1><a epub:type="noteref" href="#fn-1">[1]</a></main>`;
    const diags = checkChapterAccessibility({ chapterRelativePath: 'ch.md', xhtml });
    expect(diags.some((d) => d.message.includes('noteref'))).toBe(false);
  });

  it('warns when epub:type=noteref is on a wrong tag (<span>)', () => {
    const xhtml = `<main><h1>T</h1><span epub:type="noteref">[1]</span></main>`;
    const diags = checkChapterAccessibility({ chapterRelativePath: 'ch.md', xhtml });
    expect(
      diags.some((d) => d.severity === 'warning' && d.message.includes('epub:type="noteref"')),
    ).toBe(true);
  });

  it('passes when epub:type=footnotes is on <aside>', () => {
    const xhtml = `<main><h1>T</h1><aside epub:type="footnotes"><ol/></aside></main>`;
    const diags = checkChapterAccessibility({ chapterRelativePath: 'ch.md', xhtml });
    expect(diags.some((d) => d.message.includes('epub:type="footnotes"'))).toBe(false);
  });

  it('emits info diagnostic for unknown epub:type value', () => {
    const xhtml = `<main><h1>T</h1><section epub:type="not-a-real-value"/></main>`;
    const diags = checkChapterAccessibility({ chapterRelativePath: 'ch.md', xhtml });
    expect(
      diags.some((d) => d.severity === 'info' && d.message.includes('Unknown epub:type')),
    ).toBe(true);
  });
});

describe('checkChapterAccessibility — M2-C ARIA landmark hints', () => {
  it('suggests <main> when chapter has h1 but no main', () => {
    const xhtml = `<h1>Title</h1><p>body</p>`;
    const diags = checkChapterAccessibility({ chapterRelativePath: 'ch.md', xhtml });
    expect(diags.some((d) => d.severity === 'hint' && d.message.includes('main'))).toBe(true);
  });

  it('does not suggest <main> when role="main" is present', () => {
    const xhtml = `<div role="main"><h1>Title</h1></div>`;
    const diags = checkChapterAccessibility({ chapterRelativePath: 'ch.md', xhtml });
    expect(diags.some((d) => d.message.includes('main landmark'))).toBe(false);
  });

  it('does not suggest <main> for nav.xhtml (isNav=true)', () => {
    const xhtml = `<h1>目次</h1>`;
    const diags = checkChapterAccessibility({
      chapterRelativePath: 'nav.xhtml',
      xhtml,
      isNav: true,
    });
    expect(diags.some((d) => d.message.includes('main landmark'))).toBe(false);
  });
});

describe('checkChapterAccessibility — M2-C contrast checking', () => {
  it('warns when contrast ratio is below WCAG 2.1 AA on body color/background', () => {
    // 似た色合いの組み合わせ：lightgrey on white
    const stylesheet = `
      :root {
        --kappan-text: #cccccc;
        --kappan-bg: #ffffff;
      }
      body { color: var(--kappan-text); background: var(--kappan-bg); }
    `;
    const xhtml = `<main><h1>T</h1><p>x</p></main>`;
    const diags = checkChapterAccessibility({ chapterRelativePath: 'ch.md', xhtml, stylesheet });
    expect(diags.some((d) => d.message.includes('contrast'))).toBe(true);
  });

  it('does not warn when body has strong contrast (black on white)', () => {
    const stylesheet = `body { color: #000; background: #fff; }`;
    const xhtml = `<main><h1>T</h1><p>x</p></main>`;
    const diags = checkChapterAccessibility({ chapterRelativePath: 'ch.md', xhtml, stylesheet });
    expect(diags.some((d) => d.message.includes('contrast'))).toBe(false);
  });

  it('does nothing when stylesheet is not provided', () => {
    const xhtml = `<main><h1>T</h1></main>`;
    const diags = checkChapterAccessibility({ chapterRelativePath: 'ch.md', xhtml });
    expect(diags.some((d) => d.message.includes('contrast'))).toBe(false);
  });
});

describe('color helpers (M2-C internal)', () => {
  const empty = new Map<string, string>();

  it('parses #RRGGBB hex', () => {
    expect(__internal.parseColor('#ff8000', empty)).toEqual({ r: 255, g: 128, b: 0 });
  });

  it('parses #RGB shorthand hex', () => {
    expect(__internal.parseColor('#f80', empty)).toEqual({ r: 255, g: 136, b: 0 });
  });

  it('parses rgb(...)', () => {
    expect(__internal.parseColor('rgb(10, 20, 30)', empty)).toEqual({ r: 10, g: 20, b: 30 });
  });

  it('resolves var(--foo) through the variable map', () => {
    const vars = new Map<string, string>([['--accent', '#112233']]);
    expect(__internal.parseColor('var(--accent)', vars)).toEqual({ r: 17, g: 34, b: 51 });
  });

  it('contrastRatio black on white = 21:1', () => {
    const black = { r: 0, g: 0, b: 0 };
    const white = { r: 255, g: 255, b: 255 };
    const r = __internal.contrastRatio(black, white);
    expect(r).not.toBeNull();
    expect(r!).toBeCloseTo(21, 0);
  });

  it('contrastRatio white on white = 1:1', () => {
    const white = { r: 255, g: 255, b: 255 };
    expect(__internal.contrastRatio(white, white)).toBeCloseTo(1, 5);
  });

  it('extractCssVariables collects --foo: value pairs from :root', () => {
    const map = __internal.extractCssVariables(`
      :root {
        --a: #fff;
        --b: rgb(1, 2, 3);
      }
    `);
    expect(map.get('--a')).toBe('#fff');
    expect(map.get('--b')).toBe('rgb(1, 2, 3)');
  });
});

describe('inferAccessibilityFeatures', () => {
  it('always includes tableOfContents and structuralNavigation', () => {
    const features = inferAccessibilityFeatures(['<p>plain</p>']);
    expect(features).toContain('tableOfContents');
    expect(features).toContain('structuralNavigation');
  });

  it('adds alternativeText when images with alt exist', () => {
    const features = inferAccessibilityFeatures(['<img src="x.png" alt="x"/>']);
    expect(features).toContain('alternativeText');
  });

  it('does not add alternativeText when an image lacks alt', () => {
    const features = inferAccessibilityFeatures(['<img src="x.png"/>']);
    expect(features).not.toContain('alternativeText');
  });

  it('adds MathML when math element is present', () => {
    const features = inferAccessibilityFeatures(['<math><mi>x</mi></math>']);
    expect(features).toContain('MathML');
  });
});

describe('inferAccessModes', () => {
  it('always includes textual', () => {
    expect(inferAccessModes(['<p>x</p>'])).toContain('textual');
  });

  it('adds visual when images are present', () => {
    expect(inferAccessModes(['<img src="x.png" alt="x"/>'])).toContain('visual');
  });

  it('adds visual when svg is present', () => {
    expect(inferAccessModes(['<svg/>'])).toContain('visual');
  });
});
