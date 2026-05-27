import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { definePlugin } from './definePlugin.js';
import { BuildError } from '../build/errors.js';

describe('definePlugin', () => {
  it('returns a factory that produces a PluginDefinition', () => {
    const myPlugin = definePlugin<{ flag?: boolean }>({
      name: '@test/plugin',
      version: '1.0.0',
      kind: 'transform',
      hooks: () => ({}),
    });
    const def = myPlugin({ flag: true });
    expect(def.name).toBe('@test/plugin');
    expect(def.version).toBe('1.0.0');
    expect(def.kind).toBe('transform');
    expect(def.hooks).toEqual({});
  });

  it('allows omitting options when schema is not specified', () => {
    const myPlugin = definePlugin({
      name: '@test/no-options',
      version: '1.0.0',
      kind: 'syntax',
      hooks: () => ({}),
    });
    const def = myPlugin();
    expect(def.name).toBe('@test/no-options');
  });

  it('parses options with zod schema and passes parsed value to hooks', () => {
    let receivedOptions: unknown;
    type Opts = { verbose: boolean; level: number };
    // zod の default() は input optional / output required の input-output 不一致を生むため、
    // 実用パターンとして `as z.ZodType<Opts>` で output 型に合わせる（plugin-review-compat と同様）。
    const schema = z.object({
      verbose: z.boolean().default(false),
      level: z.number().min(0).max(10).default(5),
    }) as unknown as z.ZodType<Opts>;
    const myPlugin = definePlugin<Opts>({
      name: '@test/zod-plugin',
      version: '1.0.0',
      kind: 'transform',
      schema,
      hooks: (options) => {
        receivedOptions = options;
        return {};
      },
    });
    myPlugin({ verbose: true, level: 3 });
    expect(receivedOptions).toEqual({ verbose: true, level: 3 });
  });

  it('applies zod defaults when options object is empty', () => {
    let receivedOptions: unknown;
    type Opts = { verbose: boolean; level: number };
    const schema = z.object({
      verbose: z.boolean().default(false),
      level: z.number().min(0).max(10).default(5),
    }) as unknown as z.ZodType<Opts>;
    const myPlugin = definePlugin<Opts>({
      name: '@test/zod-defaults',
      version: '1.0.0',
      kind: 'transform',
      schema,
      hooks: (options) => {
        receivedOptions = options;
        return {};
      },
    });
    // 内側フィールドのデフォルト適用
    myPlugin({} as Opts);
    expect(receivedOptions).toEqual({ verbose: false, level: 5 });
  });

  it('applies top-level default when options is undefined', () => {
    let receivedOptions: unknown;
    type Opts = { verbose: boolean };
    const schema = z
      .object({
        verbose: z.boolean().default(false),
      })
      .default({}) as unknown as z.ZodType<Opts>;
    const myPlugin = definePlugin<Opts>({
      name: '@test/zod-top-default',
      version: '1.0.0',
      kind: 'transform',
      schema,
      hooks: (options) => {
        receivedOptions = options;
        return {};
      },
    });
    myPlugin();
    expect(receivedOptions).toEqual({ verbose: false });
  });

  it('throws BuildError when zod validation fails', () => {
    const myPlugin = definePlugin<{ level: number }>({
      name: '@test/zod-fails',
      version: '1.0.0',
      kind: 'transform',
      schema: z.object({
        level: z.number().min(0).max(10),
      }),
      hooks: () => ({}),
    });
    expect(() => myPlugin({ level: 999 })).toThrow(BuildError);
    try {
      myPlugin({ level: -1 });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(BuildError);
      const buildErr = err as BuildError;
      expect(buildErr.message).toContain('@test/zod-fails');
      expect(buildErr.diagnostics).toHaveLength(1);
      expect(buildErr.diagnostics[0]?.source).toBe('@test/zod-fails');
      expect(buildErr.diagnostics[0]?.severity).toBe('error');
    }
  });

  it('reports all zod issues in BuildError diagnostics', () => {
    const myPlugin = definePlugin<{ a: string; b: number }>({
      name: '@test/multi-issue',
      version: '1.0.0',
      kind: 'transform',
      schema: z.object({
        a: z.string().min(3),
        b: z.number().positive(),
      }),
      hooks: () => ({}),
    });
    try {
      myPlugin({ a: 'x', b: -1 });
      expect.unreachable();
    } catch (err) {
      const buildErr = err as BuildError;
      expect(buildErr.diagnostics.length).toBeGreaterThanOrEqual(2);
    }
  });
});
