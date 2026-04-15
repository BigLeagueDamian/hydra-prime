import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

describe('/v1/admin/scoreboard', () => {
  it('returns HTML with Mission table', async () => {
    await SELF.fetch('https://h/v1/admin/mission/start', {
      method: 'POST', headers: { 'X-Admin-Key': 'dev-admin' },
      body: JSON.stringify({
        fingerprint_expected: 'fp', target_allowlist: ['origin'],
        strict_gold: true, budget_paid_usd: 10, deadline_seconds: 86_400,
      }),
    });
    const res = await SELF.fetch('https://h/v1/admin/scoreboard', { headers: { 'X-Admin-Key': 'dev-admin' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    const html = await res.text();
    expect(html).toContain('<table');
    expect(html).toMatch(/m_/);
  });
});
