import { describe, it, expect } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { signRequest } from '../src/hmac';

async function poll(mission_id: string, session_key: string) {
  const ts = Math.floor(Date.now() / 1000);
  const path = `/v1/poll?mission=${mission_id}`;
  const sig = await signRequest(session_key, 'GET', path, '', ts);
  const res = await SELF.fetch(`https://h${path}`, {
    headers: { 'X-Hydra-Sig': sig, 'X-Hydra-Ts': String(ts) },
  });
  return res.json() as Promise<{ id: string; op: string; sleep_s?: number }>;
}

async function report(mission_id: string, session_key: string, op_id: string) {
  const body = JSON.stringify({ mission_id, op_id, ok: true, data: {}, wall_ms: 1 });
  const ts = Math.floor(Date.now() / 1000);
  const sig = await signRequest(session_key, 'POST', '/v1/report', body, ts);
  return SELF.fetch('https://h/v1/report', {
    method: 'POST',
    headers: { 'X-Hydra-Sig': sig, 'X-Hydra-Ts': String(ts), 'Content-Type': 'application/json' },
    body,
  });
}

describe('mock script loop', () => {
  it('completes 5 poll/report cycles', async () => {
    const start = await SELF.fetch('https://h/v1/admin/mission/start', {
      method: 'POST', headers: { 'X-Admin-Key': env.ADMIN_KEY ?? 'dev-admin' },
      body: JSON.stringify({
        fingerprint_expected: 'fp_e2e', target_allowlist: ['origin', 'kvm2'],
        strict_gold: false, budget_paid_usd: 10, deadline_seconds: 86_400,
      }),
    });
    const { mission_id } = await start.json() as { mission_id: string };
    const reg = await SELF.fetch('https://h/v1/register', {
      method: 'POST',
      body: JSON.stringify({ fingerprint: 'fp_e2e', platform: 'linux', version: '0.1.0', mission_id }),
    });
    const { session_key } = await reg.json() as { session_key: string };

    for (let i = 0; i < 5; i++) {
      const d = await poll(mission_id, session_key);
      expect(d.op).toBeDefined();
      const r = await report(mission_id, session_key, d.id);
      expect(r.status).toBe(200);
    }
  });
});
