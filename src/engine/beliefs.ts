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
