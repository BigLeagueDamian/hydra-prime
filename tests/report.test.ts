import { describe, it, expect } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { signRequest } from '../src/hmac';

async function bootstrap(): Promise<{ mission_id: string; session_key: string }> {
  const start = await SELF.fetch('https://h/v1/admin/mission/start', {
    method: 'POST',
    headers: { 'X-Admin-Key': env.ADMIN_KEY ?? 'dev-admin' },
    body: JSON.stringify({
      fingerprint_expected: 'fp_r',
      target_allowlist: ['origin'],
      strict_gold: false,
      budget_paid_usd: 10,
      deadline_seconds: 86_400,
    }),
  });
  const { mission_id } = await start.json() as { mission_id: string };
  const reg = await SELF.fetch('https://h/v1/register', {
    method: 'POST',
    body: JSON.stringify({ fingerprint: 'fp_r', platform: 'linux', version: '0.1.0', mission_id }),
  });
  const { session_key } = await reg.json() as { session_key: string };
  return { mission_id, session_key };
}

describe('/v1/report', () => {
  it('accepts a valid report envelope', async () => {
    const { mission_id, session_key } = await bootstrap();
    const body = JSON.stringify({ mission_id, op_id: 'op_x', ok: true, data: { stdout: 'hi' }, wall_ms: 4 });
    const ts = Math.floor(Date.now() / 1000);
    const sig = await signRequest(session_key, 'POST', '/v1/report', body, ts);
    const res = await SELF.fetch('https://h/v1/report', {
      method: 'POST',
      headers: { 'X-Hydra-Sig': sig, 'X-Hydra-Ts': String(ts), 'Content-Type': 'application/json' },
      body,
    });
    expect(res.status).toBe(200);
  });

  it('rejects malformed envelope', async () => {
    const { mission_id, session_key } = await bootstrap();
    const body = JSON.stringify({ mission_id, garbage: true });
    const ts = Math.floor(Date.now() / 1000);
    const sig = await signRequest(session_key, 'POST', '/v1/report', body, ts);
    const res = await SELF.fetch('https://h/v1/report', {
      method: 'POST',
      headers: { 'X-Hydra-Sig': sig, 'X-Hydra-Ts': String(ts), 'Content-Type': 'application/json' },
      body,
    });
    expect(res.status).toBe(400);
  });
});
