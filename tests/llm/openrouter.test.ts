import { describe, it, expect, vi } from 'vitest';
import { openRouterCall } from '../../src/llm/openrouter';

describe('openRouterCall', () => {
  it('uses free model when tier=free and reports cost=0', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'NO_GO' } }],
      usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
    }), { status: 200 }));
    const r = await openRouterCall('k', { shape: 'sanity_check', system: 's', user: 'u' }, 'free', fetchMock as never);
    expect(r.isPaidTier).toBe(false);
    expect(r.costUsd).toBe(0);
    expect(r.model).toMatch(/free/);
  });

  it('uses paid model when tier=paid and computes cost from usage', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'GO' } }],
      usage: { total_tokens: 1000, prompt_tokens: 500, completion_tokens: 500 },
    }), { status: 200 }));
    const r = await openRouterCall('k', { shape: 'sanity_check', system: 's', user: 'u' }, 'paid', fetchMock as never);
    expect(r.isPaidTier).toBe(true);
    expect(r.costUsd).toBeGreaterThan(0);
  });
});
