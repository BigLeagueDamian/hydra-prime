import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { workersAiCall } from '../../src/llm/workers-ai';

describe('workersAiCall', () => {
  it('returns text and reports tokens=estimated, cost=0', async () => {
    const r = await workersAiCall(env as never, {
      shape: 'classify',
      system: 'You are a strict classifier.',
      user: 'Is "kvm2" a hostname?',
    });
    expect(r.provider).toBe('workers-ai');
    expect(r.model).toBe('@cf/meta/llama-3.1-8b-instruct');
    expect(r.costUsd).toBe(0);
    expect(r.isPaidTier).toBe(false);
    expect(r.output.length).toBeGreaterThan(0);
  });

  it('refuses sanity_check shape', async () => {
    await expect(workersAiCall(env as never, {
      shape: 'sanity_check', system: 's', user: 'u',
    })).rejects.toThrow(/sanity_check/);
  });
});
