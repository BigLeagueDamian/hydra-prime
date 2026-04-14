import type { BrainCall, BrainResponse } from './router';
import { RateLimited, ProviderUnavailable } from './groq';

const URL = 'https://openrouter.ai/api/v1/chat/completions';

const FREE_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';
const PAID_MODEL = 'anthropic/claude-3.5-sonnet';
const PAID_PRICE_PROMPT_USD_PER_K = 0.003;
const PAID_PRICE_COMPLETION_USD_PER_K = 0.015;

export async function openRouterCall(
  apiKey: string,
  req: BrainCall,
  tier: 'free' | 'paid',
  fetchImpl: typeof fetch = fetch,
): Promise<BrainResponse> {
  if (!apiKey) throw new Error('openrouter: api key required');
  const model = tier === 'free' ? FREE_MODEL : PAID_MODEL;
  const res = await fetchImpl(URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: req.system }, { role: 'user', content: req.user }],
      max_tokens: 512,
      temperature: 0.1,
    }),
  });
  if (res.status === 429) throw new RateLimited('openrouter rate limited');
  if (!res.ok) throw new ProviderUnavailable(`openrouter ${res.status}`);
  const j = await res.json() as {
    choices: { message: { content: string } }[];
    usage: { total_tokens: number; prompt_tokens?: number; completion_tokens?: number };
  };
  let costUsd = 0;
  if (tier === 'paid') {
    const p = j.usage.prompt_tokens ?? 0;
    const c = j.usage.completion_tokens ?? 0;
    costUsd = (p / 1000) * PAID_PRICE_PROMPT_USD_PER_K + (c / 1000) * PAID_PRICE_COMPLETION_USD_PER_K;
  }
  return {
    provider: 'openrouter',
    model,
    output: j.choices[0]?.message.content ?? '',
    tokensUsed: j.usage.total_tokens,
    costUsd,
    isPaidTier: tier === 'paid',
  };
}
