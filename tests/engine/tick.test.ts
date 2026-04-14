import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { seedCatalog } from '../../src/catalog/seed';

async function callDo(missionId: string, path: string, init?: RequestInit) {
  const id = env.MISSION_DO.idFromName(missionId);
  const stub = env.MISSION_DO.get(id);
  return stub.fetch(`https://do/${path}`, init);
}

describe('tick cycle integration', () => {
  it('first directive after init is exec for a Tier 1 probe', async () => {
    await seedCatalog(env.HYDRA_KV);
    await callDo('m_tick_1', 'init', { method: 'POST', body: JSON.stringify({
      fingerprint: 'fp', platform: 'linux',
      target_allowlist: ['origin', 'kvm2'], strict_gold: true,
      budget_paid_usd: 10, deadline_ms: Date.now() + 86_400_000,
    })});
    await callDo('m_tick_1', 'transition', { method: 'POST', body: JSON.stringify({ to: 'provisioning' }) });
    await callDo('m_tick_1', 'transition', { method: 'POST', body: JSON.stringify({ to: 'scanning' }) });
    const res = await callDo('m_tick_1', 'next-directive', { method: 'POST' });
    const d = await res.json() as { op: string; cmd?: string };
    expect(d.op).toBe('exec');
    expect(d.cmd).toMatch(/ssh|known_hosts|hosts|history|key/);
  });

  it('ingest applies LLR and updates beliefs', async () => {
    await seedCatalog(env.HYDRA_KV);
    await callDo('m_tick_2', 'init', { method: 'POST', body: JSON.stringify({
      fingerprint: 'fp', platform: 'linux',
      target_allowlist: ['origin', 'kvm2'], strict_gold: true,
      budget_paid_usd: 10, deadline_ms: Date.now() + 86_400_000,
    })});
    await callDo('m_tick_2', 'transition', { method: 'POST', body: JSON.stringify({ to: 'provisioning' }) });
    await callDo('m_tick_2', 'transition', { method: 'POST', body: JSON.stringify({ to: 'scanning' }) });
    const dRes = await callDo('m_tick_2', 'next-directive', { method: 'POST' });
    const d = await dRes.json() as { id: string; op: string };
    await callDo('m_tick_2', 'ingest', { method: 'POST', body: JSON.stringify({
      op_id: d.id, ok: true,
      data: {
        probeId: 'known-hosts-enum',
        observations: [
          { pattern: 'target_name_present', extracted: { value: 'kvm2' }, hypothesis: 'h:target-address' },
        ],
      },
      wall_ms: 4,
    })});
    const stateRes = await callDo('m_tick_2', 'state');
    const state = await stateRes.json() as { beliefs: Record<string, { candidates: { value: string; posterior: number }[] }> };
    const top = state.beliefs['h:target-address']?.candidates.find(c => c.value === 'kvm2');
    expect(top).toBeDefined();
    expect(top!.posterior).toBeGreaterThan(0.05);
  });
});
