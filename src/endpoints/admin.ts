import type { Env } from '../index';
import { putKillFlag } from '../storage';

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
    target_user?: string;
    hop_attempt_threshold?: number;
  };
  if (body.target_user && !/^[A-Za-z_][A-Za-z0-9_-]*$/.test(body.target_user)) {
    return new Response(`unsafe target_user: ${body.target_user}`, { status: 400 });
  }
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
      mission_id,  // explicit mission_id (Task 39 fix carryover)
      fingerprint: body.fingerprint_expected,
      platform: body.platform ?? 'linux',
      target_allowlist: body.target_allowlist,
      strict_gold: body.strict_gold,
      budget_paid_usd: body.budget_paid_usd,
      deadline_ms: Date.now() + body.deadline_seconds * 1000,
      target_user: body.target_user,
      hop_attempt_threshold: body.hop_attempt_threshold,
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

export async function handleAdminLog(req: Request, env: Env, missionId: string): Promise<Response> {
  const auth = checkAdminAuth(req, env); if (auth) return auth;
  const stub = env.MISSION_DO.get(env.MISSION_DO.idFromName(missionId));
  return stub.fetch('https://do/log');
}

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
