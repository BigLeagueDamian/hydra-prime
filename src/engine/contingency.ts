export type ContingencyKind = 'phase-stall' | 'hypothesis-collapse' | 'tier-exhausted' | 'budget-low' | 'brain-fallback' | 'probe-failure';

export type ContingencyAction =
  | { kind: 'force-transition'; toPhase?: string }
  | { kind: 'enqueue-tier2-probes'; targetHypothesis?: string }
  | { kind: 'compressed-strategy' }
  | { kind: 'fail-mission'; reason: string }
  | { kind: 'enqueue-fallback-probe'; probeId: string };

export function activateContingency(
  kind: ContingencyKind, ctx: Record<string, string>,
): ContingencyAction {
  switch (kind) {
    case 'phase-stall': return { kind: 'force-transition' };
    case 'hypothesis-collapse': return { kind: 'enqueue-tier2-probes', targetHypothesis: ctx.hypothesisId };
    case 'tier-exhausted': return { kind: 'fail-mission', reason: 'unreachable-exhausted' };
    case 'budget-low': return { kind: 'compressed-strategy' };
    case 'brain-fallback': return { kind: 'compressed-strategy' };
    case 'probe-failure': return { kind: 'enqueue-fallback-probe', probeId: ctx.fallbackProbeId ?? '' };
  }
}
