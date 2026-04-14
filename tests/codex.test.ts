import { describe, it, expect } from 'vitest';
import { evaluate, buildPromptPrefix } from '../src/codex';
import type { MissionState } from '../src/types';

const now = Date.now();
const baseMission: MissionState = {
  mission_id: 'm1', origin_fingerprint: 'fp', platform: 'linux',
  phase: 'scanning', honor_tier: 'gold',
  budget_paid_usd_remaining: 10, strict_gold: false,
  wall_clock_started_ms: now, wall_clock_deadline_ms: now + 86_400_000,
  tick: 0, beliefs: {}, jump_chain: ['origin'],
  target_allowlist: ['origin', 'kvm2', 'kvm4'],
};

describe('codex pre-action gate', () => {
  it('allows read inside HYDRA_HOME-relative paths', () => {
    expect(evaluate({ type: 'read', path: '/home/user/.ssh/config' }, baseMission).allowed).toBe(true);
  });

  it('blocks attempt_hop to non-allowlisted host (§1.1)', () => {
    const d = evaluate({ type: 'attempt_hop', targetHost: 'evil.example.com' }, baseMission);
    expect(d.allowed).toBe(false);
    expect(d.rule).toBe('§1.1');
  });

  it('allows attempt_hop to allowlisted host', () => {
    expect(evaluate({ type: 'attempt_hop', targetHost: 'kvm2' }, baseMission).allowed).toBe(true);
  });

  it('blocks mutation on origin (§1.3)', () => {
    const d = evaluate({ type: 'exec', cmd: 'rm /etc/passwd', isMutation: true }, baseMission);
    expect(d.allowed).toBe(false);
    expect(d.rule).toBe('§1.3');
  });

  it('blocks any action when wall-clock exceeded (§2.1)', () => {
    const m = { ...baseMission, wall_clock_started_ms: now - 86_400_001 };
    const d = evaluate({ type: 'exec', cmd: 'ls' }, m);
    expect(d.allowed).toBe(false);
    expect(d.rule).toBe('§2.1');
  });

  it('blocks budget exhaustion under strict_gold (§2.2)', () => {
    const m = { ...baseMission, strict_gold: true, budget_paid_usd_remaining: 0, honor_tier: 'silver' as const };
    const d = evaluate({ type: 'exec', cmd: 'ls' }, m);
    expect(d.allowed).toBe(false);
    expect(d.rule).toBe('§2.2');
  });
});

describe('prompt prefix', () => {
  it('includes allowlist and budget state', () => {
    const prefix = buildPromptPrefix(baseMission);
    expect(prefix).toContain('CODEX');
    expect(prefix).toContain('kvm2');
    expect(prefix).toContain('Budget');
  });
});
