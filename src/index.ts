export { MissionDO } from './mission-do';

export interface Env {
  MISSION_DO: DurableObjectNamespace;
  HYDRA_KV: KVNamespace;
  AI?: Ai;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/v1/health') return new Response('ok');
    return new Response('not found', { status: 404 });
  },
};
