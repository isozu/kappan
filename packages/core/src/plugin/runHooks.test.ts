import { describe, expect, it } from 'vitest';
import { definePlugin } from './definePlugin.js';
import { runOnPackage, runOnValidate } from './runHooks.js';
import { createPluginContext } from './context.js';
import type { Diagnostic } from '../types.js';
import type { PluginEpubPackage } from './types.js';

function makeCtx() {
  const diagnostics: Diagnostic[] = [];
  const config = {
    metadata: { title: 't', creator: [{ name: 'a', role: 'aut' }], language: 'ja' },
    source: { entry: 'index.md', baseDir: 'src/' },
    output: { dir: 'dist/', filename: '{title}.epub' },
    theme: {
      name: 't',
      version: '0',
      async getAssets() {
        return new Map();
      },
    },
    plugins: [],
    unsafeHtml: false as const,
    writingMode: 'horizontal-tb' as const,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = createPluginContext({ config: config as any, diagnostics });
  return { ctx, diagnostics };
}

function makePkg(): PluginEpubPackage {
  return {
    resources: new Map([['content/ch01.xhtml', '<html></html>']]),
    metadata: { title: 'Test', identifier: 'urn:uuid:abc', language: 'ja' },
  };
}

describe('runOnPackage', () => {
  it('calls onPackage on each plugin with PluginEpubPackage', async () => {
    const calls: { name: string; resourceCount: number }[] = [];
    const plugin = definePlugin({
      name: '@test/observer',
      version: '1.0.0',
      kind: 'packager',
      hooks: () => ({
        onPackage(pkg) {
          calls.push({ name: '@test/observer', resourceCount: pkg.resources.size });
        },
      }),
    })();
    const { ctx } = makeCtx();
    await runOnPackage([plugin], ctx, makePkg());
    expect(calls).toEqual([{ name: '@test/observer', resourceCount: 1 }]);
  });

  it('passes through plugins without onPackage hook', async () => {
    const noOp = definePlugin({
      name: '@test/no-op',
      version: '1.0.0',
      kind: 'transform',
      hooks: () => ({}),
    })();
    const { ctx } = makeCtx();
    await expect(runOnPackage([noOp], ctx, makePkg())).resolves.toBeUndefined();
  });
});

describe('runOnValidate', () => {
  it('collects diagnostics from all onValidate hooks', async () => {
    const plugin1 = definePlugin({
      name: '@test/v1',
      version: '1.0.0',
      kind: 'validator',
      hooks: () => ({
        onValidate(_pkg) {
          return [{ severity: 'warning' as const, source: '@test/v1', message: 'm1' }];
        },
      }),
    })();
    const plugin2 = definePlugin({
      name: '@test/v2',
      version: '1.0.0',
      kind: 'validator',
      hooks: () => ({
        onValidate(_pkg) {
          return [
            { severity: 'error' as const, source: '@test/v2', message: 'm2a' },
            { severity: 'info' as const, source: '@test/v2', message: 'm2b' },
          ];
        },
      }),
    })();
    const { ctx } = makeCtx();
    const diagnostics = await runOnValidate([plugin1, plugin2], ctx, makePkg());
    expect(diagnostics).toHaveLength(3);
    expect(diagnostics[0]?.source).toBe('@test/v1');
    expect(diagnostics[1]?.source).toBe('@test/v2');
    expect(diagnostics[2]?.source).toBe('@test/v2');
  });

  it('returns empty array when no plugins have onValidate', async () => {
    const plugin = definePlugin({
      name: '@test/no-validate',
      version: '1.0.0',
      kind: 'transform',
      hooks: () => ({}),
    })();
    const { ctx } = makeCtx();
    const diagnostics = await runOnValidate([plugin], ctx, makePkg());
    expect(diagnostics).toEqual([]);
  });

  it('passes real EpubPackage view (not dummy empty Map)', async () => {
    let observedResources = 0;
    let observedTitle = '';
    const plugin = definePlugin({
      name: '@test/inspect',
      version: '1.0.0',
      kind: 'validator',
      hooks: () => ({
        onValidate(pkg) {
          observedResources = pkg.resources.size;
          observedTitle = pkg.metadata.title;
          return [];
        },
      }),
    })();
    const { ctx } = makeCtx();
    await runOnValidate([plugin], ctx, makePkg());
    expect(observedResources).toBe(1);
    expect(observedTitle).toBe('Test');
  });
});
