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
      mission_id,  // explicit mission_id (Task 39 fix carryover)
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
