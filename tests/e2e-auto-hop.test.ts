/**
 * E2E test for the auto-attempt_hop trigger (the last v1.0 deferred item).
 *
 * Drives a mission past confidence threshold, then asserts the next poll
 * returns an exec directive containing `ssh ...` (the composed hop), the
 * mission has flipped phase to 'executing-hop', and hop_attempted=true.
 *
 * Subsequent polls must NOT emit another hop directive (single-attempt).
 */
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

async function reportRaw(mission_id: string, session_key: string, op_id: string, stdout: string) {
  const body = JSON.stringify({
    mission_id, op_id, ok: true,
    data: { stdout, stderr: '', exit_code: 0, wall_ms: 4 },
    wall_ms: 4,
  });
  const ts = Math.floor(Date.now() / 1000);
  const sig = await signRequest(session_key, 'POST', '/v1/report', body, ts);
  return SELF.fetch('https://h/v1/report', {
    method: 'POST',
    headers: { 'X-Hydra-Sig': sig, 'X-Hydra-Ts': String(ts), 'Content-Type': 'application/json' },
    body,
  });
}

describe('auto attempt_hop e2e', () => {
  it('emits hop directive after convergence, exactly once', async () => {
    await seedCatalog(env.HYDRA_KV);

    const start = await SELF.fetch('https://h/v1/admin/mission/start', {
      method: 'POST', headers: { 'X-Admin-Key': 'dev-admin' },
      body: JSON.stringify({
        fingerprint_expected: 'fp_hop', target_allowlist: ['origin', 'kvm2'],
        strict_gold: true, budget_paid_usd: 10, deadline_seconds: 86_400,
        target_user: 'root', hop_attempt_threshold: 0.3,
      }),
    });
    const { mission_id } = await start.json() as { mission_id: string };
    const reg = await SELF.fetch('https://h/v1/register', {
      method: 'POST',
      body: JSON.stringify({ mission_id, fingerprint: 'fp_hop', platform: 'linux', version: '0.1.0' }),
    });
    const { session_key } = await reg.json() as { session_key: string };

    const sshConfigStdout = `Host kvm2
  HostName 72.61.65.34
  User root
  IdentityFile /home/ajay/.ssh/kvm2_ed25519
  IdentitiesOnly yes`;
    const knownHostsStdout = `kvm2\n72.61.65.34\nother.example.com`;
    const privateKeyStdout = `id_ed25519\nkvm2_ed25519\nPRIVKEY:/home/ajay/.ssh/kvm2_ed25519`;
    const stdouts: Array<[RegExp, string]> = [
      [/ssh\/config|ssh_config/, sshConfigStdout],
      [/known_hosts/, knownHostsStdout],
      [/PRIVATE\*KEY|id_ed25519/, privateKeyStdout],
    ];

    let hopDirective: { id: string; op: string; cmd?: string } | null = null;
    let hopCount = 0;
    for (let i = 0; i < 12 && hopCount < 2; i++) {
      const d = await poll(mission_id, session_key);
      if (d.op === 'exec' && d.cmd?.startsWith('ssh ')) {
        hopCount++;
        if (!hopDirective) hopDirective = d;
        // Don't report this — it's a hop directive, not a probe directive.
        continue;
      }
      if (d.op !== 'exec') continue;
      const cmd = d.cmd ?? '';
      const matched = stdouts.find(([re]) => re.test(cmd));
      await reportRaw(mission_id, session_key, d.id, matched?.[1] ?? '');
    }

    // Hop directive emitted exactly once.
    expect(hopCount).toBe(1);
    expect(hopDirective).not.toBeNull();
    expect(hopDirective!.cmd).toMatch(/ssh /);
    expect(hopDirective!.cmd).toContain('root@kvm2');
    expect(hopDirective!.cmd).toContain('/home/ajay/.ssh/kvm2_ed25519');
    expect(hopDirective!.cmd).toContain('StrictHostKeyChecking=accept-new');

    // Mission state flipped to executing-hop and hop_attempted=true.
    const stub = env.MISSION_DO.get(env.MISSION_DO.idFromName(mission_id));
    const state = await (await stub.fetch('https://do/state')).json() as {
      phase: string; hop_attempted?: boolean; target_user?: string;
    };
    expect(state.phase).toBe('executing-hop');
    expect(state.hop_attempted).toBe(true);
    expect(state.target_user).toBe('root');
  });
});
