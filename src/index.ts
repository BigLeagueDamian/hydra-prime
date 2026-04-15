import { handleRegister } from './endpoints/register';
import { handlePoll } from './endpoints/poll';
import { handleReport } from './endpoints/report';
import { handleSuccess } from './endpoints/success';
export { MissionDO } from './mission-do';

export interface Env {
  MISSION_DO: DurableObjectNamespace;
  HYDRA_KV: KVNamespace;
  AI?: Ai;
  ADMIN_KEY?: string;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/v1/health') return new Response('ok');
    if (url.pathname === '/v1/register' && req.method === 'POST') return handleRegister(req, env);
    if (url.pathname === '/v1/poll' && req.method === 'GET') return handlePoll(req, env);
    if (url.pathname === '/v1/report' && req.method === 'POST') return handleReport(req, env);
    if (url.pathname === '/v1/success' && req.method === 'POST') return handleSuccess(req, env);
    if (url.pathname === '/v1/admin/mission/start' && req.method === 'POST') {
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
          mission_id,
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
