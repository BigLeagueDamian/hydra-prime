import type { MissionState, Directive } from '../types';
import { applyObservation, newHypothesis, recomputeStatus, type Hypothesis, type HypothesisType } from './beliefs';
import { newQueue, enqueue, popHighest, type PriorityQueue } from './queue';
import { computeValue } from './value';
import { ALL_PROBES } from '../catalog/registry';
import { evaluate, type ProposedAction } from '../codex';

function hypothesisTypeFromId(id: string): HypothesisType {
  const stripped = id.startsWith('h:') ? id.slice(2) : id;
  const known: HypothesisType[] = ['target-address', 'target-credentials', 'network-path', 'auth-method', 'proxy-jump-chain'];
  return (known as string[]).includes(stripped) ? (stripped as HypothesisType) : 'target-address';
}

export function buildInitialQueue(m: MissionState): PriorityQueue {
  let q = newQueue();
  for (const p of ALL_PROBES) {
    if (!p.platforms.includes(m.platform)) continue;
    const remainingS = Math.max(1, Math.floor((m.wall_clock_deadline_ms - Date.now()) / 1000));
    const value = computeValue({
      eig: p.eigPrior, eta_s: p.wallClockEstimateS, tokenCost: p.tokenCostEstimate,
      timeRemainingS: remainingS, lambda: m.strict_gold ? 0.001 : 0.0001,
    });
    q = enqueue(q, {
      id: `q_${p.id}_${m.tick}`,
      probeId: p.id, value, eta_s: p.wallClockEstimateS,
      tokenCost: p.tokenCostEstimate,
      targetHypotheses: p.llrContributions.map(c => c.targetHypothesis),
      fallbackIds: p.fallbackProbeIds,
    });
  }
  return q;
}

export function pickAction(m: MissionState, q: PriorityQueue): { directive: Directive; queue: PriorityQueue; probeId: string | null } {
  const [top, rest] = popHighest(q);
  if (!top) {
    return { directive: { id: `op_${crypto.randomUUID().slice(0, 8)}`, op: 'yield', sleep_s: 5 }, queue: q, probeId: null };
  }
  const probe = ALL_PROBES.find(p => p.id === top.probeId)!;
  const body = probe.bodyByPlatform[m.platform];
  if (!body) {
    // Probe declared platform but missing body — skip and recurse.
    return pickAction(m, rest);
  }
  const action: ProposedAction = { type: 'exec', cmd: body };
  const decision = evaluate(action, m);
  if (!decision.allowed) {
    return pickAction(m, rest);
  }
  return {
    directive: {
      id: `op_${crypto.randomUUID().slice(0, 8)}`,
      op: 'exec', cmd: body, timeout_s: probe.wallClockEstimateS * 5,
    },
    queue: rest,
    probeId: top.probeId,
  };
}

export interface IngestPayload {
  probeId: string;
  observations: { pattern: string; extracted: { value: string }; hypothesis: string }[];
}

export function ingestObservations(beliefs: Record<string, Hypothesis>, payload: IngestPayload, tick: number): Record<string, Hypothesis> {
  const probe = ALL_PROBES.find(p => p.id === payload.probeId);
  if (!probe) return beliefs;
  const out = { ...beliefs };
  for (const obs of payload.observations) {
    const llrEntry = probe.llrContributions.find(c => c.pattern === obs.pattern && c.targetHypothesis === obs.hypothesis);
    const llr = llrEntry?.llr ?? 0;
    if (llr === 0) continue;
    const h = out[obs.hypothesis] ?? newHypothesis(obs.hypothesis, hypothesisTypeFromId(obs.hypothesis));
    out[obs.hypothesis] = recomputeStatus(applyObservation(h, {
      source_class: probe.id, note: obs.pattern,
      newCandidates: [obs.extracted.value],
      llrByCandidate: { [obs.extracted.value]: llr },
    }, tick));
  }
  return out;
}
