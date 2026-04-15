import { describe, it, expect } from 'vitest';
import { advancePhase, isStalled } from '../../src/engine/phases';
import { activateContingency } from '../../src/engine/contingency';
import { newHypothesis, addCandidate, applyObservation } from '../../src/engine/beliefs';
import type { MissionState } from '../../src/types';

const baseM: MissionState = {
  mission_id: 'm', origin_fingerprint: 'fp', platform: 'linux',
  phase: 'scanning', honor_tier: 'gold',
  budget_paid_usd_remaining: 10, strict_gold: true,
  wall_clock_started_ms: Date.now(), wall_clock_deadline_ms: Date.now() + 86_400_000,
  tick: 5, beliefs: {}, jump_chain: ['origin'],
  target_allowlist: ['origin', 'kvm2'],
};

describe('phase transitions', () => {
  it('scanning -> hypothesizing when first hypothesis appears', () => {
    let h = newHypothesis('h:target-address', 'target-address');
    h = addCandidate(h, 'kvm2', 2);
    h = applyObservation(h, { source_class: 's', note: 'n', newCandidates: [], llrByCandidate: {} }, 1);
    const next = advancePhase({ ...baseM, beliefs: { 'h:target-address': h } });
    expect(next).toBe('hypothesizing');
  });

  it('hypothesizing -> planning when target-address converged AND target-credentials converged', () => {
    let addr = newHypothesis('h:target-address', 'target-address');
    addr = addCandidate(addr, 'kvm2', 10);
    addr = applyObservation(addr, { source_class: 's', note: 'n', newCandidates: [], llrByCandidate: {} }, 1);
    let cred = newHypothesis('h:target-credentials', 'target-credentials');
    cred = addCandidate(cred, '~/.ssh/k', 10);
    cred = applyObservation(cred, { source_class: 's', note: 'n', newCandidates: [], llrByCandidate: {} }, 1);
    const next = advancePhase({ ...baseM, phase: 'hypothesizing', beliefs: { 'h:target-address': addr, 'h:target-credentials': cred } });
    expect(next).toBe('planning');
  });

  it('isStalled true after 15min wall-clock no-progress in phase', () => {
    expect(isStalled('scanning', Date.now() - 16 * 60_000)).toBe(true);
    expect(isStalled('scanning', Date.now() - 5 * 60_000)).toBe(false);
  });
});

describe('contingency activation', () => {
  it('phase-stall activates fallback when timeout fires', () => {
    const action = activateContingency('phase-stall', { phase: 'scanning' });
    expect(action.kind).toBe('force-transition');
  });

  it('hypothesis-collapse triggers tier escalation', () => {
    const action = activateContingency('hypothesis-collapse', { hypothesisId: 'h:target-address' });
    expect(action.kind).toBe('enqueue-tier2-probes');
  });
});
