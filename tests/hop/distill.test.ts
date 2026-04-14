import { describe, it, expect } from 'vitest';
import { distillWarmPacket } from '../../src/hop/distill';
import { newHypothesis, addCandidate, applyObservation } from '../../src/engine/beliefs';
import type { MissionState } from '../../src/types';

const m: MissionState = {
  mission_id: 'm1', origin_fingerprint: 'fp', platform: 'linux',
  phase: 'planning', honor_tier: 'gold',
  budget_paid_usd_remaining: 10, strict_gold: true,
  wall_clock_started_ms: Date.now() - 3600_000,
  wall_clock_deadline_ms: Date.now() + 82_800_000,
  tick: 30, beliefs: {}, jump_chain: ['origin'],
  target_allowlist: ['origin', 'kvm2'],
};

describe('warm packet distillation', () => {
  it('serializes belief graph + brief + tick log + catalog ids + tier + codex pin', () => {
    let h = newHypothesis('h:target-address', 'target-address');
    h = addCandidate(h, 'kvm2', 5);
    h = applyObservation(h, { source_class: 's', note: 'n', newCandidates: [], llrByCandidate: {} }, 1);
    const packet = distillWarmPacket(
      { ...m, beliefs: { 'h:target-address': h } },
      { recentTicks: [{ tick: 30, action: 'exec', wall_ms: 5 }], catalogIds: ['ssh-config-scan'], codexHash: 'sha256:cdx' },
    );
    expect(packet.belief_graph['h:target-address']).toBeDefined();
    expect(packet.recent_ticks.length).toBe(1);
    expect(packet.catalog_ids).toContain('ssh-config-scan');
    expect(packet.honor_tier).toBe('gold');
    expect(packet.codex_hash).toBe('sha256:cdx');
    expect(packet.jump_chain_origin).toBe('m1');
  });

  it('packet is JSON-serializable and ≤ 2 MB', () => {
    const packet = distillWarmPacket(m, { recentTicks: [], catalogIds: [], codexHash: 'x' });
    const json = JSON.stringify(packet);
    expect(json.length).toBeLessThanOrEqual(2_000_000);
  });
});
