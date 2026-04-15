import { describe, it, expect } from 'vitest';
import { extractObservations } from '../../src/engine/extract';
import type { ProbeManifest } from '../../src/catalog/manifest';

const sshConfigManifest: ProbeManifest = {
  id: 'ssh-config-scan',
  platforms: ['linux'],
  bodyByPlatform: { linux: '...' },
  outputSchema: {},
  llrContributions: [
    { pattern: 'host_entry_matches_target_name', targetHypothesis: 'h:target-address', llr: 4.0 },
    { pattern: 'host_entry_with_identityfile', targetHypothesis: 'h:target-credentials', llr: 2.5 },
  ],
  extractors: [
    { pattern: 'host_entry_matches_target_name', regex: '^Host\\s+(\\S+)\\s*$', hypothesis: 'h:target-address', filterAllowlist: true },
    { pattern: 'host_entry_with_identityfile', regex: '^\\s*IdentityFile\\s+(\\S+)\\s*$', hypothesis: 'h:target-credentials' },
  ],
  eigPrior: 0.7, wallClockEstimateS: 1, tokenCostEstimate: 0, fallbackProbeIds: [],
};

describe('extractObservations', () => {
  it('emits Host + IdentityFile observations from real ssh config text', () => {
    const stdout = `Host kvm2
  HostName 72.61.65.34
  User root
  IdentityFile ~/.ssh/kvm2_ed25519
  IdentitiesOnly yes`;
    const obs = extractObservations(sshConfigManifest, { stdout }, ['origin', 'kvm2']);
    expect(obs).toContainEqual({
      pattern: 'host_entry_matches_target_name',
      extracted: { value: 'kvm2' },
      hypothesis: 'h:target-address',
    });
    expect(obs).toContainEqual({
      pattern: 'host_entry_with_identityfile',
      extracted: { value: '~/.ssh/kvm2_ed25519' },
      hypothesis: 'h:target-credentials',
    });
  });

  it('filters allowlist-gated extractors', () => {
    const stdout = `Host evil.example.com
Host kvm2
Host other`;
    const obs = extractObservations(sshConfigManifest, { stdout }, ['origin', 'kvm2']);
    const hosts = obs.filter(o => o.pattern === 'host_entry_matches_target_name').map(o => o.extracted.value);
    expect(hosts).toEqual(['kvm2']);
  });

  it('returns empty when stdout has no matches', () => {
    const obs = extractObservations(sshConfigManifest, { stdout: '# nothing here\n' }, ['kvm2']);
    expect(obs).toEqual([]);
  });

  it('returns empty when manifest has no extractors', () => {
    const noExtractors = { ...sshConfigManifest, extractors: undefined };
    expect(extractObservations(noExtractors, { stdout: 'Host kvm2\n' }, ['kvm2'])).toEqual([]);
  });

  it('dedupes identical (pattern, value, hypothesis) tuples', () => {
    const stdout = `Host kvm2
Host kvm2`;
    const obs = extractObservations(sshConfigManifest, { stdout }, ['kvm2']);
    expect(obs.filter(o => o.extracted.value === 'kvm2')).toHaveLength(1);
  });

  it('skips invalid regex without crashing', () => {
    const broken = {
      ...sshConfigManifest,
      extractors: [{ pattern: 'p', regex: '[unclosed', hypothesis: 'h:target-address' }],
    };
    expect(() => extractObservations(broken, { stdout: 'foo' }, [])).not.toThrow();
  });

  it('handles missing stdout gracefully', () => {
    expect(extractObservations(sshConfigManifest, {}, ['kvm2'])).toEqual([]);
  });
});
