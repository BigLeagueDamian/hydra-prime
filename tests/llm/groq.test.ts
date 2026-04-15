import { describe, it, expect, vi } from 'vitest';
import { groqCall } from '../../src/llm/groq';

describe('groqCall', () => {
  it('posts to Groq chat completions and parses response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'GO' } }],
      usage: { total_tokens: 42 },
    }), { status: 200 }));
    const r = await groqCall('test_api_key', {
      shape: 'sanity_check', system: 's', user: 'u',
    }, fetchMock as unknown as typeof fetch);
    expect(r.provider).toBe('groq');
    expect(r.model).toBe('llama-3.3-70b-versatile');
    expect(r.output).toBe('GO');
    expect(r.tokensUsed).toBe(42);
    expect(r.costUsd).toBe(0);
    expect(r.isPaidTier).toBe(false);
  });

  it('throws RateLimited on 429', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 429 }));
    await expect(groqCall('key', { shape: 'classify', system: 's', user: 'u' }, fetchMock as never))
      .rejects.toMatchObject({ name: 'RateLimited' });
  });

  it('throws on missing API key', async () => {
    await expect(groqCall('', { shape: 'classify', system: 's', user: 'u' })).rejects.toThrow(/api key/i);
  });
});
