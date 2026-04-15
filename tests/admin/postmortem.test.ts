import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';
import { signRequest } from '../../src/hmac';

describe('/v1/admin/mission/<id>/postmortem', () => {
  it('returns markdown with phases, ticks, beliefs, honor tier', async () => {
    const start = await SELF.fetch('https://h/v1/admin/mission/start', {
      method: 'POST', headers: { 'X-Admin-Key': 'dev-admin' },
      body: JSON.stringify({
        fingerprint_expected: 'fp_pm', target_allowlist: ['origin', 'kvm2'],
        strict_gold: true, budget_paid_usd: 10, deadline_seconds: 86_400,
      }),
    });
    const { mission_id } = await start.json() as { mission_id: string };
    const reg = await SELF.fetch('https://h/v1/register', {
      method: 'POST',
      body: JSON.stringify({ mission_id, fingerprint: 'fp_pm', platform: 'linux', version: '0.1.0' }),
    });
    const { session_key } = await reg.json() as { session_key: string };
    // Generate one tick.
    const ts = Math.floor(Date.now() / 1000);
    const pollPath = `/v1/poll?mission=${mission_id}`;
    const sig = await signRequest(session_key, 'GET', pollPath, '', ts);
    const d = await (await SELF.fetch(`https://h${pollPath}`, { headers: { 'X-Hydra-Sig': sig, 'X-Hydra-Ts': String(ts) } })).json() as { id: string };
    const body = JSON.stringify({ mission_id, op_id: d.id, ok: true, data: {}, wall_ms: 1 });
    const sig2 = await signRequest(session_key, 'POST', '/v1/report', body, ts);
    await SELF.fetch('https://h/v1/report', {
      method: 'POST', headers: { 'X-Hydra-Sig': sig2, 'X-Hydra-Ts': String(ts), 'Content-Type': 'application/json' }, body,
    });

    const pm = await SELF.fetch(`https://h/v1/admin/mission/${mission_id}/postmortem`, { headers: { 'X-Admin-Key': 'dev-admin' } });
    expect(pm.status).toBe(200);
    expect(pm.headers.get('content-type')).toMatch(/text\/markdown/);
    const md = await pm.text();
    expect(md).toMatch(/# Post-mortem/);
    expect(md).toContain(mission_id);
    expect(md).toMatch(/honor tier/i);
    expect(md).toMatch(/tick/i);
  });
});
