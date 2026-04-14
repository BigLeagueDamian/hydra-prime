import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';

async function callDo(missionId: string, path: string, init?: RequestInit): Promise<Response> {
  const id = env.MISSION_DO.idFromName(missionId);
  const stub = env.MISSION_DO.get(id);
  return stub.fetch(`https://do/${path}`, init);
}

describe('MissionDO', () => {
  it('starts in registered phase after init', async () => {
    const res = await callDo('m_test_1', 'init', {
      method: 'POST',
      body: JSON.stringify({
        fingerprint: 'fp1', platform: 'linux',
        target_allowlist: ['origin', 'kvm2'], strict_gold: false,
        budget_paid_usd: 10, deadline_ms: Date.now() + 86_400_000,
      }),
    });
    expect(res.status).toBe(200);
    const state = await res.json() as { phase: string };
    expect(state.phase).toBe('registered');
  });

  it('transitions through legal sequence registered → provisioning → scanning', async () => {
    await callDo('m_test_2', 'init', { method: 'POST', body: JSON.stringify({
      fingerprint: 'fp2', platform: 'linux',
      target_allowlist: ['origin', 'kvm2'], strict_gold: false,
      budget_paid_usd: 10, deadline_ms: Date.now() + 86_400_000,
    })});
    let res = await callDo('m_test_2', 'transition', { method: 'POST', body: JSON.stringify({ to: 'provisioning' }) });
    expect(res.status).toBe(200);
    res = await callDo('m_test_2', 'transition', { method: 'POST', body: JSON.stringify({ to: 'scanning' }) });
    expect(res.status).toBe(200);
    const after = await (await callDo('m_test_2', 'state')).json() as { phase: string };
    expect(after.phase).toBe('scanning');
  });

  it('rejects illegal transition', async () => {
    await callDo('m_test_3', 'init', { method: 'POST', body: JSON.stringify({
      fingerprint: 'fp3', platform: 'linux',
      target_allowlist: ['origin'], strict_gold: false,
      budget_paid_usd: 10, deadline_ms: Date.now() + 86_400_000,
    })});
    const res = await callDo('m_test_3', 'transition', { method: 'POST', body: JSON.stringify({ to: 'completed' }) });
    expect(res.status).toBe(409);
  });

  it('rejects illegal direct skip registered → scanning', async () => {
    await callDo('m_test_4', 'init', { method: 'POST', body: JSON.stringify({
      fingerprint: 'fp4', platform: 'linux',
      target_allowlist: ['origin'], strict_gold: false,
      budget_paid_usd: 10, deadline_ms: Date.now() + 86_400_000,
    })});
    const res = await callDo('m_test_4', 'transition', { method: 'POST', body: JSON.stringify({ to: 'scanning' }) });
    expect(res.status).toBe(409);
  });
});
