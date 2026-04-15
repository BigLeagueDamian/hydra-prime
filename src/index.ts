import { handleRegister } from './endpoints/register';
import { handlePoll } from './endpoints/poll';
import { handleReport } from './endpoints/report';
import { handleSuccess } from './endpoints/success';
import { handleAdminStart, handleAdminKill, handleAdminPause, handleAdminExtend } from './endpoints/admin';
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
    const killMatch = url.pathname.match(/^\/v1\/admin\/mission\/([^/]+)\/kill$/);
    if (killMatch && req.method === 'POST') return handleAdminKill(req, env, killMatch[1]!);
    const pauseMatch = url.pathname.match(/^\/v1\/admin\/mission\/([^/]+)\/pause$/);
    if (pauseMatch && req.method === 'POST') return handleAdminPause(req, env, pauseMatch[1]!);
    const extendMatch = url.pathname.match(/^\/v1\/admin\/mission\/([^/]+)\/extend$/);
    if (extendMatch && req.method === 'POST') return handleAdminExtend(req, env, extendMatch[1]!);
    return new Response('not found', { status: 404 });
  },
};
