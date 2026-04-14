import '@cloudflare/workers-types';

declare module 'cloudflare:test' {
  interface ProvidedEnv {
    HYDRA_KV: KVNamespace;
    MISSION_DO: DurableObjectNamespace;
  }
}
