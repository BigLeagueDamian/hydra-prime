import type { BrainCall, BrainResponse } from './router';

const MODEL = '@cf/meta/llama-3.1-8b-instruct';

interface AIEnv {
  AI?: Ai;
  AI_MOCK?: string;
}

export async function workersAiCall(env: AIEnv, req: BrainCall): Promise<BrainResponse> {
  if (req.shape === 'sanity_check') {
    throw new Error('Workers AI 8B disallowed for sanity_check (codex §4.1 — 70B-class minimum)');
  }

  if (env.AI_MOCK === '1') {
    const stubText = `MOCK[shape=${req.shape}]: ${req.user.slice(0, 40)}`;
    return {
      provider: 'workers-ai',
      model: MODEL,
      output: stubText,
      tokensUsed: estimateTokens(req.system + req.user + stubText),
      costUsd: 0,
      isPaidTier: false,
    };
  }

  if (!env.AI) {
    throw new Error('workers-ai: AI binding not available and AI_MOCK not set');
  }

  const r = await env.AI.run(MODEL as never, {
    messages: [
      { role: 'system', content: req.system },
      { role: 'user', content: req.user },
    ],
    max_tokens: 256,
  } as never) as unknown as { response: string };
  const text = r.response ?? '';
  return {
    provider: 'workers-ai',
    model: MODEL,
    output: text,
    tokensUsed: estimateTokens(req.system + req.user + text),
    costUsd: 0,
    isPaidTier: false,
  };
}

export function estimateTokens(s: string): number {
  return Math.ceil(s.length / 4);
}
