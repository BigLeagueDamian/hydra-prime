export type CallShape = 'classify' | 'extract' | 'route' | 'sanity_check';

export interface BrainCall {
  shape: CallShape;
  system: string;
  user: string;
  schema?: object;
}

export interface BrainResponse {
  provider: string;
  model: string;
  output: string;
  tokensUsed: number;
  costUsd: number;
  isPaidTier: boolean;
}

import type { MissionState } from '../types';
import { workersAiCall } from './workers-ai';
import { groqCall, RateLimited, ProviderUnavailable } from './groq';
import { openRouterCall } from './openrouter';

export interface RouterDeps {
  ai: Ai;
  groqKey: string;
  openrouterKey: string;
  fetch?: typeof fetch;
}

export class SanityUnavailable extends Error { name = 'SanityUnavailable'; }

export async function routerCall(
  req: BrainCall, m: MissionState, deps: RouterDeps,
): Promise<BrainResponse> {
  if (req.shape === 'sanity_check') return sanityChain(req, m, deps);
  return routineChain(req, m, deps);
}

async function routineChain(req: BrainCall, _m: MissionState, deps: RouterDeps): Promise<BrainResponse> {
  // Workers AI: classify/extract/route only.
  try {
    return await workersAiCall({ AI: deps.ai }, req);
  } catch (e) { /* fall through */ }
  if (deps.groqKey) {
    try { return await groqCall(deps.groqKey, req, deps.fetch); }
    catch (e) { /* fall through */ }
  }
  if (deps.openrouterKey) {
    try { return await openRouterCall(deps.openrouterKey, req, 'free', deps.fetch); }
    catch (e) { /* fall through */ }
  }
  throw new ProviderUnavailable('all routine providers exhausted');
}

async function sanityChain(req: BrainCall, m: MissionState, deps: RouterDeps): Promise<BrainResponse> {
  if (deps.groqKey) {
    try { return await groqCall(deps.groqKey, req, deps.fetch); }
    catch (e) { if (!(e instanceof RateLimited || e instanceof ProviderUnavailable)) throw e; }
  }
  if (deps.openrouterKey) {
    try { return await openRouterCall(deps.openrouterKey, req, 'free', deps.fetch); }
    catch (e) { if (!(e instanceof RateLimited || e instanceof ProviderUnavailable)) throw e; }
  }
  if (m.strict_gold) {
    throw new SanityUnavailable('strict_gold: free 70B-class exhausted, refusing 8B fallback');
  }
  if (deps.openrouterKey && m.budget_paid_usd_remaining > 0) {
    return openRouterCall(deps.openrouterKey, req, 'paid', deps.fetch);
  }
  throw new SanityUnavailable('no paid budget available for sanity_check escalation');
}
