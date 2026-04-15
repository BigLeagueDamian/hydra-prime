import { describe, it, expect } from 'vitest';
import { env } from 'cloudflare:test';
import { putRateCounter, getRateCounter, putKillFlag, isKilled, putCatalogEntry, getCatalogEntry } from '../src/storage';

describe('storage helpers', () => {
  it('round-trips rate counter', async () => {
    await putRateCounter(env.HYDRA_KV, 'm1:groq', 5);
    expect(await getRateCounter(env.HYDRA_KV, 'm1:groq')).toBe(5);
  });

  it('kill flag default false', async () => {
    expect(await isKilled(env.HYDRA_KV, 'mX')).toBe(false);
  });

  it('kill flag round-trip', async () => {
    await putKillFlag(env.HYDRA_KV, 'm2');
    expect(await isKilled(env.HYDRA_KV, 'm2')).toBe(true);
  });

  it('catalog entry round-trip', async () => {
    await putCatalogEntry(env.HYDRA_KV, 'probe-x', JSON.stringify({ id: 'probe-x' }));
    const got = await getCatalogEntry(env.HYDRA_KV, 'probe-x');
    expect(got).toContain('probe-x');
  });
});
