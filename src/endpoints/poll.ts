import type { Env } from '../index';
import { verifyRequest } from '../hmac';
import { isKilled } from '../storage';

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

  if (await isKilled(env.HYDRA_KV, mission_id)) {
    return Response.json({ id: `op_term_${crypto.randomUUID().slice(0, 8)}`, op: 'terminate', reason: 'admin-kill' });
  }
  const paused = await env.HYDRA_KV.get(`pause:${mission_id}`);
  if (paused === '1') {
    return Response.json({ id: `op_yield_${crypto.randomUUID().slice(0, 8)}`, op: 'yield', sleep_s: 30 });
  }

  const id = env.MISSION_DO.idFromName(mission_id);
  const stub = env.MISSION_DO.get(id);
  return stub.fetch('https://do/next-directive', { method: 'POST' });
}
