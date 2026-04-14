import { describe, it, expect } from 'vitest';
import { softmaxPosteriors, newHypothesis, addCandidate } from '../../src/engine/beliefs';

describe('softmax posteriors', () => {
  it('uniform logits → equal posteriors summing to 1', () => {
    let h = newHypothesis('h', 'target-address');
    h = addCandidate(h, 'a', 0);
    h = addCandidate(h, 'b', 0);
    h = addCandidate(h, 'c', 0);
    h = softmaxPosteriors(h);
    h.candidates.forEach(c => expect(c.posterior).toBeCloseTo(1 / 3, 5));
    expect(h.candidates.reduce((s, c) => s + c.posterior, 0)).toBeCloseTo(1, 5);
  });

  it('large logit dominates', () => {
    let h = newHypothesis('h', 'target-address');
    h = addCandidate(h, 'big', 10);
    h = addCandidate(h, 'small', 0);
    h = softmaxPosteriors(h);
    const big = h.candidates.find(c => c.value === 'big')!;
    expect(big.posterior).toBeGreaterThan(0.99);
  });

  it('numerically stable for huge logits', () => {
    let h = newHypothesis('h', 'target-address');
    h = addCandidate(h, 'a', 1000);
    h = addCandidate(h, 'b', 1001);
    h = softmaxPosteriors(h);
    expect(h.candidates.every(c => Number.isFinite(c.posterior))).toBe(true);
    expect(h.candidates.reduce((s, c) => s + c.posterior, 0)).toBeCloseTo(1, 5);
  });

  it('empty hypothesis: no-op', () => {
    let h = newHypothesis('h', 'target-address');
    h = softmaxPosteriors(h);
    expect(h.candidates).toEqual([]);
  });
});
