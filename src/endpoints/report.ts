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
