/**
 * Intelligence report: summarizes what the agent has learned since a given
 * tick. Operator polls this every N seconds for a live feed of belief
 * convergence + probe activity. Format: JSON by default, or text/plain
 * when `?format=text` is set (suitable for a tail-style watch script).
 */
import type { Env } from '../index';
import { checkAdminAuth } from './admin';

interface MissionStateSlim {
  phase: string;
  honor_tier: string;
  tick: number;
  hop_attempted?: boolean;
  jump_chain: string[];
  budget_paid_usd_remaining: number;
  wall_clock_started_ms: number;
  wall_clock_deadline_ms: number;
  target_user?: string;
  hop_attempt_threshold?: number;
  executed_probes?: string[];
  beliefs: Record<string, {
    id: string; type: string; status: string;
    candidates: { value: string; posterior: number; logit: number; evidence: { tick: number; llr: number; note: string }[] }[];
  }>;
}

interface TickLogEntry {
  tick: number;
  envelope: { op_id?: string; ok?: boolean; data?: { stdout?: string; probeId?: string } };
}

export async function handleIntelligence(
  req: Request, env: Env, missionId: string,
): Promise<Response> {
  const auth = checkAdminAuth(req, env); if (auth) return auth;
  const url = new URL(req.url);
  const sinceTick = parseInt(url.searchParams.get('since_tick') ?? '0', 10);
  const format = url.searchParams.get('format') ?? 'json';

  const stub = env.MISSION_DO.get(env.MISSION_DO.idFromName(missionId));
  const stateRes = await stub.fetch('https://do/state');
  if (stateRes.status !== 200) return new Response('mission not found', { status: 404 });
  const state = await stateRes.json() as MissionStateSlim;
  const log = await (await stub.fetch('https://do/log')).json() as { ticks: TickLogEntry[] };

  const newTicks = log.ticks.filter(t => t.tick > sinceTick);
  const report = buildReport(state, newTicks, sinceTick, missionId);

  if (format === 'text') {
    return new Response(renderText(report), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  return Response.json(report);
}

interface IntelligenceReport {
  mission_id: string;
  phase: string;
  honor_tier: string;
  current_tick: number;
  since_tick: number;
  new_ticks_count: number;
  wall_clock_s: number;
  time_remaining_s: number;
  hop_attempted: boolean;
  jump_chain: string[];
  executed_probes: string[];
  hypotheses: HypothesisSummary[];
  recent_observations: ObservationSummary[];
  recent_probe_executions: ProbeExecSummary[];
  // Computed at request time so the caller sees fresh numbers.
  hop_confidence_estimate: number;
}

interface HypothesisSummary {
  id: string;
  status: string;
  top: { value: string; posterior: number } | null;
  runner_up: { value: string; posterior: number } | null;
  candidate_count: number;
  recent_evidence: { tick: number; value: string; llr: number; note: string }[];
}

interface ObservationSummary {
  tick: number;
  probe_id: string;
  hypothesis: string;
  value: string;
  llr: number;
}

interface ProbeExecSummary {
  tick: number;
  probe_id: string;
  ok: boolean;
  bytes: number;
  was_hop: boolean;
}

function buildReport(state: MissionStateSlim, newTicks: TickLogEntry[], sinceTick: number, missionId: string): IntelligenceReport {
  const hypotheses: HypothesisSummary[] = Object.entries(state.beliefs).map(([id, h]) => {
    const sorted = [...h.candidates].sort((a, b) => b.posterior - a.posterior);
    const top = sorted[0] ? { value: sorted[0].value, posterior: sorted[0].posterior } : null;
    const runner = sorted[1] ? { value: sorted[1].value, posterior: sorted[1].posterior } : null;
    const recentEvidence = sorted.flatMap(c => c.evidence.filter(e => e.tick > sinceTick).map(e => ({ tick: e.tick, value: c.value, llr: e.llr, note: e.note })));
    return {
      id, status: h.status, top, runner_up: runner,
      candidate_count: h.candidates.length,
      recent_evidence: recentEvidence.slice(-10),
    };
  });

  const recentObs: ObservationSummary[] = [];
  const recentExec: ProbeExecSummary[] = [];
  for (const t of newTicks) {
    const env = t.envelope ?? {};
    const stdout = env.data?.stdout ?? '';
    const opId = env.op_id ?? '';
    const wasHop = opId.startsWith('op_hop_');
    recentExec.push({
      tick: t.tick, probe_id: env.data?.probeId ?? (wasHop ? '(hop)' : '(unknown)'),
      ok: env.ok ?? false, bytes: stdout.length, was_hop: wasHop,
    });
  }

  // Pull recent observations from hypothesis evidence trail (ground truth).
  for (const h of hypotheses) {
    for (const e of h.recent_evidence) {
      recentObs.push({ tick: e.tick, probe_id: e.note, hypothesis: h.id, value: e.value, llr: e.llr });
    }
  }
  recentObs.sort((a, b) => b.tick - a.tick);

  // Hop confidence: addr × cred × feasibility × (1 - contradictionPenalty).
  const addr = state.beliefs['h:target-address'];
  const cred = state.beliefs['h:target-credentials'];
  const topAddr = addr ? [...addr.candidates].sort((a, b) => b.posterior - a.posterior)[0] : null;
  const topCred = cred ? [...cred.candidates].sort((a, b) => b.posterior - a.posterior)[0] : null;
  const openCriticals = Object.values(state.beliefs).filter(h => h.status === 'converging');
  const avgRunnerUp = openCriticals.length === 0 ? 0 :
    openCriticals.map(h => {
      const s = [...h.candidates].sort((a, b) => b.posterior - a.posterior);
      return s[1]?.posterior ?? 0;
    }).reduce((s, x) => s + x, 0) / openCriticals.length;
  const penalty = Math.min(0.5, avgRunnerUp);
  const hopConf = topAddr && topCred ? topAddr.posterior * topCred.posterior * 1.0 * (1 - penalty) : 0;

  return {
    mission_id: missionId,
    phase: state.phase,
    honor_tier: state.honor_tier,
    current_tick: state.tick,
    since_tick: sinceTick,
    new_ticks_count: newTicks.length,
    wall_clock_s: Math.floor((Date.now() - state.wall_clock_started_ms) / 1000),
    time_remaining_s: Math.max(0, Math.floor((state.wall_clock_deadline_ms - Date.now()) / 1000)),
    hop_attempted: !!state.hop_attempted,
    jump_chain: state.jump_chain,
    executed_probes: state.executed_probes ?? [],
    hypotheses,
    recent_observations: recentObs.slice(0, 20),
    recent_probe_executions: recentExec.slice(-20),
    hop_confidence_estimate: hopConf,
  };
}

function renderText(r: IntelligenceReport): string {
  const tierEmoji = r.honor_tier === 'gold' ? '🟡' : r.honor_tier === 'silver' ? '⚪' : '🔴';
  const lines: string[] = [
    `=== INTELLIGENCE REPORT ===`,
    `mission       ${r.mission_id}`,
    `phase         ${r.phase}    tier ${tierEmoji} ${r.honor_tier}`,
    `tick          ${r.current_tick}    new since last: ${r.new_ticks_count}`,
    `wall          ${r.wall_clock_s}s elapsed / ${r.time_remaining_s}s remaining`,
    `jump_chain    ${r.jump_chain.join(' → ')}`,
    `hop_attempted ${r.hop_attempted}    hop_confidence ${r.hop_confidence_estimate.toFixed(3)}`,
    `executed      ${r.executed_probes.length} probes: ${r.executed_probes.join(', ')}`,
    ``,
    `--- HYPOTHESES ---`,
  ];
  for (const h of r.hypotheses) {
    lines.push(`  ${h.id} [${h.status}]  candidates: ${h.candidate_count}`);
    if (h.top) lines.push(`    top:       ${h.top.value} @ ${h.top.posterior.toFixed(3)}`);
    if (h.runner_up) lines.push(`    runner-up: ${h.runner_up.value} @ ${h.runner_up.posterior.toFixed(3)}`);
    for (const e of h.recent_evidence.slice(-3)) {
      lines.push(`    + tick ${e.tick}: ${e.note} → ${e.value} (llr ${e.llr.toFixed(2)})`);
    }
  }
  lines.push(``, `--- NEW OBSERVATIONS THIS BATCH (${r.recent_observations.length}) ---`);
  for (const o of r.recent_observations.slice(0, 10)) {
    lines.push(`  tick ${o.tick}: [${o.probe_id}] ${o.hypothesis} ← ${o.value} (llr ${o.llr.toFixed(2)})`);
  }
  lines.push(``, `--- RECENT PROBE EXECUTIONS ---`);
  for (const e of r.recent_probe_executions.slice(-10)) {
    const tag = e.was_hop ? '🐉 HOP' : (e.ok ? '✓' : '✗');
    lines.push(`  tick ${e.tick}: ${tag} ${e.probe_id} (${e.bytes}b)`);
  }
  return lines.join('\n');
}
