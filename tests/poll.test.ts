import { describe, it, expect } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { signRequest } from '../src/hmac';

async function bootstrap(): Promise<{ mission_id: string; session_key: string }> {
  const start = await SELF.fetch('https://h/v1/admin/mission/start', {
    method: 'POST',
    headers: { 'X-Admin-Key': env.ADMIN_KEY ?? 'dev-admin' },
    body: JSON.stringify({
      fingerprint_expected: 'fp_p',
      target_allowlist: ['origin', 'kvm2'],
      strict_gold: false,
      budget_paid_usd: 10,
      deadline_seconds: 86_400,
    }),
  });
  const { mission_id } = await start.json() as { mission_id: string };
  const reg = await SELF.fetch('https://h/v1/register', {
    method: 'POST',
    body: JSON.stringify({ fingerprint: 'fp_p', platform: 'linux', version: '0.1.0', mission_id }),
  });
  const { session_key } = await reg.json() as { session_key: string };
  return { mission_id, session_key };
}

describe('/v1/poll', () => {
  it('returns a yield directive on first poll for a fresh mission', async () => {
    const { mission_id, session_key } = await bootstrap();
    const ts = Math.floor(Date.now() / 1000);
    const path = `/v1/poll?mission=${mission_id}`;
    const sig = await signRequest(session_key, 'GET', path, '', ts);
    const res = await SELF.fetch(`https://h${path}`, {
      headers: { 'X-Hydra-Sig': sig, 'X-Hydra-Ts': String(ts) },
    });
    expect(res.status).toBe(200);
    const directive = await res.json() as { op: string };
    expect(['exec', 'read', 'yield', 'terminate']).toContain(directive.op);
  });

  it('rejects bad signature', async () => {
    const { mission_id } = await bootstrap();
    const ts = Math.floor(Date.now() / 1000);
    const res = await SELF.fetch(`https://h/v1/poll?mission=${mission_id}`, {
      headers: { 'X-Hydra-Sig': 'deadbeef', 'X-Hydra-Ts': String(ts) },
    });
    expect(res.status).toBe(401);
  });
});
