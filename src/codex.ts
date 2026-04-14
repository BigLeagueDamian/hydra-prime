import type { MissionState } from './types';

export type ActionType = 'exec' | 'read' | 'attempt_hop' | 'signal_success' | 'terminate';

export interface ProposedAction {
  type: ActionType;
  cmd?: string;
  path?: string;
  targetHost?: string;
  isMutation?: boolean;
}

export interface CodexDecision {
  allowed: boolean;
  rule?: string;
  reason?: string;
}

const FORBIDDEN_PATHS = [
  /^\/etc\/shadow$/,
  /^\/etc\/sudoers$/,
  /^\/etc\/sudoers\.d\//,
  /^\/root\//,
  /^\/var\/log\/auth\.log$/,
  /^\/var\/spool\/cron\//,
];

export function evaluate(action: ProposedAction, m: MissionState): CodexDecision {
  // §2.1 — 24h hard cap
  const now = Date.now();
  const elapsed = now - m.wall_clock_started_ms;
  if (elapsed > 86_400_000) return { allowed: false, rule: '§2.1', reason: '24h wall-clock exceeded' };

  // §2.2 — budget cap
  if (m.strict_gold && m.honor_tier !== 'gold') {
    return { allowed: false, rule: '§2.2', reason: 'strict_gold and tier crossed to paid' };
  }
  if (m.budget_paid_usd_remaining < 0) {
    return { allowed: false, rule: '§2.2', reason: 'paid budget exhausted' };
  }

  switch (action.type) {
    case 'attempt_hop': {
      if (!action.targetHost || !m.target_allowlist.includes(action.targetHost)) {
        return { allowed: false, rule: '§1.1', reason: `target ${action.targetHost} not allowlisted` };
      }
      return { allowed: true };
    }
    case 'exec': {
      if (action.isMutation) {
        return { allowed: false, rule: '§1.3', reason: 'mutation on origin denied' };
      }
      return { allowed: true };
    }
    case 'read': {
      if (action.path && FORBIDDEN_PATHS.some(re => re.test(action.path!))) {
        return { allowed: false, rule: '§1.3', reason: `path ${action.path} forbidden` };
      }
      return { allowed: true };
    }
    case 'signal_success':
    case 'terminate':
      return { allowed: true };
  }
}

export function buildPromptPrefix(m: MissionState): string {
  const remainingS = Math.max(0, Math.floor((m.wall_clock_deadline_ms - Date.now()) / 1000));
  return [
    `# CODEX (non-negotiable)`,
    `Authorized hosts: ${m.target_allowlist.join(', ')}`,
    `Forbidden: third-party exfiltration, mutation on origin (except vault writes & sanctioned SSH-out), self-persistence beyond mission.`,
    `Budget: paid_usd_remaining=${m.budget_paid_usd_remaining.toFixed(2)}, strict_gold=${m.strict_gold}, tier=${m.honor_tier}`,
    `Time remaining: ${remainingS}s`,
    `Mission: reach a target on the allowlist and submit signed success proof.`,
    `Output: respond ONLY in the requested structured format. No prose outside it.`,
    ``,
  ].join('\n');
}
