import { describe, expect, it } from 'vitest';
import { listThemes } from './themes.js';

describe('listThemes', () => {
  it('lists all 5 official themes', () => {
    const names = listThemes().map((t) => t.name);
    expect(names).toEqual(['mono', 'saiun', 'sumi', 'kohaku', 'hibana']);
  });

  it('mono and saiun are available, the rest are planned (M2-A)', () => {
    const byName = new Map(listThemes().map((t) => [t.name, t]));
    expect(byName.get('mono')?.status).toBe('available');
    expect(byName.get('saiun')?.status).toBe('available');
    expect(byName.get('sumi')?.status).toBe('planned');
    expect(byName.get('kohaku')?.status).toBe('planned');
    expect(byName.get('hibana')?.status).toBe('planned');
  });

  it('available themes expose an import specifier and factory name', () => {
    const saiun = listThemes().find((t) => t.name === 'saiun')!;
    expect(saiun.importSpecifier).toBe('@kappan/themes-saiun');
    expect(saiun.factoryName).toBe('saiun');
  });

  it('planned themes have no import specifier', () => {
    const sumi = listThemes().find((t) => t.name === 'sumi')!;
    expect(sumi.importSpecifier).toBeUndefined();
  });
});
