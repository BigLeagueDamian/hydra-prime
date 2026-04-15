import { describe, it, expect } from 'vitest';
import { newHypothesis, addCandidate, applyObservation } from '../../src/engine/beliefs';

describe('applyObservation', () => {
  it('adds new candidates from observation with starting logit ~ logit(0.05)', () => {
    let h = newHypothesis('h:target-address', 'target-address');
    h = applyObservation(h, {
      source_class: 'config-file',
      note: 'ssh-config-scan',
      newCandidates: ['10.0.0.1'],
      llrByCandidate: {},
    }, 1);
    const c = h.candidates.find(x => x.value === '10.0.0.1')!;
    expect(c).toBeDefined();
    expect(c.logit).toBeCloseTo(Math.log(0.05 / 0.95), 5);
  });

  it('boosts logit by LLR for matched candidates', () => {
    let h = newHypothesis('h', 'target-address');
    h = addCandidate(h, '1.2.3.4', 0);
    h = applyObservation(h, {
      source_class: 'cfg', note: 'n',
      newCandidates: [],
      llrByCandidate: { '1.2.3.4': 4.0 },
    }, 5);
    const c = h.candidates.find(x => x.value === '1.2.3.4')!;
    expect(c.logit).toBeCloseTo(4.0, 5);
    expect(c.evidence).toHaveLength(1);
    expect(c.evidence[0]!.tick).toBe(5);
    expect(c.evidence[0]!.llr).toBe(4.0);
  });

  it('ignores zero LLRs (no evidence appended)', () => {
    let h = newHypothesis('h', 'target-address');
    h = addCandidate(h, 'a', 0);
    h = applyObservation(h, {
      source_class: 'cfg', note: 'n',
      newCandidates: [],
      llrByCandidate: { a: 0 },
    }, 1);
    expect(h.candidates[0]!.evidence).toEqual([]);
  });

  it('renormalizes posteriors after update', () => {
    let h = newHypothesis('h', 'target-address');
    h = addCandidate(h, 'a', 0);
    h = addCandidate(h, 'b', 0);
    h = applyObservation(h, {
      source_class: 'cfg', note: 'n',
      newCandidates: [],
      llrByCandidate: { a: 5 },
    }, 1);
    const a = h.candidates.find(c => c.value === 'a')!;
    const b = h.candidates.find(c => c.value === 'b')!;
    expect(a.posterior).toBeGreaterThan(b.posterior);
    expect(a.posterior + b.posterior).toBeCloseTo(1, 5);
  });
});
