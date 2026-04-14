import type { MissionState } from '../types';
import { topCandidate, isConverged } from './beliefs';
import { confidenceToAttemptHop } from './confidence';

export interface MissionBrief {
  goal: string;
  time_remaining_s: number;
  budget_remaining: { paid_usd: number; tier_status: 'gold' | 'silver' | 'failed' };
  current_best_path: {
    address_hypothesis: { candidate: string; posterior: number };
    credential_hypothesis: { candidate: string; posterior: number };
    auth_method: string;
    confidence_to_attempt_hop: number;
  } | null;
  gap_to_success: string[];
  last_progress_wall_s: number;
}

export interface BriefContext {
  lastProgressTick: number;
  lastProgressWallS: number;
}

export function generateBrief(m: MissionState, ctx: BriefContext): MissionBrief {
  const remainingS = Math.max(0, Math.floor((m.wall_clock_deadline_ms - Date.now()) / 1000));
  const addr = m.beliefs['h:target-address'];
  const cred = m.beliefs['h:target-credentials'];
  let path: MissionBrief['current_best_path'] = null;
  if (addr && cred) {
    const tA = topCandidate(addr); const tC = topCandidate(cred);
    if (tA && tC) {
      path = {
        address_hypothesis: { candidate: tA.value, posterior: tA.posterior },
        credential_hypothesis: { candidate: tC.value, posterior: tC.posterior },
        auth_method: 'ssh-keyfile',
        confidence_to_attempt_hop: confidenceToAttemptHop(m.beliefs),
      };
    }
  }
  const gaps: string[] = [];
  for (const h of Object.values(m.beliefs)) {
    if (h.critical && !isConverged(h)) {
      const top = topCandidate(h);
      gaps.push(`resolve ${h.id} (top posterior=${top?.posterior.toFixed(2) ?? 'n/a'})`);
    }
  }
  return {
    goal: `reach ${m.target_allowlist.filter(t => t !== 'origin').join(' or ')} and signal_success from it`,
    time_remaining_s: remainingS,
    budget_remaining: { paid_usd: m.budget_paid_usd_remaining, tier_status: m.honor_tier },
    current_best_path: path,
    gap_to_success: gaps,
    last_progress_wall_s: ctx.lastProgressWallS,
  };
}
