import { describe, it, expect, vi } from 'vitest';
import { routerCall, SanityUnavailable } from '../../src/llm/router';
import type { MissionState } from '../../src/types';

const baseMission: MissionState = {
  mission_id: 'm', origin_fingerprint: 'fp', platform: 'linux',
  phase: 'planning', honor_tier: 'gold',
  budget_paid_usd_remaining: 10, strict_gold: true,
  wall_clock_started_ms: Date.now(), wall_clock_deadline_ms: Date.now() + 86_400_000,
  tick: 0, beliefs: {}, jump_chain: ['origin'],
  target_allowlist: ['origin', 'kvm2'],
};

describe('router', () => {
  it('classify uses Workers AI', async () => {
    const aiRun = vi.fn().mockResolvedValue({ response: 'yes' });
    const r = await routerCall(
      { shape: 'classify', system: 's', user: 'u' }, baseMission,
      { ai: { run: aiRun } as never, groqKey: '', openrouterKey: '', fetch: undefined as never },
    );
    expect(r.provider).toBe('workers-ai');
    expect(aiRun).toHaveBeenCalled();
  });

  it('sanity_check tries Groq first', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'GO' } }], usage: { total_tokens: 5 },
    }), { status: 200 }));
    const r = await routerCall(
      { shape: 'sanity_check', system: 's', user: 'u' }, baseMission,
      { ai: { run: vi.fn() } as never, groqKey: 'gk', openrouterKey: 'ok', fetch: fetchMock as never },
    );
    expect(r.provider).toBe('groq');
  });

  it('sanity_check fails closed under strict_gold when free 70B exhausted', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 429 }));
    await expect(routerCall(
      { shape: 'sanity_check', system: 's', user: 'u' }, baseMission,
      { ai: { run: vi.fn() } as never, groqKey: 'gk', openrouterKey: 'ok', fetch: fetchMock as never },
    )).rejects.toBeInstanceOf(SanityUnavailable);
  });

  it('sanity_check escalates to paid when not strict_gold', async () => {
    let calls = 0;
    const fetchMock = vi.fn().mockImplementation(() => {
      calls++;
      if (calls < 3) return Promise.resolve(new Response('{}', { status: 429 }));
      return Promise.resolve(new Response(JSON.stringify({
        choices: [{ message: { content: 'GO' } }],
        usage: { total_tokens: 100, prompt_tokens: 50, completion_tokens: 50 },
      }), { status: 200 }));
    });
    const r = await routerCall(
      { shape: 'sanity_check', system: 's', user: 'u' },
      { ...baseMission, strict_gold: false },
      { ai: { run: vi.fn() } as never, groqKey: 'gk', openrouterKey: 'ok', fetch: fetchMock as never },
    );
    expect(r.isPaidTier).toBe(true);
  });
});
