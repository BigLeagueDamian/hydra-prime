import type { Env } from './index';
import type { MissionState, Phase } from './types';
import type { Hypothesis } from './engine/beliefs';
import { buildInitialQueue, pickAction, ingestObservations } from './engine/tick';
import { advancePhase } from './engine/phases';
import { extractObservations } from './engine/extract';
import { ALL_PROBES } from './catalog/registry';
import { confidenceToAttemptHop } from './engine/confidence';
import { topCandidate } from './engine/beliefs';
import { distillWarmPacket } from './hop/distill';
import { enforcePreHopChecklist } from './hop/checklist';
import { composeBootstrapBundle } from './hop/bundle';
import { composeSshHopExec } from './hop/ssh';

const LEGAL: Record<Phase, Phase[]> = {
  registered: ['provisioning', 'verifying', 'failed', 'terminated'],
  provisioning: ['scanning', 'failed', 'terminated'],
  // scanning + hypothesizing CAN transition to executing-hop directly when
  // confidence-to-hop crosses threshold before strict belief convergence
  // (split credentials, time pressure, etc.). The auto-hop trigger uses
  // confidenceToAttemptHop() as the real gate; phase is advisory.
  scanning: ['hypothesizing', 'executing-hop', 'failed', 'terminated'],
  hypothesizing: ['planning', 'scanning', 'executing-hop', 'failed', 'terminated'],
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
      target_user?: string; hop_attempt_threshold?: number;
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
      executed_probes: [],
      target_user: body.target_user ?? 'root',
      hop_attempt_threshold: body.hop_attempt_threshold ?? 0.3,
      hop_attempted: false,
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

    // Auto-walk entry phases on each poll until we reach scanning. Beyond
    // scanning, advancePhase() drives transitions from belief updates.
    if (this.mission.phase === 'registered') this.mission.phase = 'provisioning';
    else if (this.mission.phase === 'provisioning') this.mission.phase = 'scanning';

    // Auto-trigger attempt_hop when beliefs have converged enough.
    // Gated by: confidence > threshold, no prior hop, valid top candidates,
    // pre-hop checklist passes. Decoupled from strict planning-phase entry
    // because credential posteriors realistically split between competing
    // keys; the explicit confidence gate is the right measure.
    const hopDirective = await this.maybeEmitHop();
    if (hopDirective) {
      this.mission.tick += 1;
      await this.state.storage.put('mission', this.mission);
      return Response.json(hopDirective);
    }

    const q = buildInitialQueue(this.mission);
    const { directive, probeId } = pickAction(this.mission, q);
    if (probeId) {
      await this.state.storage.put(`pending:${directive.id}`, { probeId });
      // Track executed probes so buildInitialQueue doesn't re-pick them next tick.
      if (!this.mission.executed_probes) this.mission.executed_probes = [];
      if (!this.mission.executed_probes.includes(probeId)) {
        this.mission.executed_probes.push(probeId);
      }
    }
    this.mission.tick += 1;
    await this.state.storage.put('mission', this.mission);
    return Response.json(directive);
  }

  private async maybeEmitHop(): Promise<{ id: string; op: 'exec'; cmd: string; timeout_s: number } | null> {
    if (!this.mission) return null;
    if (this.mission.hop_attempted) return null;
    if (this.mission.phase === 'completed' || this.mission.phase === 'failed' || this.mission.phase === 'terminated') return null;

    const threshold = this.mission.hop_attempt_threshold ?? 0.3;
    const confidence = confidenceToAttemptHop(this.mission.beliefs);
    if (confidence < threshold) return null;

    const addr = this.mission.beliefs['h:target-address'];
    const cred = this.mission.beliefs['h:target-credentials'];
    const topAddr = addr ? topCandidate(addr) : undefined;
    const topCred = cred ? topCandidate(cred) : undefined;
    if (!topAddr || !topCred) return null;

    // Validate target host appears in the operator allowlist (codex §1.1).
    if (!this.mission.target_allowlist.includes(topAddr.value)) return null;

    // Build warm packet + run pre-hop distillation checklist.
    const packet = distillWarmPacket(this.mission, {
      recentTicks: [], catalogIds: ALL_PROBES.map(p => p.id),
      codexHash: 'sha256:codex-pin-v1',
    });
    const check = enforcePreHopChecklist(packet);
    if (!check.ok) return null;  // hop blocked; mission stays in current phase

    // Compose bootstrap bundle + SSH hop exec directive.
    const bundleB64 = composeBootstrapBundle({
      hydra_sh: '#!/usr/bin/env bash\n# bootstrap placeholder (target-side script ships separately in v1)',
      masked_token_hex: 'pending-v1', salt: 'pending-v1',
      mission_id: `${this.mission.mission_id}-target`,
      warm_packet: packet,
      supervisor_url: 'https://hydra-prime-supervisor.workers.dev',
    });

    let hopDirective;
    try {
      hopDirective = composeSshHopExec({
        credsPath: topCred.value,
        targetUser: this.mission.target_user ?? 'root',
        targetHost: topAddr.value,
        bundleB64,
      });
    } catch (e) {
      // Sanitization rejected one of the inputs (probably an unsafe character
      // in the extracted credential path or target host). Don't crash the
      // mission; just skip the hop and let probes continue.
      return null;
    }

    this.mission.hop_attempted = true;
    if (this.mission.phase !== 'executing-hop') this.mission.phase = 'executing-hop';
    return hopDirective;
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
    const env = await req.json() as {
      op_id: string;
      ok: boolean;
      data?: {
        probeId?: string;
        observations?: unknown[];
        stdout?: string; stderr?: string; exit_code?: number;
      };
    };
    await this.state.storage.put(`tick:${this.mission.tick}`, env);

    if (env.ok && env.data?.probeId && Array.isArray(env.data.observations)) {
      // Path A: structured payload (engine tests, internal callers).
      this.mission.beliefs = ingestObservations(this.mission.beliefs, {
        probeId: env.data.probeId,
        observations: env.data.observations as { pattern: string; extracted: { value: string }; hypothesis: string }[],
      }, this.mission.tick);
    } else if (env.ok && env.data?.stdout) {
      // Path B: raw probe output from the script. Look up which probe was
      // dispatched for this op_id, run the manifest's regex extractors over
      // the stdout, then feed the structured observations into the engine.
      const pending = await this.state.storage.get<{ probeId: string }>(`pending:${env.op_id}`);
      if (pending?.probeId) {
        const manifest = ALL_PROBES.find(p => p.id === pending.probeId);
        if (manifest) {
          const observations = extractObservations(
            manifest,
            { stdout: env.data.stdout, stderr: env.data.stderr, exit_code: env.data.exit_code },
            this.mission.target_allowlist,
          );
          if (observations.length > 0) {
            this.mission.beliefs = ingestObservations(
              this.mission.beliefs,
              { probeId: pending.probeId, observations },
              this.mission.tick,
            );
          }
        }
        // Cleanup pending marker regardless of extraction outcome (prevents KV growth).
        await this.state.storage.delete(`pending:${env.op_id}`);
      }
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
