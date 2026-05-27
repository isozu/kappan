import { describe, it, expect } from 'vitest';
import { saiun } from './index.js';

/**
 * Saiun テーマのオプション検証テスト（M1-D）。
 *
 * defineTheme を経由するため、戻り値の構造と override CSS の挿入を確認する。
 */
describe('saiun() — M1-D options', () => {
  it('returns a ThemeLike with name and version', () => {
    const t = saiun();
    expect(t.name).toBe('@kappan/themes-saiun');
    expect(t.version).toBe('0.3.0');
    expect(typeof t.getAssets).toBe('function');
  });

  it('accept accent and emits CSS custom property override', async () => {
    const t = saiun({ accent: '#ff0000' });
    const assets = await t.getAssets();
    const css = new TextDecoder().decode(assets.get('styles/theme.css')!);
    expect(css).toMatch(/--saiun-accent:\s*#ff0000/);
  });

  it('accept fontStack.{mincho,sans,mono} and emits font-family overrides', async () => {
    const t = saiun({
      fontStack: {
        mincho: ['MyMincho', 'Noto Serif JP'],
        sans: ['MySans'],
        mono: ['MyMono'],
      },
    });
    const assets = await t.getAssets();
    const css = new TextDecoder().decode(assets.get('styles/theme.css')!);
    expect(css).toMatch(/font-family: 'MyMincho', 'Noto Serif JP', serif;/);
    expect(css).toMatch(/font-family: 'MySans', sans-serif;/);
    expect(css).toMatch(/font-family: 'MyMono', monospace;/);
  });

  it('accept codeTheme and exposes --saiun-code-theme', async () => {
    const t = saiun({ codeTheme: 'github-dark' });
    const assets = await t.getAssets();
    const css = new TextDecoder().decode(assets.get('styles/theme.css')!);
    expect(css).toMatch(/--saiun-code-theme:\s*github-dark/);
  });

  it('accept additionalCss as a free-form append', async () => {
    const t = saiun({ additionalCss: '.foo { color: red; }' });
    const assets = await t.getAssets();
    const css = new TextDecoder().decode(assets.get('styles/theme.css')!);
    expect(css).toContain('.foo { color: red; }');
  });

  it('rejects invalid accent (zod)', () => {
    expect(() => saiun({ accent: 'not-a-color' as string })).toThrow();
  });

  it('rejects empty fontStack arrays (zod)', () => {
    expect(() => saiun({ fontStack: { mincho: [] } } as never)).toThrow();
  });

  it('default getAssets exposes reset.css and theme.css', async () => {
    const t = saiun();
    const assets = await t.getAssets();
    expect(assets.has('styles/reset.css')).toBe(true);
    expect(assets.has('styles/theme.css')).toBe(true);
  });
});
