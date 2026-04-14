import type { ProbeManifest } from './manifest';
import { ALL_PROBES } from './registry';
import { putCatalogEntry, getCatalogEntry } from '../storage';

export async function seedCatalog(kv: KVNamespace): Promise<number> {
  for (const m of ALL_PROBES) {
    await putCatalogEntry(kv, m.id, JSON.stringify(m));
  }
  return ALL_PROBES.length;
}

export async function loadProbe(kv: KVNamespace, id: string): Promise<ProbeManifest | null> {
  const raw = await getCatalogEntry(kv, id);
  if (!raw) return null;
  return JSON.parse(raw) as ProbeManifest;
}
