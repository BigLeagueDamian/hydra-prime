import type { BrainCall, BrainResponse } from './router';

const MODEL = 'llama-3.3-70b-versatile';
const URL = 'https://api.groq.com/openai/v1/chat/completions';

export class RateLimited extends Error { name = 'RateLimited'; }
export class ProviderUnavailable extends Error { name = 'ProviderUnavailable'; }

export async function groqCall(
  apiKey: string,
  req: BrainCall,
  fetchImpl: typeof fetch = fetch,
): Promise<BrainResponse> {
  if (!apiKey) throw new Error('groq: api key required');
  const res = await fetchImpl(URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
      max_tokens: 512,
      temperature: 0.1,
    }),
  });
  if (res.status === 429) throw new RateLimited('groq rate limited');
  if (!res.ok) throw new ProviderUnavailable(`groq ${res.status}`);
  const j = await res.json() as { choices: { message: { content: string } }[]; usage?: { total_tokens?: number } };
  return {
    provider: 'groq',
    model: MODEL,
    output: j.choices[0]?.message.content ?? '',
    tokensUsed: j.usage?.total_tokens ?? 0,
    costUsd: 0,
    isPaidTier: false,
  };
}
