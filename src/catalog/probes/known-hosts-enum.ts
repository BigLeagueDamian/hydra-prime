import type { ProbeManifest } from '../manifest';

const linux = `
set -eu
[ -f "$HOME/.ssh/known_hosts" ] && awk '{print $1}' "$HOME/.ssh/known_hosts" | tr ',' '\\n' | sort -u || true
`;

export const knownHostsEnum: ProbeManifest = {
  id: 'known-hosts-enum',
  platforms: ['linux', 'macos', 'wsl'],
  bodyByPlatform: { linux, macos: linux, wsl: linux },
  outputSchema: { type: 'object', properties: { hosts: { type: 'array' } } },
  llrContributions: [
    { pattern: 'target_name_present', targetHypothesis: 'h:target-address', llr: 3.5 },
    { pattern: 'target_ip_present', targetHypothesis: 'h:target-address', llr: 4.5 },
  ],
  extractors: [
    // Each non-empty line is a hostname-or-ip from known_hosts. Filter via allowlist
    // so noise (every host the user has ever ssh'd into) doesn't pollute the graph.
    // Hostname pattern.
    { pattern: 'target_name_present', regex: '^([A-Za-z][A-Za-z0-9._-]+)\\s*$', hypothesis: 'h:target-address', filterAllowlist: true },
    // IPv4 pattern.
    { pattern: 'target_ip_present', regex: '^(\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3})\\s*$', hypothesis: 'h:target-address', filterAllowlist: true },
  ],
  eigPrior: 0.5,
  wallClockEstimateS: 1,
  tokenCostEstimate: 150,
  fallbackProbeIds: ['hosts-file'],
};
