import type { MissionState } from '../types';
import type { Hypothesis } from '../engine/beliefs';
import { generateBrief } from '../engine/brief';

export interface WarmPacket {
  jump_chain_origin: string;
  belief_graph: Record<string, Hypothesis>;
  brief: ReturnType<typeof generateBrief>;
  recent_ticks: { tick: number; action: string; wall_ms: number }[];
  catalog_ids: string[];
  honor_tier: 'gold' | 'silver' | 'failed';
  budget_paid_usd_remaining: number;
  wall_clock_started_ms: number;
  wall_clock_deadline_ms: number;
  target_allowlist: string[];
  codex_hash: string;
}

export interface DistillContext {
  recentTicks: { tick: number; action: string; wall_ms: number }[];
  catalogIds: string[];
  codexHash: string;
}

export function distillWarmPacket(m: MissionState, ctx: DistillContext): WarmPacket {
  return {
    jump_chain_origin: m.mission_id,
    belief_graph: m.beliefs,
    brief: generateBrief(m, { lastProgressTick: m.tick, lastProgressWallS: 0 }),
    recent_ticks: ctx.recentTicks.slice(-20),
    catalog_ids: ctx.catalogIds,
    honor_tier: m.honor_tier,
    budget_paid_usd_remaining: m.budget_paid_usd_remaining,
    wall_clock_started_ms: m.wall_clock_started_ms,
    wall_clock_deadline_ms: m.wall_clock_deadline_ms,
    target_allowlist: m.target_allowlist,
    codex_hash: ctx.codexHash,
  };
}
