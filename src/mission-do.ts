import type { Env } from './index';
import type { MissionState, Phase } from './types';
import type { Hypothesis } from './engine/beliefs';
import { buildInitialQueue, pickAction, ingestObservations } from './engine/tick';

const LEGAL: Record<Phase, Phase[]> = {
  registered: ['provisioning', 'failed', 'terminated'],
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
    if (route === 'next-directive') return this.nextDirective();
    if (route === 'ingest') return this.ingest(req);
    return new Response('not found', { status: 404 });
  }

  private async init(req: Request): Promise<Response> {
    if (this.mission) return new Response('already initialized', { status: 409 });
    const body = await req.json() as {
      fingerprint: string; platform: 'linux' | 'macos' | 'wsl';
      target_allowlist: string[]; strict_gold: boolean;
      budget_paid_usd: number; deadline_ms: number;
    };
    const id = this.state.id.toString();
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
    await this.state.storage.put('mission', this.mission);
    return new Response('ok');
  }
}
