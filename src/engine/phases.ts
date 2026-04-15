import type { MissionState, Phase } from '../types';
import { isConverged } from './beliefs';

const STALL_THRESHOLD_MS_BY_PHASE: Record<Phase, number> = {
  registered: 60_000, provisioning: 60_000,
  scanning: 15 * 60_000, hypothesizing: 15 * 60_000,
  planning: 10 * 60_000, 'executing-hop': 5 * 60_000, verifying: 5 * 60_000,
  completed: Number.POSITIVE_INFINITY, failed: Number.POSITIVE_INFINITY, terminated: Number.POSITIVE_INFINITY,
};

export function advancePhase(m: MissionState): Phase {
  const addr = m.beliefs['h:target-address'];
  const cred = m.beliefs['h:target-credentials'];

  if (m.phase === 'scanning' && Object.keys(m.beliefs).length > 0) return 'hypothesizing';
  if (m.phase === 'hypothesizing' && addr && cred && isConverged(addr) && isConverged(cred)) return 'planning';
  return m.phase;
}

export function isStalled(phase: Phase, lastProgressMs: number, now: number = Date.now()): boolean {
  return (now - lastProgressMs) > STALL_THRESHOLD_MS_BY_PHASE[phase];
}
