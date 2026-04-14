export type HypothesisType =
  | 'target-address' | 'target-credentials' | 'network-path'
  | 'auth-method' | 'proxy-jump-chain';

export type HypothesisStatus = 'open' | 'converging' | 'converged' | 'collapsed';

export interface Evidence {
  note: string;
  source_class: string;
  llr: number;
  tick: number;
}

export interface Candidate {
  value: string;
  logit: number;
  posterior: number;
  evidence: Evidence[];
  last_update_tick: number;
}

export interface Hypothesis {
  id: string;
  type: HypothesisType;
  critical: boolean;
  candidates: Candidate[];
  status: HypothesisStatus;
  collapseThreshold: number;
  convergeThreshold: number;
  collapsePlan: string;
}

export function newHypothesis(id: string, type: HypothesisType, critical = true): Hypothesis {
  return {
    id, type, critical,
    candidates: [],
    status: 'open',
    collapseThreshold: 0.2,
    convergeThreshold: 0.9,
    collapsePlan: 'enqueue-tier2-probes',
  };
}

export function addCandidate(h: Hypothesis, value: string, logit: number): Hypothesis {
  if (h.candidates.find(c => c.value === value)) return h;
  return {
    ...h,
    candidates: [
      ...h.candidates,
      { value, logit, posterior: 0, evidence: [], last_update_tick: 0 },
    ],
  };
}

export function getCandidate(h: Hypothesis, value: string): Candidate | undefined {
  return h.candidates.find(c => c.value === value);
}

export function topCandidate(h: Hypothesis): Candidate | undefined {
  if (h.candidates.length === 0) return undefined;
  return [...h.candidates].sort((a, b) => b.posterior - a.posterior)[0];
}

export function softmaxPosteriors(h: Hypothesis): Hypothesis {
  if (h.candidates.length === 0) return h;
  const maxLogit = Math.max(...h.candidates.map(c => c.logit));
  const exps = h.candidates.map(c => Math.exp(c.logit - maxLogit));
  const sum = exps.reduce((s, x) => s + x, 0);
  return {
    ...h,
    candidates: h.candidates.map((c, i) => ({ ...c, posterior: exps[i]! / sum })),
  };
}

export interface Observation {
  source_class: string;
  note: string;
  newCandidates: string[];
  llrByCandidate: Record<string, number>;
}

export function applyObservation(h: Hypothesis, obs: Observation, tick: number): Hypothesis {
  const startingLogit = Math.log(0.05 / 0.95);
  let next = h;
  for (const v of obs.newCandidates) {
    next = addCandidate(next, v, startingLogit);
  }
  next = {
    ...next,
    candidates: next.candidates.map(c => {
      const llr = obs.llrByCandidate[c.value] ?? 0;
      if (llr === 0) return c;
      return {
        ...c,
        logit: c.logit + llr,
        last_update_tick: tick,
        evidence: [...c.evidence, { note: obs.note, source_class: obs.source_class, llr, tick }],
      };
    }),
  };
  return softmaxPosteriors(next);
}

export function isConverged(h: Hypothesis): boolean {
  const top = topCandidate(h);
  return !!top && top.posterior > h.convergeThreshold;
}

export function isCollapsed(h: Hypothesis): boolean {
  const top = topCandidate(h);
  return !!top && top.posterior < h.collapseThreshold;
}

export function isThrashing(h: Hypothesis, recentTicks: number): boolean {
  const top = topCandidate(h);
  if (!top) return false;
  const recent = top.evidence.filter(e => e.tick > 0).slice(-recentTicks);
  let flips = 0;
  let prevSign = 0;
  for (const e of recent) {
    const sign = Math.sign(e.llr);
    if (sign !== 0 && prevSign !== 0 && sign !== prevSign) flips++;
    if (sign !== 0) prevSign = sign;
  }
  return flips >= 2;
}

export function recomputeStatus(h: Hypothesis): Hypothesis {
  if (isConverged(h)) return { ...h, status: 'converged' };
  if (isCollapsed(h)) return { ...h, status: 'collapsed' };
  if (h.candidates.length > 0) return { ...h, status: 'converging' };
  return { ...h, status: 'open' };
}
