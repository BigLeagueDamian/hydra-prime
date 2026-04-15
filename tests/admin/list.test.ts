import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

describe('/v1/admin/missions', () => {
  it('returns list of recently started missions', async () => {
    for (let i = 0; i < 3; i++) {
      await SELF.fetch('https://h/v1/admin/mission/start', {
        method: 'POST', headers: { 'X-Admin-Key': 'dev-admin' },
        body: JSON.stringify({
          fingerprint_expected: 'fp', target_allowlist: ['origin'],
          strict_gold: true, budget_paid_usd: 10, deadline_seconds: 86_400,
        }),
      });
    }
    const res = await SELF.fetch('https://h/v1/admin/missions', { headers: { 'X-Admin-Key': 'dev-admin' } });
    expect(res.status).toBe(200);
    const j = await res.json() as { missions: { mission_id: string; phase: string; honor_tier: string }[] };
    expect(j.missions.length).toBeGreaterThanOrEqual(3);
    for (const m of j.missions) {
      expect(m.mission_id).toMatch(/^m_/);
      expect(m.phase).toBeDefined();
    }
  });
});
