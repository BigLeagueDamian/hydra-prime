import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

describe('worker smoke', () => {
  it('responds to /v1/health with 200 ok', async () => {
    const res = await SELF.fetch('https://example.com/v1/health');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });
});
