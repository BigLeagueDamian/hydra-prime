const RATE_PREFIX = 'rate:';
const KILL_PREFIX = 'kill:';
const CATALOG_PREFIX = 'catalog:';

export async function putRateCounter(kv: KVNamespace, key: string, value: number): Promise<void> {
  await kv.put(RATE_PREFIX + key, String(value));
}

export async function getRateCounter(kv: KVNamespace, key: string): Promise<number> {
  const v = await kv.get(RATE_PREFIX + key);
  return v ? parseInt(v, 10) : 0;
}

export async function incrRateCounter(kv: KVNamespace, key: string, by = 1): Promise<number> {
  const cur = await getRateCounter(kv, key);
  const next = cur + by;
  await putRateCounter(kv, key, next);
  return next;
}

export async function putKillFlag(kv: KVNamespace, missionId: string): Promise<void> {
  await kv.put(KILL_PREFIX + missionId, '1', { expirationTtl: 86_400 * 7 });
}

export async function isKilled(kv: KVNamespace, missionId: string): Promise<boolean> {
  return (await kv.get(KILL_PREFIX + missionId)) === '1';
}

export async function putCatalogEntry(kv: KVNamespace, id: string, json: string): Promise<void> {
  await kv.put(CATALOG_PREFIX + id, json);
}

export async function getCatalogEntry(kv: KVNamespace, id: string): Promise<string | null> {
  return kv.get(CATALOG_PREFIX + id);
}

export async function listCatalogIds(kv: KVNamespace): Promise<string[]> {
  const list = await kv.list({ prefix: CATALOG_PREFIX });
  return list.keys.map(k => k.name.slice(CATALOG_PREFIX.length));
}
