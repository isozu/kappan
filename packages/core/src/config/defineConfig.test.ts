import { describe, expect, it } from 'vitest';
import { defineConfig } from './defineConfig.js';

const stubTheme = {
  name: '@kappan/themes-stub',
  version: '0.0.0',
  getAssets: async () => new Map<string, Uint8Array>(),
};

describe('defineConfig', () => {
  it('fills defaults for output and language', () => {
    const config = defineConfig({
      metadata: {
        title: 'テスト書籍',
        creator: [{ name: '山田 太郎' }],
      },
      source: { entry: 'src/index.md' },
      theme: stubTheme,
    });

    expect(config.metadata.language).toBe('ja');
    expect(config.metadata.creator[0]?.role).toBe('aut');
    expect(config.output.dir).toBe('dist/');
    expect(config.output.filename).toBe('{title}.epub');
    expect(config.source.baseDir).toBe('src/');
  });

  it('preserves explicitly provided values', () => {
    const config = defineConfig({
      metadata: {
        title: 'Tech Book',
        creator: [{ name: 'Author', fileAs: 'Author' }],
        language: 'en',
        identifier: 'urn:uuid:00000000-0000-0000-0000-000000000000',
      },
      source: { entry: 'chapters/01.md', baseDir: 'chapters/' },
      output: { dir: 'build/', filename: 'tech-book.epub' },
      theme: stubTheme,
    });

    expect(config.metadata.language).toBe('en');
    expect(config.metadata.identifier).toBe('urn:uuid:00000000-0000-0000-0000-000000000000');
    expect(config.output.dir).toBe('build/');
    expect(config.source.baseDir).toBe('chapters/');
  });

  it('throws when metadata.title is missing', () => {
    expect(() =>
      defineConfig({
        // @ts-expect-error: title is required
        metadata: {
          creator: [{ name: 'Author' }],
        },
        source: { entry: 'src/index.md' },
        theme: stubTheme,
      }),
    ).toThrow();
  });

  it('throws when identifier is not a urn:uuid form', () => {
    expect(() =>
      defineConfig({
        metadata: {
          title: 'X',
          creator: [{ name: 'A' }],
          identifier: 'invalid-uuid',
        },
        source: { entry: 'src/index.md' },
        theme: stubTheme,
      }),
    ).toThrow(/urn:uuid/);
  });

  it('throws when creator is empty', () => {
    expect(() =>
      defineConfig({
        metadata: {
          title: 'X',
          creator: [],
        },
        source: { entry: 'src/index.md' },
        theme: stubTheme,
      }),
    ).toThrow();
  });
});
