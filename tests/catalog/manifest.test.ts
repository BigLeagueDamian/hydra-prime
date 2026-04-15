import { describe, it, expect } from 'vitest';
import { isManifest, validateManifest } from '../../src/catalog/manifest';

const valid = {
  id: 'ssh-config-scan',
  platforms: ['linux', 'macos', 'wsl'],
  bodyByPlatform: { linux: 'cat ~/.ssh/config', macos: 'cat ~/.ssh/config', wsl: 'cat ~/.ssh/config' },
  outputSchema: { type: 'object', properties: { hosts: { type: 'array' } } },
  llrContributions: [
    { pattern: 'host_entry_matches_target_name', targetHypothesis: 'h:target-address', llr: 4.0 },
  ],
  eigPrior: 0.6,
  wallClockEstimateS: 2,
  tokenCostEstimate: 0,
  fallbackProbeIds: ['known-hosts-enum'],
};

describe('probe manifest', () => {
  it('isManifest accepts valid', () => {
    expect(isManifest(valid)).toBe(true);
  });

  it('rejects missing platforms', () => {
    expect(isManifest({ ...valid, platforms: [] })).toBe(false);
  });

  it('rejects missing body for declared platform', () => {
    const m = { ...valid, bodyByPlatform: { linux: 'x' } };
    const err = validateManifest(m);
    expect(err).toMatch(/macos/);
  });

  it('rejects negative eigPrior', () => {
    const err = validateManifest({ ...valid, eigPrior: -0.1 });
    expect(err).toMatch(/eigPrior/);
  });
});
