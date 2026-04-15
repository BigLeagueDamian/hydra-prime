import type { Env } from '../index';
import { checkAdminAuth } from './admin';

export async function handlePostmortem(req: Request, env: Env, missionId: string): Promise<Response> {
  const auth = checkAdminAuth(req, env); if (auth) return auth;
  const stub = env.MISSION_DO.get(env.MISSION_DO.idFromName(missionId));
  const state = await (await stub.fetch('https://do/state')).json() as {
    phase: string; honor_tier: string; jump_chain: string[]; tick: number;
    wall_clock_started_ms: number; wall_clock_deadline_ms: number;
    budget_paid_usd_remaining: number; beliefs: Record<string, { candidates: { value: string; posterior: number }[] }>;
  };
  const log = await (await stub.fetch('https://do/log')).json() as { ticks: { tick: number; envelope: unknown }[] };

  const wallS = Math.floor((Date.now() - state.wall_clock_started_ms) / 1000);
  const beliefSummary = Object.entries(state.beliefs).map(([id, h]) => {
    const top = [...h.candidates].sort((a, b) => b.posterior - a.posterior)[0];
    return `- **${id}** — top: \`${top?.value ?? '(none)'}\` (posterior=${top?.posterior.toFixed(3) ?? 'n/a'})`;
  }).join('\n');

  const md = [
    `# Post-mortem: ${missionId}`,
    ``,
    `**Phase:** ${state.phase}  `,
    `**Honor tier:** ${state.honor_tier === 'gold' ? '🟡 gold' : state.honor_tier === 'silver' ? '⚪ silver' : '🔴 failed'}  `,
    `**Wall-clock:** ${wallS}s  `,
    `**Ticks:** ${state.tick}  `,
    `**Budget remaining:** $${state.budget_paid_usd_remaining.toFixed(2)}  `,
    `**Jump chain:** ${state.jump_chain.join(' → ')}  `,
    ``,
    `## Beliefs`,
    beliefSummary || '_no hypotheses_',
    ``,
    `## Tick log (${log.ticks.length} entries)`,
    log.ticks.slice(0, 50).map(t => `- tick ${t.tick}: \`${JSON.stringify(t.envelope).slice(0, 200)}\``).join('\n'),
    ``,
    log.ticks.length > 50 ? `_…${log.ticks.length - 50} more ticks omitted_` : '',
  ].join('\n');

  return new Response(md, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
}
