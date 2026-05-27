import { describe, expect, it } from 'vitest';
import { lintPublishablePackage } from './plugin.js';

describe('lintPublishablePackage', () => {
  const valid = {
    name: '@me/kappan-plugin-foo',
    version: '0.1.0',
    private: false,
    exports: { '.': './src/index.ts' },
    keywords: ['kappan-plugin', 'kappan'],
  };

  it('passes a well-formed package', () => {
    expect(lintPublishablePackage(valid)).toEqual([]);
  });

  it('flags missing name and version', () => {
    const problems = lintPublishablePackage({});
    expect(problems.some((p) => p.includes('name'))).toBe(true);
    expect(problems.some((p) => p.includes('version'))).toBe(true);
  });

  it('flags private: true', () => {
    const problems = lintPublishablePackage({ ...valid, private: true });
    expect(problems.some((p) => p.includes('private'))).toBe(true);
  });

  it('flags non-semver version', () => {
    const problems = lintPublishablePackage({ ...valid, version: 'latest' });
    expect(problems.some((p) => p.includes('semver'))).toBe(true);
  });

  it('flags missing exports and main', () => {
    const { exports: _omit, ...withoutExports } = valid;
    void _omit;
    const problems = lintPublishablePackage(withoutExports);
    expect(problems.some((p) => p.includes('exports') || p.includes('main'))).toBe(true);
  });

  it('flags missing kappan-plugin keyword', () => {
    const problems = lintPublishablePackage({ ...valid, keywords: ['kappan'] });
    expect(problems.some((p) => p.includes('kappan-plugin'))).toBe(true);
  });
});
