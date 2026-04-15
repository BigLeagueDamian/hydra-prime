import { describe, it, expect } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { putKillFlag } from '../src/storage';

async function startMission(): Promise<string> {
  const res = await SELF.fetch('https://h/v1/admin/mission/start', {
    method: 'POST',
    headers: { 'X-Admin-Key': env.ADMIN_KEY ?? 'dev-admin' },
    body: JSON.stringify({
      fingerprint_expected: 'fp_origin',
      target_allowlist: ['origin', 'kvm2'],
      strict_gold: false,
      budget_paid_usd: 10,
      deadline_seconds: 86_400,
    }),
  });
  const body = await res.json() as { mission_id: string };
  return body.mission_id;
}

describe('/v1/register', () => {
  it('issues mission_id + session_key for matching fingerprint', async () => {
    const mission_id = await startMission();
    const res = await SELF.fetch('https://h/v1/register', {
      method: 'POST',
      body: JSON.stringify({ fingerprint: 'fp_origin', platform: 'linux', version: '0.1.0', mission_id }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { mission_id: string; session_key: string; poll_interval_s: number };
    expect(body.mission_id).toBe(mission_id);
    expect(body.session_key.length).toBeGreaterThan(20);
    expect(body.poll_interval_s).toBeGreaterThan(0);
  });

  it('refuses on fingerprint mismatch', async () => {
    const mission_id = await startMission();
    const res = await SELF.fetch('https://h/v1/register', {
      method: 'POST',
      body: JSON.stringify({ fingerprint: 'fp_wrong', platform: 'linux', version: '0.1.0', mission_id }),
    });
    expect(res.status).toBe(403);
  });

  it('refuses if mission killed', async () => {
    const mission_id = await startMission();
    await putKillFlag(env.HYDRA_KV, mission_id);
    const res = await SELF.fetch('https://h/v1/register', {
      method: 'POST',
      body: JSON.stringify({ fingerprint: 'fp_origin', platform: 'linux', version: '0.1.0', mission_id }),
    });
    expect(res.status).toBe(410);
  });
});
