import type { Hypothesis } from './beliefs';
import { topCandidate } from './beliefs';

export interface FeasibilityFn {
  (authMethod: string): number;
}

export const defaultFeasibility: FeasibilityFn = (m) => {
  if (m === 'ssh-keyfile') return 1.0;
  if (m === 'ssh-password') return 0.7;
  return 0.5;
};

export function confidenceToAttemptHop(
  beliefs: Record<string, Hypothesis>,
  authMethod = 'ssh-keyfile',
  feasibility: FeasibilityFn = defaultFeasibility,
): number {
  const addr = beliefs['h:target-address'];
  const cred = beliefs['h:target-credentials'];
  if (!addr || !cred) return 0;
  const topAddr = topCandidate(addr);
  const topCred = topCandidate(cred);
  if (!topAddr || !topCred) return 0;
  const contradictionPenalty = unresolvedContradictionPenalty(beliefs);
  return topAddr.posterior * topCred.posterior * feasibility(authMethod) * (1 - contradictionPenalty);
}

function unresolvedContradictionPenalty(beliefs: Record<string, Hypothesis>): number {
  const open = Object.values(beliefs).filter(h => h.critical && h.status === 'converging');
  if (open.length === 0) return 0;
  const avgRunnerUp = open
    .map(h => {
      const sorted = [...h.candidates].sort((a, b) => b.posterior - a.posterior);
      return sorted[1]?.posterior ?? 0;
    })
    .reduce((s, x) => s + x, 0) / open.length;
  return Math.min(0.5, avgRunnerUp);
}
