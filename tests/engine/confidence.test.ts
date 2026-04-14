import { describe, it, expect } from 'vitest';
import { confidenceToAttemptHop } from '../../src/engine/confidence';
import { newHypothesis, addCandidate, applyObservation } from '../../src/engine/beliefs';

describe('confidenceToAttemptHop', () => {
  it('returns 0 if no address hypothesis', () => {
    expect(confidenceToAttemptHop({})).toBe(0);
  });

  it('multiplies posteriors and feasibility', () => {
    let addr = newHypothesis('h:target-address', 'target-address');
    addr = addCandidate(addr, '1.1.1.1', 4);
    addr = applyObservation(addr, { source_class: 's', note: 'n', newCandidates: [], llrByCandidate: {} }, 1);
    let cred = newHypothesis('h:target-credentials', 'target-credentials');
    cred = addCandidate(cred, '~/.ssh/k', 3);
    cred = applyObservation(cred, { source_class: 's', note: 'n', newCandidates: [], llrByCandidate: {} }, 1);
    const c = confidenceToAttemptHop({ 'h:target-address': addr, 'h:target-credentials': cred });
    expect(c).toBeGreaterThan(0);
    expect(c).toBeLessThanOrEqual(1);
  });

  it('penalizes unresolved contradictions', () => {
    let addr = newHypothesis('h:target-address', 'target-address');
    addr = addCandidate(addr, 'a', 5);
    addr = addCandidate(addr, 'b', 4);
    addr = applyObservation(addr, { source_class: 's', note: 'n', newCandidates: [], llrByCandidate: {} }, 1);
    let cred = newHypothesis('h:target-credentials', 'target-credentials');
    cred = addCandidate(cred, 'k', 5);
    cred = applyObservation(cred, { source_class: 's', note: 'n', newCandidates: [], llrByCandidate: {} }, 1);
    const c = confidenceToAttemptHop({ 'h:target-address': addr, 'h:target-credentials': cred });
    expect(c).toBeLessThan(1);
  });
});
