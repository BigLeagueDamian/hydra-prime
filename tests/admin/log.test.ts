import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';
import { signRequest } from '../../src/hmac';

describe('/v1/admin/mission/<id>/log', () => {
  it('returns ordered tick log', async () => {
    const start = await SELF.fetch('https://h/v1/admin/mission/start', {
      method: 'POST', headers: { 'X-Admin-Key': 'dev-admin' },
      body: JSON.stringify({
        fingerprint_expected: 'fp_log', target_allowlist: ['origin', 'kvm2'],
        strict_gold: true, budget_paid_usd: 10, deadline_seconds: 86_400,
      }),
    });
    const { mission_id } = await start.json() as { mission_id: string };
    const reg = await SELF.fetch('https://h/v1/register', {
      method: 'POST',
      body: JSON.stringify({ mission_id, fingerprint: 'fp_log', platform: 'linux', version: '0.1.0' }),
    });
    const { session_key } = await reg.json() as { session_key: string };

    for (let i = 0; i < 3; i++) {
      const ts = Math.floor(Date.now() / 1000);
      const path = `/v1/poll?mission=${mission_id}`;
      const sig = await signRequest(session_key, 'GET', path, '', ts);
      const d = await (await SELF.fetch(`https://h${path}`, { headers: { 'X-Hydra-Sig': sig, 'X-Hydra-Ts': String(ts) } })).json() as { id: string };
      const body = JSON.stringify({ mission_id, op_id: d.id, ok: true, data: {}, wall_ms: 1 });
      const sig2 = await signRequest(session_key, 'POST', '/v1/report', body, ts);
      await SELF.fetch('https://h/v1/report', {
        method: 'POST',
        headers: { 'X-Hydra-Sig': sig2, 'X-Hydra-Ts': String(ts), 'Content-Type': 'application/json' },
        body,
      });
    }

    const log = await SELF.fetch(`https://h/v1/admin/mission/${mission_id}/log`, { headers: { 'X-Admin-Key': 'dev-admin' } });
    expect(log.status).toBe(200);
    const j = await log.json() as { ticks: { tick: number }[] };
    expect(j.ticks.length).toBeGreaterThanOrEqual(3);
  });
});
