import { describe, it, expect } from 'vitest';
import { newHypothesis, addCandidate, getCandidate } from '../../src/engine/beliefs';

describe('belief graph primitives', () => {
  it('creates an empty hypothesis with thresholds', () => {
    const h = newHypothesis('h:target-address', 'target-address');
    expect(h.id).toBe('h:target-address');
    expect(h.candidates).toEqual([]);
    expect(h.collapseThreshold).toBeCloseTo(0.2);
    expect(h.convergeThreshold).toBeCloseTo(0.9);
    expect(h.status).toBe('open');
  });

  it('adds a candidate with starting logit', () => {
    let h = newHypothesis('h:x', 'target-address');
    h = addCandidate(h, '72.61.65.34', 0);
    expect(h.candidates).toHaveLength(1);
    expect(h.candidates[0]!.value).toBe('72.61.65.34');
    expect(h.candidates[0]!.logit).toBe(0);
  });

  it('addCandidate is idempotent on value', () => {
    let h = newHypothesis('h:x', 'target-address');
    h = addCandidate(h, 'a', 0);
    h = addCandidate(h, 'a', 5);
    expect(h.candidates).toHaveLength(1);
  });

  it('getCandidate returns by value or undefined', () => {
    let h = newHypothesis('h:x', 'target-address');
    h = addCandidate(h, 'a', 0);
    expect(getCandidate(h, 'a')?.value).toBe('a');
    expect(getCandidate(h, 'b')).toBeUndefined();
  });
});
