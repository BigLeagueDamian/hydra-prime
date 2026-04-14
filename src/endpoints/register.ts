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
