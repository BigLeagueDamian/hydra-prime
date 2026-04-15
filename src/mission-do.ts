import type { Env } from './index';
import type { MissionState, Phase } from './types';
import type { Hypothesis } from './engine/beliefs';
import { buildInitialQueue, pickAction, ingestObservations } from './engine/tick';
import { advancePhase } from './engine/phases';

const LEGAL: Record<Phase, Phase[]> = {
  registered: ['provisioning', 'verifying', 'failed', 'terminated'],
  provisioning: ['scanning', 'failed', 'terminated'],
  scanning: ['hypothesizing', 'failed', 'terminated'],
  hypothesizing: ['planning', 'scanning', 'failed', 'terminated'],
  planning: ['executing-hop', 'hypothesizing', 'failed', 'terminated'],
  'executing-hop': ['verifying', 'planning', 'failed', 'terminated'],
  verifying: ['completed', 'failed', 'terminated'],
  completed: [],
  failed: [],
  terminated: [],
};

export class MissionDO {
  private state: DurableObjectState;
  private mission: MissionState | null = null;

  constructor(state: DurableObjectState, _env: Env) {
    this.state = state;
    this.state.blockConcurrencyWhile(async () => {
      this.mission = (await this.state.storage.get<MissionState>('mission')) ?? null;
    });
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const route = url.pathname.replace(/^\//, '');
    if (route === 'init') return this.init(req);
    if (route === 'state') return this.getState();
    if (route === 'transition') return this.transition(req);
    if (route === 'force-transition') return this.forceTransition(req);
    if (route === 'next-directive') return this.nextDirective();
    if (route === 'ingest') return this.ingest(req);
    if (route === 'rehydrate') return this.rehydrate(req);
    if (route === 'extend') return this.extend(req);
    if (route === 'log') return this.log();
    return new Response('not found', { status: 404 });
  }

  private async init(req: Request): Promise<Response> {
    if (this.mission) return new Response('already initialized', { status: 409 });
    const body = await req.json() as {
      mission_id?: string; fingerprint: string; platform: 'linux' | 'macos' | 'wsl';
      target_allowlist: string[]; strict_gold: boolean;
      budget_paid_usd: number; deadline_ms: number;
    };
    const id = body.mission_id ?? this.state.id.toString();
    this.mission = {
      mission_id: id,
      origin_fingerprint: body.fingerprint,
      platform: body.platform,
      phase: 'registered',
      honor_tier: 'gold',
      budget_paid_usd_remaining: body.budget_paid_usd,
      strict_gold: body.strict_gold,
      wall_clock_started_ms: Date.now(),
      wall_clock_deadline_ms: body.deadline_ms,
      tick: 0,
      beliefs: {} as Record<string, Hypothesis>,
      jump_chain: ['origin'],
      target_allowlist: body.target_allowlist,
    };
    await this.state.storage.put('mission', this.mission);
    return Response.json(this.mission);
  }

  private async getState(): Promise<Response> {
    if (!this.mission) return new Response('not initialized', { status: 404 });
    return Response.json(this.mission);
  }

  private async transition(req: Request): Promise<Response> {
    if (!this.mission) return new Response('not initialized', { status: 404 });
    const { to } = await req.json() as { to: Phase };
    const allowed = LEGAL[this.mission.phase];
    if (!allowed.includes(to)) {
      return new Response(`illegal: ${this.mission.phase} -> ${to}`, { status: 409 });
    }
    this.mission.phase = to;
    await this.state.storage.put('mission', this.mission);
    return Response.json(this.mission);
  }

  private async nextDirective(): Promise<Response> {
    if (!this.mission) return new Response('not initialized', { status: 404 });
    const q = buildInitialQueue(this.mission);
    const { directive, probeId } = pickAction(this.mission, q);
    if (probeId) {
      await this.state.storage.put(`pending:${directive.id}`, { probeId });
    }
    this.mission.tick += 1;
    await this.state.storage.put('mission', this.mission);
    return Response.json(directive);
  }

  private async rehydrate(req: Request): Promise<Response> {
    if (!this.mission) return new Response('not initialized', { status: 404 });
    const { packet } = await req.json() as { packet: { jump_chain_origin: string; belief_graph: Record<string, never>; budget_paid_usd_remaining: number; honor_tier: 'gold' | 'silver' | 'failed' } };
    this.mission.beliefs = packet.belief_graph;
    this.mission.budget_paid_usd_remaining = packet.budget_paid_usd_remaining;
    this.mission.honor_tier = packet.honor_tier;
    this.mission.jump_chain = [packet.jump_chain_origin, this.mission.mission_id];
    this.mission.phase = 'verifying';
    await this.state.storage.put('mission', this.mission);
    return new Response('ok');
  }

  private async ingest(req: Request): Promise<Response> {
    if (!this.mission) return new Response('not initialized', { status: 404 });
    const env = await req.json() as { op_id: string; ok: boolean; data?: { probeId?: string; observations?: unknown[] } };
    await this.state.storage.put(`tick:${this.mission.tick}`, env);
    if (env.ok && env.data?.probeId && Array.isArray(env.data.observations)) {
      this.mission.beliefs = ingestObservations(this.mission.beliefs, {
        probeId: env.data.probeId,
        observations: env.data.observations as { pattern: string; extracted: { value: string }; hypothesis: string }[],
      }, this.mission.tick);
    }
    // Phase advance based on updated beliefs.
    const nextPhase = advancePhase(this.mission);
    if (nextPhase !== this.mission.phase) {
      this.mission.phase = nextPhase;
    }
    await this.state.storage.put('mission', this.mission);
    return new Response('ok');
  }

  private async forceTransition(req: Request): Promise<Response> {
    if (!this.mission) return new Response('not initialized', { status: 404 });
    const { to } = await req.json() as { to: Phase };
    // Force transition bypasses LEGAL checks. Used only by /success endpoint
    // after proof of successful target verification.
    this.mission.phase = to;
    await this.state.storage.put('mission', this.mission);
    return Response.json(this.mission);
  }

  private async extend(req: Request): Promise<Response> {
    if (!this.mission) return new Response('not initialized', { status: 404 });
    const { extra_seconds, extra_budget_usd } = await req.json() as { extra_seconds: number; extra_budget_usd: number };
    this.mission.wall_clock_deadline_ms += extra_seconds * 1000;
    this.mission.budget_paid_usd_remaining += extra_budget_usd;
    await this.state.storage.put('mission', this.mission);
    return Response.json(this.mission);
  }

  private async log(): Promise<Response> {
    const all = await this.state.storage.list({ prefix: 'tick:' });
    const ticks: { tick: number; envelope: unknown }[] = [];
    for (const [k, v] of all.entries()) {
      ticks.push({ tick: parseInt(k.slice('tick:'.length), 10), envelope: v });
    }
    ticks.sort((a, b) => a.tick - b.tick);
    return Response.json({ ticks });
  }
}
