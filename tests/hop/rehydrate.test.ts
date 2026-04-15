import { describe, it, expect } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { distillWarmPacket } from '../../src/hop/distill';
import type { MissionState } from '../../src/types';

describe('rehydration', () => {
  it('register with resume_packet creates a linked target mission', async () => {
    const originState: MissionState = {
      mission_id: 'm_origin', origin_fingerprint: 'fp_o', platform: 'linux',
      phase: 'executing-hop', honor_tier: 'gold',
      budget_paid_usd_remaining: 9.5, strict_gold: true,
      wall_clock_started_ms: Date.now() - 3600_000,
      wall_clock_deadline_ms: Date.now() + 82_800_000,
      tick: 50, beliefs: {}, jump_chain: ['m_origin'],
      target_allowlist: ['origin', 'kvm2'],
    };
    const packet = distillWarmPacket(originState, { recentTicks: [], catalogIds: [], codexHash: 'x' });
    const packetB64 = btoa(JSON.stringify(packet));

    // First, start the target mission slot via admin.
    const start = await SELF.fetch('https://h/v1/admin/mission/start', {
      method: 'POST', headers: { 'X-Admin-Key': 'dev-admin' },
      body: JSON.stringify({
        fingerprint_expected: 'fp_target', target_allowlist: ['origin', 'kvm2'],
        strict_gold: true, budget_paid_usd: 10, deadline_seconds: 82_800,
      }),
    });
    const { mission_id } = await start.json() as { mission_id: string };

    const res = await SELF.fetch('https://h/v1/register', {
      method: 'POST',
      body: JSON.stringify({
        mission_id, fingerprint: 'fp_target', platform: 'linux', version: '0.1.0',
        resume_packet: packetB64,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { mission_id: string; jump_chain: string[] };
    expect(body.jump_chain).toEqual(['m_origin', mission_id]);
  });
});
