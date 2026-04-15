import { handleRegister } from './endpoints/register';
import { handlePoll } from './endpoints/poll';
import { handleReport } from './endpoints/report';
import { handleSuccess } from './endpoints/success';
import { handleAdminStart } from './endpoints/admin';
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
    if (url.pathname === '/v1/admin/mission/start' && req.method === 'POST') return handleAdminStart(req, env);
    return new Response('not found', { status: 404 });
  },
};
