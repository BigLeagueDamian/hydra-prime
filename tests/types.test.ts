import { describe, it, expect } from 'vitest';
import { isDirective, isReportEnvelope, parseDirective } from '../src/types';

describe('wire types', () => {
  it('accepts a valid exec directive', () => {
    const d = { id: 'op_1', op: 'exec', cmd: 'ls', timeout_s: 5 };
    expect(isDirective(d)).toBe(true);
  });

  it('rejects directive without id', () => {
    expect(isDirective({ op: 'exec', cmd: 'ls', timeout_s: 5 })).toBe(false);
  });

  it('parses report envelope success', () => {
    const env = { op_id: 'op_1', ok: true, data: { stdout: 'hi' }, wall_ms: 3 };
    expect(isReportEnvelope(env)).toBe(true);
  });

  it('rejects success report missing data field', () => {
    expect(isReportEnvelope({ op_id: 'x', ok: true, wall_ms: 5 })).toBe(false);
  });

  it('rejects failure report missing err field', () => {
    expect(isReportEnvelope({ op_id: 'x', ok: false, wall_ms: 5 })).toBe(false);
  });

  it('accepts valid failure report', () => {
    expect(isReportEnvelope({ op_id: 'x', ok: false, err: 'timeout', wall_ms: 5 })).toBe(true);
  });

  it('parseDirective throws on unknown op', () => {
    expect(() => parseDirective(JSON.stringify({ id: 'x', op: 'sing' }))).toThrow();
  });
});
