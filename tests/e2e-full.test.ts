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

    // Drive 8 ticks with synthetic strong-signal observations.
    for (let i = 0; i < 8; i++) {
      const d = await poll(mission_id, session_key);
      if (d.op !== 'exec') { await report(mission_id, session_key, d.id, {}); continue; }
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
