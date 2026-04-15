import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

describe('/v1/admin/mission/start', () => {
  it('rejects without admin key', async () => {
    const res = await SELF.fetch('https://h/v1/admin/mission/start', {
      method: 'POST',
      body: JSON.stringify({
        fingerprint_expected: 'fp', target_allowlist: ['origin', 'kvm2'],
        strict_gold: true, budget_paid_usd: 10, deadline_seconds: 86_400,
      }),
    });
    expect(res.status).toBe(401);
  });

  it('starts mission with full validation', async () => {
    const res = await SELF.fetch('https://h/v1/admin/mission/start', {
      method: 'POST', headers: { 'X-Admin-Key': 'dev-admin' },
      body: JSON.stringify({
        fingerprint_expected: 'fp', target_allowlist: ['origin', 'kvm2'],
        strict_gold: true, budget_paid_usd: 10, deadline_seconds: 86_400,
      }),
    });
    expect(res.status).toBe(200);
    const j = await res.json() as { mission_id: string; allowlist: string[] };
    expect(j.mission_id).toMatch(/^m_/);
    expect(j.allowlist).toEqual(['origin', 'kvm2']);
  });

  it('rejects allowlist with shell metacharacters', async () => {
    const res = await SELF.fetch('https://h/v1/admin/mission/start', {
      method: 'POST', headers: { 'X-Admin-Key': 'dev-admin' },
      body: JSON.stringify({
        fingerprint_expected: 'fp', target_allowlist: ['origin', 'kvm2; rm -rf /'],
        strict_gold: true, budget_paid_usd: 10, deadline_seconds: 86_400,
      }),
    });
    expect(res.status).toBe(400);
  });
});
