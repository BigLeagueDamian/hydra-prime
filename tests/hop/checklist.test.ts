import { describe, it, expect } from 'vitest';
import { enforcePreHopChecklist } from '../../src/hop/checklist';
import { distillWarmPacket } from '../../src/hop/distill';
import { newHypothesis, addCandidate, applyObservation } from '../../src/engine/beliefs';
import type { MissionState } from '../../src/types';

const m: MissionState = {
  mission_id: 'm', origin_fingerprint: 'fp', platform: 'linux',
  phase: 'planning', honor_tier: 'gold', budget_paid_usd_remaining: 10, strict_gold: true,
  wall_clock_started_ms: Date.now(), wall_clock_deadline_ms: Date.now() + 86_400_000,
  tick: 1, beliefs: {}, jump_chain: ['origin'], target_allowlist: ['origin', 'kvm2'],
};

describe('pre-hop checklist', () => {
  it('blocks when packet exceeds 2 MB', () => {
    const packet = distillWarmPacket(m, { recentTicks: [], catalogIds: [], codexHash: 'x' });
    (packet as any).belief_graph['h:bogus'] = { id: 'h:bogus', candidates: Array(50_000).fill({ value: 'x'.repeat(40), logit: 0, posterior: 0, evidence: [] }) };
    const r = enforcePreHopChecklist(packet);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/distillation-oversize/);
  });

  it('blocks when open critical hypothesis lacks evidence in packet', () => {
    let h = newHypothesis('h:target-address', 'target-address');
    h = addCandidate(h, 'kvm2', 0);  // open, no evidence
    h = applyObservation(h, { source_class: 's', note: 'n', newCandidates: [], llrByCandidate: {} }, 1);
    const packet = distillWarmPacket({ ...m, beliefs: { 'h:target-address': h } }, { recentTicks: [], catalogIds: [], codexHash: 'x' });
    const r = enforcePreHopChecklist(packet);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/missing-evidence/);
  });

  it('passes when only converged hypotheses remain', () => {
    let h = newHypothesis('h:target-address', 'target-address');
    h = addCandidate(h, 'kvm2', 10);
    h = applyObservation(h, { source_class: 's', note: 'n', newCandidates: [], llrByCandidate: { kvm2: 1 } }, 1);
    let c = newHypothesis('h:target-credentials', 'target-credentials');
    c = addCandidate(c, 'k', 10);
    c = applyObservation(c, { source_class: 's', note: 'n', newCandidates: [], llrByCandidate: { k: 1 } }, 1);
    const packet = distillWarmPacket({ ...m, beliefs: { 'h:target-address': h, 'h:target-credentials': c } }, { recentTicks: [], catalogIds: [], codexHash: 'x' });
    const r = enforcePreHopChecklist(packet);
    expect(r.ok).toBe(true);
  });
});
