import type { ProbeManifest } from '../manifest';

const linux = `
set -eu
cat /etc/hosts 2>/dev/null || true
[ -d /etc/hosts.d ] && for f in /etc/hosts.d/*; do [ -f "$f" ] && cat "$f"; done || true
`;

export const hostsFile: ProbeManifest = {
  id: 'hosts-file',
  platforms: ['linux', 'macos', 'wsl'],
  bodyByPlatform: { linux, macos: linux, wsl: linux },
  outputSchema: { type: 'object', properties: { entries: { type: 'array' } } },
  llrContributions: [
    { pattern: 'target_name_in_hosts', targetHypothesis: 'h:target-address', llr: 6.0 },
  ],
  extractors: [
    // /etc/hosts entries: `IP  hostname [aliases...]`. Capture every
    // non-comment hostname (col 2+); filter via allowlist.
    { pattern: 'target_name_in_hosts', regex: '^\\s*\\d+\\.\\d+\\.\\d+\\.\\d+\\s+(\\S+)', hypothesis: 'h:target-address', filterAllowlist: true },
  ],
  eigPrior: 0.4,
  wallClockEstimateS: 1,
  tokenCostEstimate: 100,
  fallbackProbeIds: ['cloud-cli-enum'],
};
