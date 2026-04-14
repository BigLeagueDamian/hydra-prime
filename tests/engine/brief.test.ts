import { describe, it, expect } from 'vitest';
import { generateBrief } from '../../src/engine/brief';
import { newHypothesis, addCandidate, applyObservation } from '../../src/engine/beliefs';
import type { MissionState } from '../../src/types';

const m: MissionState = {
  mission_id: 'm1', origin_fingerprint: 'fp', platform: 'linux',
  phase: 'planning', honor_tier: 'gold',
  budget_paid_usd_remaining: 10, strict_gold: false,
  wall_clock_started_ms: Date.now() - 3600_000,
  wall_clock_deadline_ms: Date.now() + 82_800_000,
  tick: 42, beliefs: {}, jump_chain: ['origin'],
  target_allowlist: ['origin', 'kvm2'],
};

describe('mission brief', () => {
  it('serializes mission goal + budget + time', () => {
    const b = generateBrief(m, { lastProgressTick: 40, lastProgressWallS: 5 });
    expect(b.goal).toMatch(/kvm2|target/);
    expect(b.budget_remaining.paid_usd).toBe(10);
    expect(b.time_remaining_s).toBeGreaterThan(0);
    expect(b.last_progress_wall_s).toBe(5);
  });

  it('reports current_best_path when address+cred hypotheses exist', () => {
    let addr = newHypothesis('h:target-address', 'target-address');
    addr = addCandidate(addr, '10.0.0.1', 5);
    addr = applyObservation(addr, { source_class: 's', note: 'n', newCandidates: [], llrByCandidate: {} }, 1);
    let cred = newHypothesis('h:target-credentials', 'target-credentials');
    cred = addCandidate(cred, '~/.ssh/k', 3);
    cred = applyObservation(cred, { source_class: 's', note: 'n', newCandidates: [], llrByCandidate: {} }, 1);
    const b = generateBrief({ ...m, beliefs: { 'h:target-address': addr, 'h:target-credentials': cred } },
      { lastProgressTick: 40, lastProgressWallS: 5 });
    expect(b.current_best_path?.address_hypothesis.candidate).toBe('10.0.0.1');
    expect(b.current_best_path?.confidence_to_attempt_hop).toBeGreaterThan(0);
  });

  it('lists gaps when hypotheses unconverged', () => {
    let addr = newHypothesis('h:target-address', 'target-address');
    addr = addCandidate(addr, 'a', 0);
    addr = addCandidate(addr, 'b', 0);
    addr = applyObservation(addr, { source_class: 's', note: 'n', newCandidates: [], llrByCandidate: {} }, 1);
    const b = generateBrief({ ...m, beliefs: { 'h:target-address': addr } },
      { lastProgressTick: 40, lastProgressWallS: 5 });
    expect(b.gap_to_success.length).toBeGreaterThan(0);
  });
});
