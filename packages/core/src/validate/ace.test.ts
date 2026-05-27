import { describe, it, expect } from 'vitest';
import {
  runAce,
  normalizeAceReport,
  isAceStrictPass,
  AceNotInstalledError,
  AceIntegrationPendingError,
  type AceRawReport,
} from './ace.js';

/**
 * ACE 統合テスト — M1-D ガード撤廃 + M2-C strict / impact 別カウンタ。
 */
describe('runAce — gate removal', () => {
  it('does NOT throw AceIntegrationPendingError (gate is removed)', async () => {
    delete process.env['KAPPAN_ACE_EXPERIMENTAL'];
    let caught: unknown;
    try {
      await runAce('/tmp/does-not-exist.epub');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect(caught).not.toBeInstanceOf(AceIntegrationPendingError);
  });

  it('throws AceNotInstalledError when @daisy/ace-core / runner missing, otherwise invokes real ACE', async () => {
    let caught: unknown;
    try {
      await runAce('/tmp/does-not-exist.epub');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect(caught).not.toBeInstanceOf(AceIntegrationPendingError);
    const isNotInstalled = caught instanceof AceNotInstalledError;
    const isAceRuntimeReject =
      typeof caught === 'string' ||
      (caught instanceof Error && !(caught instanceof AceIntegrationPendingError));
    expect(isNotInstalled || isAceRuntimeReject).toBe(true);
  });

  it('AceIntegrationPendingError is still exported but deprecated', () => {
    expect(typeof AceIntegrationPendingError).toBe('function');
    const e = new AceIntegrationPendingError();
    expect(e.name).toBe('AceIntegrationPendingError');
    expect(e.message).toMatch(/deprecated/i);
  });
});

describe('normalizeAceReport — M2-C impact breakdown', () => {
  function buildRaw(
    violations: ReadonlyArray<{ impact: string; id: string; desc: string }>,
  ): AceRawReport {
    return {
      'earl:result': {
        'earl:outcome': { '@id': violations.length > 0 ? 'earl:fail' : 'earl:pass' },
      },
      assertions: [
        {
          assertions: violations.map((v) => ({
            'earl:result': {
              'earl:outcome': { '@id': 'earl:fail' as const },
              'dct:description': v.desc,
            },
            'earl:test': { '@id': v.id, 'earl:impact': v.impact },
          })),
        },
      ],
    };
  }

  it('classifies passing report as PASS with all-zero counts', () => {
    const r = normalizeAceReport(buildRaw([]));
    expect(r.outcome).toBe('PASS');
    expect(r.violations).toBe(0);
    expect(r.byImpact).toEqual({ critical: 0, serious: 0, moderate: 0, minor: 0 });
    expect(r.details).toEqual([]);
  });

  it('counts impact tiers separately', () => {
    const r = normalizeAceReport(
      buildRaw([
        { impact: 'critical', id: 't1', desc: 'a' },
        { impact: 'critical', id: 't2', desc: 'b' },
        { impact: 'serious', id: 't3', desc: 'c' },
        { impact: 'moderate', id: 't4', desc: 'd' },
        { impact: 'minor', id: 't5', desc: 'e' },
      ]),
    );
    expect(r.violations).toBe(5);
    expect(r.byImpact).toEqual({ critical: 2, serious: 1, moderate: 1, minor: 1 });
    expect(r.outcome).toBe('FAIL');
  });

  it('treats unknown impact strings as moderate', () => {
    const r = normalizeAceReport(buildRaw([{ impact: 'cosmic-ray', id: 't', desc: 'x' }]));
    expect(r.byImpact.moderate).toBe(1);
  });

  it('summary string includes the impact tier breakdown when failing', () => {
    const r = normalizeAceReport(buildRaw([{ impact: 'serious', id: 't', desc: 'x' }]));
    expect(r.summary).toMatch(/serious=1/);
    expect(r.summary).toMatch(/critical=0/);
  });
});

describe('isAceStrictPass — M2-C strict gate', () => {
  function buildResult(by: {
    critical?: number;
    serious?: number;
    moderate?: number;
    minor?: number;
  }) {
    return {
      violations: 0,
      outcome: 'PASS' as const,
      summary: '',
      details: [] as never[],
      byImpact: {
        critical: by.critical ?? 0,
        serious: by.serious ?? 0,
        moderate: by.moderate ?? 0,
        minor: by.minor ?? 0,
      },
    };
  }

  it('passes when both critical and serious are zero (moderate/minor OK)', () => {
    expect(isAceStrictPass(buildResult({ moderate: 3, minor: 7 }))).toBe(true);
  });

  it('fails when there is one critical', () => {
    expect(isAceStrictPass(buildResult({ critical: 1 }))).toBe(false);
  });

  it('fails when there is one serious', () => {
    expect(isAceStrictPass(buildResult({ serious: 1 }))).toBe(false);
  });

  it('passes for all-zero result', () => {
    expect(isAceStrictPass(buildResult({}))).toBe(true);
  });
});
