import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';
import { signRequest } from '../../src/hmac';

async function bootstrap() {
  const start = await SELF.fetch('https://h/v1/admin/mission/start', {
    method: 'POST', headers: { 'X-Admin-Key': 'dev-admin' },
    body: JSON.stringify({
      fingerprint_expected: 'fp', target_allowlist: ['origin', 'kvm2'],
      strict_gold: true, budget_paid_usd: 10, deadline_seconds: 86_400,
    }),
  });
  const { mission_id } = await start.json() as { mission_id: string };
  const reg = await SELF.fetch('https://h/v1/register', {
    method: 'POST',
    body: JSON.stringify({ mission_id, fingerprint: 'fp', platform: 'linux', version: '0.1.0' }),
  });
  const { session_key } = await reg.json() as { session_key: string };
  return { mission_id, session_key };
}

async function poll(mission_id: string, session_key: string) {
  const ts = Math.floor(Date.now() / 1000);
  const path = `/v1/poll?mission=${mission_id}`;
  const sig = await signRequest(session_key, 'GET', path, '', ts);
  const res = await SELF.fetch(`https://h${path}`, { headers: { 'X-Hydra-Sig': sig, 'X-Hydra-Ts': String(ts) } });
  return res.json() as Promise<{ op: string }>;
}

describe('admin lifecycle', () => {
  it('kill flips next poll to terminate', async () => {
    const { mission_id, session_key } = await bootstrap();
    const k = await SELF.fetch(`https://h/v1/admin/mission/${mission_id}/kill`, {
      method: 'POST', headers: { 'X-Admin-Key': 'dev-admin' },
    });
    expect(k.status).toBe(200);
    const d = await poll(mission_id, session_key);
    expect(d.op).toBe('terminate');
  });

  it('pause flips next poll to yield', async () => {
    const { mission_id, session_key } = await bootstrap();
    const r = await SELF.fetch(`https://h/v1/admin/mission/${mission_id}/pause`, {
      method: 'POST', headers: { 'X-Admin-Key': 'dev-admin' },
    });
    expect(r.status).toBe(200);
    const d = await poll(mission_id, session_key);
    expect(d.op).toBe('yield');
  });

  it('extend bumps deadline + budget', async () => {
    const { mission_id } = await bootstrap();
    const r = await SELF.fetch(`https://h/v1/admin/mission/${mission_id}/extend`, {
      method: 'POST', headers: { 'X-Admin-Key': 'dev-admin' },
      body: JSON.stringify({ extra_seconds: 3600, extra_budget_usd: 5 }),
    });
    expect(r.status).toBe(200);
  });
});
