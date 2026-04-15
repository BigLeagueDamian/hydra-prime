import type { Env } from '../index';
import { verifyRequest } from '../hmac';
import { generateKeypair, signSuccessCert } from '../proof/sign';
import type { Phase } from '../types';

export async function handleSuccess(req: Request, env: Env): Promise<Response> {
  const raw = await req.text();
  const body = JSON.parse(raw) as {
    mission_id: string; target_fingerprint: string;
    target_evidence: object; jump_chain: string[];
  };
  const session_key = await env.HYDRA_KV.get(`session:${body.mission_id}`);
  if (!session_key) return new Response('no session', { status: 401 });
  const sig = req.headers.get('X-Hydra-Sig') ?? '';
  const ts = parseInt(req.headers.get('X-Hydra-Ts') ?? '0', 10);
  if (!await verifyRequest(session_key, 'POST', '/v1/success', raw, ts, sig)) {
    return new Response('bad sig', { status: 401 });
  }

  const stub = env.MISSION_DO.get(env.MISSION_DO.idFromName(body.mission_id));
  const state = await (await stub.fetch('https://do/state')).json() as {
    origin_fingerprint: string; jump_chain: string[]; mission_id: string;
  };
  if (state.origin_fingerprint !== body.target_fingerprint) {
    return new Response('fingerprint mismatch on success', { status: 403 });
  }

  // v1: ephemeral keypair per process. Production: load from Wrangler secret SIGNING_KEY (deferred).
  const { privateKey } = await generateKeypair();
  const cert = await signSuccessCert(privateKey, {
    mission_id_origin: state.jump_chain[0]!,
    mission_id_target: body.mission_id,
    target_fingerprint: body.target_fingerprint,
    jump_chain: state.jump_chain,
    issued_at_ms: Date.now(),
  });

  await stub.fetch('https://do/force-transition', {
    method: 'POST',
    body: JSON.stringify({ to: 'completed' as Phase }),
  });

  return Response.json({
    cert,
    terminate: {
      id: `op_term_${crypto.randomUUID().slice(0, 8)}`,
      op: 'terminate',
      reason: 'mission-complete',
    },
  });
}
