export type DirectiveOp = 'exec' | 'read' | 'yield' | 'terminate';

export interface ExecDirective { id: string; op: 'exec'; cmd: string; timeout_s: number; }
export interface ReadDirective { id: string; op: 'read'; path: string; max_bytes: number; }
export interface YieldDirective { id: string; op: 'yield'; sleep_s: number; }
export interface TerminateDirective { id: string; op: 'terminate'; reason: string; }
export type Directive = ExecDirective | ReadDirective | YieldDirective | TerminateDirective;

export interface ReportSuccess { op_id: string; ok: true; data: Record<string, unknown>; wall_ms: number; }
export interface ReportFailure { op_id: string; ok: false; err: string; wall_ms: number; }
export type ReportEnvelope = ReportSuccess | ReportFailure;

export interface RegisterRequest {
  fingerprint: string;
  platform: 'linux' | 'macos' | 'wsl';
  version: string;
  resume_packet?: string;
}

export interface RegisterResponse {
  mission_id: string;
  session_key: string;
  poll_interval_s: number;
}

export type Phase =
  | 'registered' | 'provisioning' | 'scanning' | 'hypothesizing'
  | 'planning' | 'executing-hop' | 'verifying' | 'completed'
  | 'failed' | 'terminated';

export interface MissionState {
  mission_id: string;
  origin_fingerprint: string;
  platform: 'linux' | 'macos' | 'wsl';
  phase: Phase;
  honor_tier: 'gold' | 'silver' | 'failed';
  budget_paid_usd_remaining: number;
  strict_gold: boolean;
  wall_clock_started_ms: number;
  wall_clock_deadline_ms: number;
  tick: number;
  beliefs: Record<string, import('./engine/beliefs').Hypothesis>;
  jump_chain: string[];
  target_allowlist: string[];
  // Probe IDs that have already been executed at least once. Used by
  // buildInitialQueue to prevent the same high-EIG probe from being picked
  // every tick. Persists across ticks within a mission. Optional for backward
  // compatibility with pre-brain-wiring missions in storage; treat undefined
  // as [] at every use site.
  executed_probes?: string[];
  // SSH user for the hop attempt. Default 'root'. Operator can override at
  // admin/mission/start. v2 will infer this from ssh_config 'User' lines.
  target_user?: string;
  // Confidence floor for auto-trigger of attempt_hop. Default 0.3 (v1 dry-run
  // mode — permissive because credential posteriors realistically split when
  // multiple keys exist). Spec §7 recommends 0.85/0.75/0.6 by mode; tighten as
  // the feasibility model improves.
  hop_attempt_threshold?: number;
  // True after the supervisor has emitted exactly one attempt_hop directive
  // for this mission. Prevents poll-loop hop spam. v2 will allow N retries
  // with credential-candidate cycling.
  hop_attempted?: boolean;
}

export function isDirective(x: unknown): x is Directive {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.op !== 'string') return false;
  return ['exec', 'read', 'yield', 'terminate'].includes(o.op);
}

export function isReportEnvelope(x: unknown): x is ReportEnvelope {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  if (typeof o.op_id !== 'string' || typeof o.ok !== 'boolean' || typeof o.wall_ms !== 'number') return false;
  if (o.ok === true) return typeof o.data === 'object' && o.data !== null;
  return typeof o.err === 'string';
}

export function parseDirective(raw: string): Directive {
  const v = JSON.parse(raw);
  if (!isDirective(v)) throw new Error(`invalid directive: ${raw}`);
  return v;
}
