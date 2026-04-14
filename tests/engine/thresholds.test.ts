import { describe, it, expect } from 'vitest';
import {
  newHypothesis, addCandidate, applyObservation,
  isConverged, isCollapsed, isThrashing, recomputeStatus,
} from '../../src/engine/beliefs';

describe('threshold detection', () => {
  it('isConverged true when top posterior > convergeThreshold', () => {
    let h = newHypothesis('h', 'target-address');
    h = addCandidate(h, 'a', 10);
    h = addCandidate(h, 'b', 0);
    h = applyObservation(h, { source_class: 's', note: 'n', newCandidates: [], llrByCandidate: {} }, 1);
    expect(isConverged(h)).toBe(true);
  });

  it('isCollapsed true when top posterior < collapseThreshold', () => {
    let h = newHypothesis('h', 'target-address');
    for (const v of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) h = addCandidate(h, v, 0);
    h = applyObservation(h, { source_class: 's', note: 'n', newCandidates: [], llrByCandidate: {} }, 1);
    expect(isCollapsed(h)).toBe(true);
  });

  it('recomputeStatus marks converged', () => {
    let h = newHypothesis('h', 'target-address');
    h = addCandidate(h, 'a', 10);
    h = applyObservation(h, { source_class: 's', note: 'n', newCandidates: [], llrByCandidate: {} }, 1);
    h = recomputeStatus(h);
    expect(h.status).toBe('converged');
  });

  it('isThrashing true when top candidate flips within window', () => {
    let h = newHypothesis('h', 'target-address');
    h = addCandidate(h, 'a', 0);
    h = addCandidate(h, 'b', 0);
    h.candidates[0]!.evidence = [
      { note: 'n', source_class: 's', llr: 3, tick: 1 },
      { note: 'n', source_class: 's', llr: -3, tick: 2 },
      { note: 'n', source_class: 's', llr: 3, tick: 3 },
    ];
    expect(isThrashing(h, /* recentTicks */ 5)).toBe(true);
  });
});
