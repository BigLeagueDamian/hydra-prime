import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { ALL_PROBES } from '../../src/catalog/registry';
import { validateManifest } from '../../src/catalog/manifest';
import { seedCatalog, loadProbe } from '../../src/catalog/seed';

describe('probe registry', () => {
  it.each(ALL_PROBES)('manifest $id validates', (m) => {
    expect(validateManifest(m)).toBeNull();
  });

  it('seedCatalog writes every probe to KV', async () => {
    await seedCatalog(env.HYDRA_KV);
    for (const m of ALL_PROBES) {
      const got = await loadProbe(env.HYDRA_KV, m.id);
      expect(got?.id).toBe(m.id);
    }
  });

  it('loadProbe returns null for unknown id', async () => {
    expect(await loadProbe(env.HYDRA_KV, 'nope')).toBeNull();
  });
});
